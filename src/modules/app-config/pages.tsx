import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Database,
  Edit3,
  Languages,
  Palette,
  Save,
  Shield,
  X,
} from "lucide-react";
import {
  adminApi,
  managedAppConfigSchema,
  type AppConfig,
  type ManagedAppConfig,
} from "../../core/api";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  StatusPill,
} from "../../design-system/components";
import type { AdminPageProps } from "../../plugin-system/types";

const paletteKeys = [
  "primary",
  "onPrimary",
  "background",
  "surface",
  "surfaceVariant",
  "text",
  "textMuted",
  "border",
  "success",
  "warning",
  "danger",
  "info",
  "pricePositive",
  "priceNegative",
  "risk",
  "focus",
  "backdrop",
] as const;

const paletteLabels: Record<(typeof paletteKeys)[number], string> = {
  primary: "主品牌色",
  onPrimary: "主色前景",
  background: "页面背景",
  surface: "容器背景",
  surfaceVariant: "次级容器",
  text: "主文本",
  textMuted: "次文本",
  border: "边框",
  success: "成功",
  warning: "警告",
  danger: "危险",
  info: "信息",
  pricePositive: "价格上涨",
  priceNegative: "价格下跌",
  risk: "风险",
  focus: "焦点",
  backdrop: "遮罩",
};

const featureLabels: Record<keyof ManagedAppConfig["features"], string> = {
  updateCenter: "升级中心",
  otaEnabled: "OTA 热更新",
  directUpdateEnabled: "Android 直装更新",
  diagnosticsEnabled: "诊断信息",
};

export function AppConfigPage({ tenantId }: AdminPageProps) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["config", tenantId],
    queryFn: () => adminApi.config(tenantId),
  });
  const [draft, setDraft] = useState<ManagedAppConfig | null>(null);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "error" | "success";
    message: string;
  } | null>(null);

  const mutation = useMutation({
    mutationFn: ({
      config,
      expectedVersion,
      changeReason,
    }: {
      config: ManagedAppConfig;
      expectedVersion: number;
      changeReason: string;
    }) => adminApi.saveConfig(tenantId, config, expectedVersion, changeReason),
    onSuccess: (saved) => {
      queryClient.setQueryData<AppConfig>(["config", tenantId], saved);
      void queryClient.invalidateQueries({ queryKey: ["audits", tenantId] });
      setDraft(null);
      setDraftVersion(null);
      setReason("");
      setConfirmOpen(false);
      setFeedback({
        kind: "success",
        message: `配置已激活，数据库版本为 ${saved.metadata.databaseVersion}。`,
      });
    },
    onError: (error) => {
      setConfirmOpen(false);
      setFeedback({ kind: "error", message: `保存失败：${error.message}` });
    },
  });

  if (query.isLoading) return <EmptyState title="正在加载应用配置" />;
  if (query.isError) {
    return (
      <div className="error-banner">
        无法连接 RN-Server：{query.error.message}
      </div>
    );
  }
  const data = query.data;
  if (!data) return <EmptyState title="没有配置" />;

  const beginEdit = () => {
    setDraft(structuredClone(data.config));
    setDraftVersion(data.metadata.databaseVersion);
    setReason("");
    setFeedback(null);
  };
  const cancelEdit = () => {
    setDraft(null);
    setDraftVersion(null);
    setReason("");
    setFeedback(null);
  };
  const updateDraft = (change: (next: ManagedAppConfig) => void) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      change(next);
      return next;
    });
  };
  const save = () => {
    if (!draft || draftVersion === null) return;
    const error = validateDraft(draft, reason);
    if (error) {
      setFeedback({ kind: "error", message: error });
      return;
    }
    setConfirmOpen(true);
  };
  const confirmSave = () => {
    if (!draft || draftVersion === null) return;
    setFeedback(null);
    mutation.mutate({
      config: draft,
      expectedVersion: draftVersion,
      changeReason: reason.trim(),
    });
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">App configuration</div>
          <h1>应用配置</h1>
          <p>统一管理语言、语义主题、Feature Flag 与移动端升级策略。</p>
        </div>
        <div className="heading-actions">
          <StatusPill status={draft ? "editing" : "active"} />
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

      {feedback && (
        <div
          className={
            feedback.kind === "error" ? "error-banner" : "success-banner"
          }
        >
          {feedback.message}
        </div>
      )}

      {draft && draftVersion !== null ? (
        <ConfigEditor
          draft={draft}
          databaseVersion={draftVersion}
          reason={reason}
          saving={mutation.isPending}
          onReasonChange={setReason}
          onChange={updateDraft}
          onCancel={cancelEdit}
          onSave={save}
        />
      ) : (
        <ConfigSummary data={data} />
      )}
      <ConfirmDialog
        open={confirmOpen}
        title="激活应用配置？"
        description="保存后 RN-App 下一次刷新 bootstrap 即会读取新值。此操作会写入配置审计日志。"
        confirmLabel="确认激活"
        loading={mutation.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmSave}
      >
        <div className="dialog-detail-list">
          <span>配置版本：{draft?.configVersion ?? "-"}</span>
          <span>变更原因：{reason.trim() || "未填写"}</span>
        </div>
      </ConfirmDialog>
    </>
  );
}

function ConfigSummary({ data }: { data: AppConfig }) {
  return (
    <Card>
      <div className="card-header">
        <div>
          <h2>当前生效配置</h2>
          <p className="section-caption">数据来源：MySQL · 保存后立即生效</p>
        </div>
        <span className="mono muted">{data.config.configVersion}</span>
      </div>
      <div className="card-body">
        <div className="config-list">
          <div className="config-item">
            <Languages size={18} />
            <strong>国际化语言</strong>
            <span>语言类型、租户文案与发布资源由“多语言管理”维护</span>
          </div>
          <div className="config-item">
            <Palette size={18} />
            <strong>语义主题</strong>
            <span>
              light / dark · palette {data.config.theme.paletteVersion} ·{" "}
              {data.config.theme.allowUserOverride
                ? "允许用户切换"
                : "锁定系统主题"}
            </span>
          </div>
          <div className="config-item">
            <Shield size={18} />
            <strong>Feature Flags</strong>
            <span>
              {Object.entries(data.config.features)
                .filter(([, enabled]) => enabled)
                .map(
                  ([key]) =>
                    featureLabels[key as keyof ManagedAppConfig["features"]],
                )
                .join(" · ") || "全部关闭"}
            </span>
          </div>
          <div className="config-item">
            <Database size={18} />
            <strong>升级与存储</strong>
            <span>
              {data.config.updatePolicy.minSupportedVersion} →{" "}
              {data.config.updatePolicy.latestVersion} · DB v
              {data.metadata.databaseVersion}
            </span>
          </div>
        </div>
        <div className="config-meta">
          <span>最近修改：{data.metadata.updatedBy}</span>
          <span>
            {new Date(data.metadata.updatedAt).toLocaleString("zh-CN")}
          </span>
          <span>缓存 TTL：{data.config.ttlSeconds} 秒</span>
        </div>
      </div>
    </Card>
  );
}

function ConfigEditor({
  draft,
  databaseVersion,
  reason,
  saving,
  onReasonChange,
  onChange,
  onCancel,
  onSave,
}: {
  draft: ManagedAppConfig;
  databaseVersion: number;
  reason: string;
  saving: boolean;
  onReasonChange: (value: string) => void;
  onChange: (change: (next: ManagedAppConfig) => void) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="config-editor">
      <Card>
        <div className="card-header">
          <div>
            <h2>基础配置</h2>
            <p className="section-caption">
              编辑基于数据库版本 v{databaseVersion}
            </p>
          </div>
        </div>
        <div className="card-body form-grid form-grid-3">
          <Field label="配置版本" hint="用于 App 缓存失效与问题定位">
            <input
              className="input"
              value={draft.configVersion}
              onChange={(event) =>
                onChange((next) => {
                  next.configVersion = event.target.value;
                })
              }
            />
          </Field>
          <Field label="缓存 TTL（秒）" hint="允许范围 30 - 86400">
            <input
              className="input"
              type="number"
              min={30}
              max={86400}
              value={draft.ttlSeconds}
              onChange={(event) =>
                onChange((next) => {
                  next.ttlSeconds = Number(event.target.value);
                })
              }
            />
          </Field>
          <Field label="状态页地址" hint="必须是 HTTPS/HTTP 完整 URL">
            <input
              className="input"
              type="url"
              value={draft.support.statusPageUrl}
              onChange={(event) =>
                onChange((next) => {
                  next.support.statusPageUrl = event.target.value;
                })
              }
            />
          </Field>
        </div>
      </Card>

      <Card>
        <div className="card-header">
          <div>
            <h2>语义主题</h2>
            <p className="section-caption">语义色会随 bootstrap 下发至 App</p>
          </div>
          <label className="switch-row compact-switch">
            <input
              type="checkbox"
              checked={draft.theme.allowUserOverride}
              onChange={(event) =>
                onChange((next) => {
                  next.theme.allowUserOverride = event.target.checked;
                })
              }
            />
            <span>允许用户切换主题</span>
          </label>
        </div>
        <div className="card-body">
          <Field label="调色板版本">
            <input
              className="input palette-version-input"
              value={draft.theme.paletteVersion}
              onChange={(event) =>
                onChange((next) => {
                  next.theme.paletteVersion = event.target.value;
                })
              }
            />
          </Field>
          <div className="palette-columns">
            {(["light", "dark"] as const).map((mode) => (
              <div className="palette-panel" key={mode}>
                <h3>{mode === "light" ? "Light Palette" : "Dark Palette"}</h3>
                <div className="palette-grid">
                  {paletteKeys.map((key) => (
                    <label className="palette-field" key={key}>
                      <span>{paletteLabels[key]}</span>
                      <div className="color-input-row">
                        <i style={{ background: draft.theme[mode][key] }} />
                        <input
                          className="input mono"
                          value={draft.theme[mode][key]}
                          onChange={(event) =>
                            onChange((next) => {
                              next.theme[mode][key] = event.target.value;
                            })
                          }
                        />
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="config-two-column">
        <Card>
          <div className="card-header">
            <div>
              <h2>Feature Flags</h2>
              <p className="section-caption">关闭后客户端采用安全失败值</p>
            </div>
          </div>
          <div className="card-body switch-list">
            {(
              Object.keys(
                featureLabels,
              ) as (keyof ManagedAppConfig["features"])[]
            ).map((key) => (
              <label className="switch-row" key={key}>
                <span>
                  <strong>{featureLabels[key]}</strong>
                  <small className="mono">{key}</small>
                </span>
                <input
                  type="checkbox"
                  checked={draft.features[key]}
                  onChange={(event) =>
                    onChange((next) => {
                      next.features[key] = event.target.checked;
                    })
                  }
                />
              </label>
            ))}
          </div>
        </Card>

        <Card>
          <div className="card-header">
            <div>
              <h2>升级策略</h2>
              <p className="section-caption">支持商店、直装、MDM 与 OTA 分发</p>
            </div>
          </div>
          <div className="card-body form-stack">
            <Field label="最低支持版本" hint="低于此版本会触发强制升级决策">
              <input
                className="input"
                value={draft.updatePolicy.minSupportedVersion}
                onChange={(event) =>
                  onChange((next) => {
                    next.updatePolicy.minSupportedVersion = event.target.value;
                  })
                }
              />
            </Field>
            <Field label="最新版本">
              <input
                className="input"
                value={draft.updatePolicy.latestVersion}
                onChange={(event) =>
                  onChange((next) => {
                    next.updatePolicy.latestVersion = event.target.value;
                  })
                }
              />
            </Field>
            <Field label="OTA Channel">
              <input
                className="input"
                value={draft.updatePolicy.otaChannel}
                onChange={(event) =>
                  onChange((next) => {
                    next.updatePolicy.otaChannel = event.target.value;
                  })
                }
              />
            </Field>
          </div>
        </Card>
      </div>

      <Card className="save-card">
        <div className="card-body save-layout">
          <Field label="修改原因" hint="至少 3 个字符，将写入审计日志">
            <textarea
              className="input textarea"
              value={reason}
              placeholder="例如：调整生产环境 OTA 渠道并更新双语文案"
              onChange={(event) => onReasonChange(event.target.value)}
            />
          </Field>
          <div className="save-actions">
            <Button
              variant="ghost"
              type="button"
              onClick={onCancel}
              disabled={saving}
            >
              取消
            </Button>
            <Button type="button" onClick={onSave} disabled={saving}>
              <Save size={16} />
              {saving ? "正在保存…" : "校验并立即激活"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function validateDraft(
  config: ManagedAppConfig,
  reason: string,
): string | null {
  const parsed = managedAppConfigSchema.safeParse(config);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return `请检查 ${issue.path.join(".") || "配置"}：${issue.message}`;
  }
  const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
  if (!semver.test(config.updatePolicy.minSupportedVersion)) {
    return "最低支持版本必须使用 SemVer，例如 1.2.0。";
  }
  if (!semver.test(config.updatePolicy.latestVersion)) {
    return "最新版本必须使用 SemVer，例如 1.2.0。";
  }
  if (
    compareVersions(
      config.updatePolicy.minSupportedVersion,
      config.updatePolicy.latestVersion,
    ) > 0
  ) {
    return "最低支持版本不能高于最新版本。";
  }
  if (reason.trim().length < 3) return "请填写至少 3 个字符的修改原因。";
  return null;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split("-")[0].split(".").map(Number);
  const rightParts = right.split("-")[0].split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}
