import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, PlugZap, Save, X } from "lucide-react";
import {
  adminApi,
  type AppConfig,
  type PredictProbe,
  type PredictService,
} from "../../core/api";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  FeedbackNotice,
  FormValidationSummary,
  SelectField,
  StatusPill,
  focusFirstInvalidField,
  type FormValidationError,
} from "../../design-system/components";
import type { AdminPageProps } from "../../plugin-system/types";

/**
 * 预测市场：本租户与预测平台上租户的关联。
 *
 * 两边的租户 id **不假定相同**，关联只靠这里填的三项：平台接口域名、平台 scopeId、
 * 我们这边启用的链。它们决定 App 把用户的登录凭证发到哪里，所以保存前必须「测试连接」：
 * 服务端去请求平台的 public-info，比对 scopeId 与链，对不上不让存。
 * 存在 mobile-bootstrap 配置的 services.predict 里，随 bootstrap 下发；predict 模块
 * 关着时不下发。
 */

const hostnamePattern =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const scopeIdPattern = /^0x[0-9a-f]{64}$/;

type PredictDraft = {
  enabled: boolean;
  domain: string;
  scopeId: string;
  chain: string;
};

function draftFrom(view: AppConfig): PredictDraft {
  const predict = view.config.services.predict;
  return {
    enabled: view.config.modules.predict,
    domain: predict?.domain ?? "",
    scopeId: predict?.scopeId ?? "",
    chain: predict?.chain ?? "",
  };
}

/** 测试连接的结果只对当时的三个值有效：改了任何一个就要重新测。 */
function probeKey(draft: PredictDraft): string {
  return `${draft.domain.trim().toLowerCase()}|${draft.scopeId.trim().toLowerCase()}|${draft.chain}`;
}

function serviceFrom(draft: PredictDraft): PredictService {
  return {
    domain: draft.domain.trim().toLowerCase(),
    scopeId: draft.scopeId.trim().toLowerCase(),
    chain: draft.chain,
  };
}

function hasAnyValue(draft: PredictDraft): boolean {
  return (
    draft.domain.trim() !== "" ||
    draft.scopeId.trim() !== "" ||
    draft.chain !== ""
  );
}

function predictProblems(
  draft: PredictDraft,
  enabledChains: string[],
  probeOkFor: string | null,
): FormValidationError[] {
  const problems: FormValidationError[] = [];
  // 模块关着且三项全空 = 没有关联，允许；填了任何一项就按完整规则校验
  if (!draft.enabled && !hasAnyValue(draft)) return problems;
  const domain = draft.domain.trim().toLowerCase();
  if (!hostnamePattern.test(domain))
    problems.push({
      field: "平台接口域名",
      message:
        "只填主机名，例如 predict.example.com，不含协议、端口和路径。App 会按平台规则从它派生全部服务地址。",
      targetId: "predict-domain",
    });
  if (!scopeIdPattern.test(draft.scopeId.trim().toLowerCase()))
    problems.push({
      field: "平台 scopeId",
      message: "格式应为 0x 开头加 64 位十六进制，来自平台租户后台。",
      targetId: "predict-scope",
    });
  if (!enabledChains.includes(draft.chain))
    problems.push({
      field: "链",
      message: "必须选一条本租户已启用的链，并与平台上这个租户所在的链一致。",
      targetId: "predict-chain",
    });
  if (problems.length === 0 && probeOkFor !== probeKey(draft))
    problems.push({
      field: "测试连接",
      message: "保存前先点「测试连接」，服务端会比对平台返回的 scopeId 与链。",
      targetId: "predict-probe",
    });
  return problems;
}

export function PredictPlatformPage({ tenantId }: AdminPageProps) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["config", tenantId],
    queryFn: () => adminApi.config(tenantId),
    staleTime: 15_000,
  });
  const [draft, setDraft] = useState<PredictDraft | null>(null);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [probe, setProbe] = useState<{
    key: string;
    result: PredictProbe;
  } | null>(null);
  const [probeError, setProbeError] = useState("");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [saveComposerOpen, setSaveComposerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [problems, setProblems] = useState<FormValidationError[]>([]);
  const [feedback, setFeedback] = useState<{
    kind: "error" | "success";
    message: string;
  } | null>(null);

  const probeMutation = useMutation({
    mutationFn: (service: PredictService) => adminApi.probePredict(service),
    onSuccess: (result, service) => {
      setProbeError("");
      setProbe({
        key: `${service.domain}|${service.scopeId}|${service.chain}`,
        result,
      });
    },
    onError: (error) => {
      setProbe(null);
      setProbeError(error.message);
    },
  });

  const mutation = useMutation({
    mutationFn: ({
      next,
      expectedVersion,
      changeReason,
    }: {
      next: PredictDraft;
      expectedVersion: number;
      changeReason: string;
    }) => {
      const current = query.data;
      if (!current) throw new Error("配置尚未加载");
      const predict = hasAnyValue(next) ? serviceFrom(next) : undefined;
      return adminApi.saveConfig(
        tenantId,
        {
          ...current.config,
          // 钱包段由「钱包与链」页维护，省略即沿用库里的
          wallet: undefined,
          modules: { ...current.config.modules, predict: next.enabled },
          services: { ...current.config.services, predict },
        },
        expectedVersion,
        changeReason,
      );
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<AppConfig>(["config", tenantId], saved);
      void queryClient.invalidateQueries({ queryKey: ["audits", tenantId] });
      setDraft(null);
      setDraftVersion(null);
      setReason("");
      setReasonError("");
      setSaveComposerOpen(false);
      setConfirmOpen(false);
      setProblems([]);
      setFeedback({
        kind: "success",
        message: `预测市场配置已激活，数据库版本为 ${saved.metadata.databaseVersion}；App 下一次刷新 bootstrap 即生效。`,
      });
    },
    onError: (error) => {
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["config", tenantId] });
      setFeedback({ kind: "error", message: `保存失败：${error.message}` });
    },
  });

  if (query.isLoading) return <EmptyState title="正在加载预测市场配置" />;
  if (query.isError)
    return (
      <div className="error-banner">
        无法连接 RN-Server：{query.error.message}
      </div>
    );
  const data = query.data;
  if (!data) return <EmptyState title="没有配置" />;
  const catalog = data.metadata.walletCatalog;
  const enabledChains = data.config.wallet.chains;
  const chainName = (id: string) => {
    const entry = catalog.find((item) => item.id === id);
    if (!entry) return id;
    return entry.testnet ? `${entry.name} · 测试网` : entry.name;
  };

  const beginEdit = () => {
    setDraft(draftFrom(data));
    setDraftVersion(data.metadata.databaseVersion);
    setProbe(null);
    setProbeError("");
    setReason("");
    setReasonError("");
    setSaveComposerOpen(false);
    setProblems([]);
    setFeedback(null);
  };
  const cancelEdit = () => {
    setDraft(null);
    setDraftVersion(null);
    setProbe(null);
    setProbeError("");
    setSaveComposerOpen(false);
    setProblems([]);
  };
  const updateDraft = (change: (next: PredictDraft) => void) => {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current };
      change(next);
      return next;
    });
    setProblems([]);
  };
  const runProbe = () => {
    if (!draft) return;
    const found = predictProblems(draft, enabledChains, probeKey(draft)).filter(
      (item) => item.targetId !== "predict-probe",
    );
    setProblems(found);
    if (found.length > 0) {
      focusFirstInvalidField('[aria-invalid="true"]');
      return;
    }
    probeMutation.mutate(serviceFrom(draft));
  };
  const probeOkFor = probe && probe.result.ok ? probe.key : null;
  const openSaveComposer = () => {
    if (!draft) return;
    const found = predictProblems(draft, enabledChains, probeOkFor);
    setProblems(found);
    if (found.length > 0) return;
    setReasonError("");
    setSaveComposerOpen(true);
  };
  const continueSave = () => {
    if (reason.trim().length < 3) {
      setReasonError("请填写至少 3 个字符的修改原因。");
      return;
    }
    setReasonError("");
    setConfirmOpen(true);
  };
  const confirmSave = () => {
    if (!draft || draftVersion === null) return;
    setFeedback(null);
    mutation.mutate({
      next: draft,
      expectedVersion: draftVersion,
      changeReason: reason.trim(),
    });
  };

  const current = data.config.services.predict;
  const status = draft
    ? "editing"
    : data.config.modules.predict
      ? current
        ? "configured"
        : "required"
      : "configured";

  return (
    <>
      <FeedbackNotice
        kind={feedback?.kind ?? "success"}
        message={feedback?.message ?? ""}
        placement="viewport"
        onDismiss={() => setFeedback(null)}
      />
      <div className="page-heading">
        <div>
          <div className="eyebrow">Prediction market</div>
          <h1>预测市场</h1>
          <p>
            本租户与预测平台上租户的关联：平台接口域名、平台
            scopeId、所用的链。两边的租户 id
            不假定相同，关联只靠这三项；它们决定 App
            把用户的登录凭证发到哪里，保存前必须测试连接。
          </p>
        </div>
        <div className="heading-actions">
          <StatusPill status={status} />
          {draft ? (
            <Button
              variant="ghost"
              onClick={cancelEdit}
              disabled={mutation.isPending}
            >
              <X size={16} />
              取消编辑
            </Button>
          ) : (
            <Button onClick={beginEdit}>
              <Edit3 size={16} />
              编辑配置
            </Button>
          )}
        </div>
      </div>

      {draft && draftVersion !== null ? (
        <div className="card">
          <div className="card-body form-grid" data-testid="predict-editor">
            <FormValidationSummary errors={problems} />
            <label className="switch-row">
              <span>
                <strong>开启预测市场模块</strong>
                <small className="mono">modules.predict</small>
              </span>
              <input
                id="predict-enabled"
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) =>
                  updateDraft((next) => {
                    next.enabled = event.target.checked;
                  })
                }
              />
            </label>
            <label className="form-field">
              <span>平台接口域名</span>
              <input
                id="predict-domain"
                className="input"
                value={draft.domain}
                placeholder="predict.example.com"
                aria-invalid={problems.some(
                  (item) => item.targetId === "predict-domain",
                )}
                onChange={(event) =>
                  updateDraft((next) => {
                    next.domain = event.target.value;
                  })
                }
              />
              <small>
                只填主机名。App 按平台规则派生 gamma-api / clob-api / data-api /
                relayer / clob-ws / faucet 六个子域。
              </small>
            </label>
            <label className="form-field">
              <span>平台 scopeId</span>
              <input
                id="predict-scope"
                className="input mono"
                value={draft.scopeId}
                placeholder="0x…（64 位十六进制）"
                aria-invalid={problems.some(
                  (item) => item.targetId === "predict-scope",
                )}
                onChange={(event) =>
                  updateDraft((next) => {
                    next.scopeId = event.target.value;
                  })
                }
              />
              <small>
                平台租户后台里的 scopeId；它出现在平台所有签名与凭证里。
              </small>
            </label>
            <SelectField
              id="predict-chain"
              label="链"
              hint="只能选本租户已启用的链，且要与平台上这个租户所在的链一致。"
              value={draft.chain}
              aria-invalid={problems.some(
                (item) => item.targetId === "predict-chain",
              )}
              onChange={(event) =>
                updateDraft((next) => {
                  next.chain = event.target.value;
                })
              }
            >
              <option value="">请选择</option>
              {enabledChains.map((id) => (
                <option key={id} value={id}>
                  {chainName(id)}
                </option>
              ))}
            </SelectField>
            <div className="form-actions">
              <Button
                id="predict-probe"
                variant="ghost"
                onClick={runProbe}
                disabled={probeMutation.isPending}
              >
                <PlugZap size={16} />
                {probeMutation.isPending ? "正在测试…" : "测试连接"}
              </Button>
            </div>
            {probeError && (
              <div className="error-banner" role="alert">
                测试连接失败：{probeError}
              </div>
            )}
            {probe && (
              <div
                className={probe.result.ok ? "success-banner" : "error-banner"}
                role="status"
                data-testid="predict-probe-result"
              >
                <strong>
                  {probe.result.ok ? "连接正常" : "平台返回的信息与所填不一致"}
                </strong>
                <div className="dialog-detail-list">
                  <span>品牌：{probe.result.brand || "-"}</span>
                  <span>
                    链：{probe.result.chainName}（chainId {probe.result.chainId}
                    ）
                  </span>
                  <span className="mono">scopeId：{probe.result.scopeId}</span>
                  {probe.result.problems.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
            )}
            {saveComposerOpen ? (
              <div className="save-composer">
                <label className="form-field">
                  <span>修改原因</span>
                  <input
                    id="predict-reason"
                    className="input"
                    value={reason}
                    aria-invalid={reasonError !== ""}
                    onChange={(event) => {
                      setReason(event.target.value);
                      if (reasonError) setReasonError("");
                    }}
                  />
                  {reasonError && (
                    <small className="error">{reasonError}</small>
                  )}
                </label>
                <div className="form-actions">
                  <Button
                    variant="ghost"
                    onClick={() => setSaveComposerOpen(false)}
                  >
                    返回
                  </Button>
                  <Button onClick={continueSave} disabled={mutation.isPending}>
                    <Save size={16} />
                    继续
                  </Button>
                </div>
              </div>
            ) : (
              <div className="form-actions">
                <Button
                  onClick={openSaveComposer}
                  disabled={mutation.isPending}
                >
                  <Save size={16} />
                  保存并激活
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="card">
          <div
            className="card-body dialog-detail-list"
            data-testid="predict-overview"
          >
            <span>
              预测市场模块：
              {data.config.modules.predict ? "已开启" : "已关闭"}
            </span>
            <span>平台接口域名：{current?.domain ?? "未配置"}</span>
            <span className="mono">
              平台 scopeId：{current?.scopeId ?? "未配置"}
            </span>
            <span>链：{current ? chainName(current.chain) : "未配置"}</span>
            {data.config.modules.predict && !current && (
              <span className="error">
                模块已开启但没有平台关联：服务端不会下发
                bootstrap（503），请先配置。
              </span>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="激活预测市场配置？"
        description="保存后 App 下一次刷新 bootstrap 即读取新的平台关联；已登录用户的预测凭证会按新平台重新建立。此操作会写入配置审计日志。"
        confirmLabel="确认激活"
        loading={mutation.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmSave}
      >
        <div className="dialog-detail-list">
          <span>修改原因：{reason.trim()}</span>
          <span>模块：{draft?.enabled ? "开启" : "关闭"}</span>
          <span>域名：{draft?.domain.trim() || "-"}</span>
          <span>链：{draft ? chainName(draft.chain) : "-"}</span>
        </div>
      </ConfirmDialog>
    </>
  );
}
