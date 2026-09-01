import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, RotateCcw, Save, X } from "lucide-react";
import {
  adminApi,
  type AppConfig,
  type WalletCatalogEntry,
  type WalletSection,
} from "../../core/api";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FeedbackNotice,
  StatusPill,
} from "../../design-system/components";
import type { AdminPageProps } from "../../plugin-system/types";

/**
 * 钱包与链：租户级的 WalletConnect Project ID 与每条链的端点。
 *
 * 这一段和主题、Feature Flag 一样存在 `mobile-bootstrap` 配置里，App 启动时随
 * bootstrap 下发，改完不需要重新打包。链目录由服务端给（`metadata.walletCatalog`），
 * 管理端不再自己抄一份链表——两份链表迟早会不一致。
 */

const projectIdPattern = /^[0-9a-zA-Z]{16,64}$/;

function isHttps(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("https://") && trimmed.length > "https://".length;
}

function catalogFrom(view: AppConfig): WalletCatalogEntry[] {
  if (view.metadata.walletCatalog.length > 0)
    return view.metadata.walletCatalog;
  // 老服务端没有目录字段：退回到配置里已有的链，至少还能改端点
  return view.config.wallet.networks.map((network) => ({
    id: network.id,
    name: network.id.toUpperCase(),
    chainId: network.chainId,
    defaultRpcUrls: [],
    defaultExplorerUrl: "",
    // 老服务端没有目录，无从判断是不是测试网，按主网处理最保守
    testnet: false,
  }));
}

function draftFrom(view: AppConfig, catalog: WalletCatalogEntry[]) {
  const wallet = view.config.wallet;
  return {
    walletConnectProjectId: wallet.walletConnectProjectId,
    enabled: new Set(
      wallet.chains.length > 0
        ? wallet.chains
        : wallet.networks.map((network) => network.id),
    ),
    endpoints: Object.fromEntries(
      catalog.map((chain) => {
        const saved = wallet.networks.find(
          (network) => network.id === chain.id,
        );
        const isDefaultRpc =
          saved !== undefined &&
          saved.rpcUrls.join("\n") === chain.defaultRpcUrls.join("\n");
        const isDefaultExplorer =
          saved !== undefined && saved.explorerUrl === chain.defaultExplorerUrl;
        return [
          chain.id,
          {
            // 和平台默认一致时显示为空，让"留空即默认"和界面看到的一致
            rpcText: isDefaultRpc ? "" : (saved?.rpcUrls.join("\n") ?? ""),
            explorerUrl: isDefaultExplorer ? "" : (saved?.explorerUrl ?? ""),
          },
        ];
      }),
    ),
  };
}

type WalletDraft = ReturnType<typeof draftFrom>;

function rpcLines(text: string): string[] {
  // 去空行、去空格、去重：重复的端点只是多一次无意义的重试
  return Array.from(
    new Set(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    ),
  );
}

function chainClass(id: string): string {
  return `wallet-chain-${id.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
}

/** 校验用租户看得懂的话说明问题，措辞与服务端保持一致。 */
function walletProblems(
  draft: WalletDraft,
  catalog: WalletCatalogEntry[],
): string[] {
  const problems: string[] = [];
  const projectId = draft.walletConnectProjectId.trim();
  if (projectId !== "" && !projectIdPattern.test(projectId))
    problems.push(
      "Project ID 格式不对：应为 cloud.reown.com 上的 Project ID（16-64 位字母数字），不要填入完整链接。",
    );
  if (draft.enabled.size === 0)
    problems.push("至少要启用一条链，否则 App 里的钱包无链可用。");
  for (const chain of catalog) {
    if (!draft.enabled.has(chain.id)) continue;
    const endpoint = draft.endpoints[chain.id];
    if (!endpoint) continue;
    for (const url of rpcLines(endpoint.rpcText)) {
      if (!isHttps(url)) {
        problems.push(
          `${chain.name} 的 RPC 端点必须是 https:// 开头的完整地址：明文 RPC 会泄露用户查询的每个地址和余额。`,
        );
        break;
      }
    }
    if (endpoint.explorerUrl.trim() !== "" && !isHttps(endpoint.explorerUrl))
      problems.push(
        `${chain.name} 的区块浏览器地址必须是 https:// 开头的完整地址。`,
      );
  }
  return problems;
}

function walletSectionFrom(
  draft: WalletDraft,
  catalog: WalletCatalogEntry[],
): WalletSection {
  const chains = catalog
    .filter((chain) => draft.enabled.has(chain.id))
    .map((chain) => chain.id);
  return {
    walletConnectProjectId: draft.walletConnectProjectId.trim(),
    chains,
    networks: catalog
      .filter((chain) => draft.enabled.has(chain.id))
      .map((chain) => {
        const endpoint = draft.endpoints[chain.id];
        const custom = rpcLines(endpoint?.rpcText ?? "");
        const explorer = (endpoint?.explorerUrl ?? "").trim();
        return {
          id: chain.id,
          // chainId 由平台目录决定，界面上只读
          chainId: chain.chainId,
          // 留空就存空：服务端读的时候会填平台默认。把当前默认值抄进租户配置
          // 会把它固化成快照，平台以后换默认端点这个租户就跟不上了
          rpcUrls: custom,
          explorerUrl: explorer,
        };
      }),
  };
}

export function WalletChainsPage({ tenantId }: AdminPageProps) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["config", tenantId],
    queryFn: () => adminApi.config(tenantId),
    staleTime: 15_000,
  });
  const [draft, setDraft] = useState<WalletDraft | null>(null);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [saveComposerOpen, setSaveComposerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{
    kind: "error" | "success";
    message: string;
  } | null>(null);

  const mutation = useMutation({
    mutationFn: ({
      wallet,
      expectedVersion,
      changeReason,
    }: {
      wallet: WalletSection;
      expectedVersion: number;
      changeReason: string;
    }) => {
      const current = query.data;
      if (!current) throw new Error("配置尚未加载");
      return adminApi.saveConfig(
        tenantId,
        { ...current.config, wallet },
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
        message: `钱包配置已激活，数据库版本为 ${saved.metadata.databaseVersion}；App 在缓存 ${saved.config.ttlSeconds} 秒后刷新 bootstrap 即生效。`,
      });
    },
    onError: (error) => {
      setConfirmOpen(false);
      // 乐观锁冲突之后本地版本号已经过期，不刷新的话再点一次还是 409
      void queryClient.invalidateQueries({ queryKey: ["config", tenantId] });
      setFeedback({ kind: "error", message: `保存失败：${error.message}` });
    },
  });

  if (query.isLoading) return <EmptyState title="正在加载钱包配置" />;
  if (query.isError)
    return (
      <div className="error-banner">
        无法连接 RN-Server：{query.error.message}
      </div>
    );
  const data = query.data;
  if (!data) return <EmptyState title="没有钱包配置" />;
  const catalog = catalogFrom(data);

  const beginEdit = () => {
    setDraft(draftFrom(data, catalog));
    setDraftVersion(data.metadata.databaseVersion);
    setReason("");
    setReasonError("");
    setSaveComposerOpen(false);
    setProblems([]);
    setFeedback(null);
  };
  const cancelEdit = () => {
    setDraft(null);
    setDraftVersion(null);
    setSaveComposerOpen(false);
    setProblems([]);
    setFeedback(null);
  };
  const updateDraft = (change: (next: WalletDraft) => void) => {
    setDraft((current) => {
      if (!current) return current;
      const next: WalletDraft = {
        walletConnectProjectId: current.walletConnectProjectId,
        enabled: new Set(current.enabled),
        endpoints: Object.fromEntries(
          Object.entries(current.endpoints).map(([id, value]) => [
            id,
            { ...value },
          ]),
        ),
      };
      change(next);
      return next;
    });
    setProblems([]);
  };
  const openSaveComposer = () => {
    if (!draft) return;
    const found = walletProblems(draft, catalog);
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
      wallet: walletSectionFrom(draft, catalog),
      expectedVersion: draftVersion,
      changeReason: reason.trim(),
    });
  };

  const configured = data.config.wallet.walletConnectProjectId.trim() !== "";
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
          <div className="eyebrow">Wallet &amp; chains</div>
          <h1>钱包与链</h1>
          <p>
            配置 WalletConnect 项目与每条链的 RPC、区块浏览器地址。App 启动时随
            bootstrap 下发，改完无需重新打包。
          </p>
        </div>
        <div className="heading-actions">
          <StatusPill
            status={draft ? "editing" : configured ? "configured" : "required"}
          />
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

      {catalog.length === 0 ? (
        <EmptyState
          title="服务端没有下发链目录"
          detail="升级 RN-Server 后这里会列出平台支持的链。"
        />
      ) : draft && draftVersion !== null ? (
        <WalletEditor
          draft={draft}
          catalog={catalog}
          databaseVersion={draftVersion}
          problems={problems}
          reason={reason}
          reasonError={reasonError}
          saveComposerOpen={saveComposerOpen}
          saving={mutation.isPending}
          onChange={updateDraft}
          onReasonChange={(value) => {
            setReason(value);
            if (reasonError) setReasonError("");
          }}
          onCancel={cancelEdit}
          onOpenSave={openSaveComposer}
          onCloseSave={() => {
            setSaveComposerOpen(false);
            setReasonError("");
          }}
          onContinueSave={continueSave}
        />
      ) : (
        <WalletOverview data={data} catalog={catalog} />
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="激活钱包配置？"
        description="保存后 RN-App 下一次刷新 bootstrap 即会读取新的 Project ID 与链端点。此操作会写入配置审计日志。"
        confirmLabel="确认激活"
        loading={mutation.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmSave}
      >
        <div className="dialog-detail-list">
          <span>修改原因：{reason.trim()}</span>
          <span>
            启用的链：
            {catalog
              .filter((chain) => draft?.enabled.has(chain.id))
              .map((chain) => chain.name)
              .join("、") || "-"}
          </span>
        </div>
      </ConfirmDialog>
    </>
  );
}

function WalletOverview({
  data,
  catalog,
}: {
  data: AppConfig;
  catalog: WalletCatalogEntry[];
}) {
  const wallet = data.config.wallet;
  const projectId = wallet.walletConnectProjectId.trim();
  const enabled = catalog.filter(
    (chain) =>
      wallet.chains.includes(chain.id) ||
      wallet.networks.some((network) => network.id === chain.id),
  );
  return (
    <div className="config-editor">
      <Card>
        <div className="card-header">
          <div>
            <h2>WalletConnect 项目</h2>
            <p className="section-caption">
              App 里"连接外部钱包"（MetaMask、TokenPocket 等）依赖这个 Project
              ID
            </p>
          </div>
          <StatusPill status={projectId ? "configured" : "required"} />
        </div>
        <div className="card-body">
          <div className="metric-grid wallet-project-metrics">
            <div className="metric">
              <div className="metric-label">Project ID</div>
              <div
                className="metric-value mono wallet-project-id"
                data-testid="wallet-project-id"
              >
                {projectId || "未配置"}
              </div>
              <div className="metric-caption">
                {projectId
                  ? "来自 cloud.reown.com，随 bootstrap 下发给 App"
                  : "留空时 App 内“连接外部钱包”入口不可用，内置钱包不受影响"}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">启用的链</div>
              <div className="metric-value">{enabled.length}</div>
              <div className="metric-caption">
                {enabled.map((chain) => chain.name).join("、") || "未启用"}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="card-header">
          <div>
            <h2>链与端点</h2>
            <p className="section-caption">
              未自定义的链使用平台默认端点（公共节点，有速率限制）
            </p>
          </div>
        </div>
        {enabled.length === 0 ? (
          <div className="card-body">
            <EmptyState
              title="还没有启用任何链"
              detail="点击右上角“编辑配置”开启至少一条链。"
            />
          </div>
        ) : (
          <div className="card-body config-list">
            {enabled.map((chain) => {
              const network = wallet.networks.find(
                (item) => item.id === chain.id,
              );
              const custom =
                network !== undefined &&
                network.rpcUrls.join("\n") !== chain.defaultRpcUrls.join("\n");
              return (
                <div
                  className={`config-item wallet-chain-card ${chainClass(chain.id)}`}
                  key={chain.id}
                >
                  <div className="wallet-chain-card-heading">
                    <strong>{chain.name}</strong>
                    <span className="wallet-chain-badge">{chain.id}</span>
                  </div>
                  <span className="mono wallet-chain-meta">
                    chainId {chain.chainId}
                  </span>
                  <strong className="mono wallet-endpoint-value">
                    {network?.rpcUrls.join("、") || "-"}
                  </strong>
                  <span
                    className={
                      custom
                        ? "wallet-endpoint-source is-custom"
                        : "wallet-endpoint-source"
                    }
                  >
                    {custom ? "租户自定义 RPC" : "平台默认 RPC"}
                  </span>
                  <span className="mono wallet-endpoint-value">
                    {network?.explorerUrl || chain.defaultExplorerUrl || "-"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className="config-meta">
          <span>数据库版本 v{data.metadata.databaseVersion}</span>
          <span>最后修改：{data.metadata.updatedBy}</span>
        </div>
      </Card>
    </div>
  );
}

function WalletEditor({
  draft,
  catalog,
  databaseVersion,
  problems,
  reason,
  reasonError,
  saveComposerOpen,
  saving,
  onChange,
  onReasonChange,
  onCancel,
  onOpenSave,
  onCloseSave,
  onContinueSave,
}: {
  draft: WalletDraft;
  catalog: WalletCatalogEntry[];
  databaseVersion: number;
  problems: string[];
  reason: string;
  reasonError: string;
  saveComposerOpen: boolean;
  saving: boolean;
  onChange: (change: (next: WalletDraft) => void) => void;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
  onOpenSave: () => void;
  onCloseSave: () => void;
  onContinueSave: () => void;
}) {
  const projectId = draft.walletConnectProjectId.trim();
  const projectIdInvalid =
    projectId !== "" && !projectIdPattern.test(projectId);
  const lastEnabled = draft.enabled.size === 1;
  return (
    <div className="config-editor">
      <Card>
        <div className="card-header">
          <div>
            <h2>WalletConnect 项目</h2>
            <p className="section-caption">
              编辑基于数据库版本 v{databaseVersion}
            </p>
          </div>
        </div>
        <div className="card-body form-stack">
          <label className="form-field">
            <span>Project ID</span>
            <input
              className="input mono"
              value={draft.walletConnectProjectId}
              aria-invalid={projectIdInvalid}
              placeholder="例如 3f8a2c1d9e4b6a70f2c5d8e1b4a70932"
              onChange={(event) =>
                onChange((next) => {
                  next.walletConnectProjectId = event.target.value;
                })
              }
            />
            {projectIdInvalid ? (
              <small className="field-error">
                应为 16-64 位字母数字，不要填入完整链接。
              </small>
            ) : (
              <small>
                在 cloud.reown.com 新建 <strong>AppKit</strong>{" "}
                类型项目后复制，用于 App 端连接外部钱包。这不是密钥，会随
                bootstrap 下发给所有客户端——不要把任何 Secret 填在这里。
              </small>
            )}
          </label>
          {projectId === "" ? (
            <p className="section-caption">
              留空是允许的：App 内“连接外部钱包”入口会隐藏，内置钱包（创建 /
              导入助记词）不受影响。
            </p>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="card-header">
          <div>
            <h2>链与端点</h2>
            <p className="section-caption">
              端点留空即使用平台默认；chainId 由平台固定，不可修改
            </p>
          </div>
        </div>
        <div className="card-body switch-list">
          {catalog.map((chain) => {
            const on = draft.enabled.has(chain.id);
            const endpoint = draft.endpoints[chain.id] ?? {
              rpcText: "",
              explorerUrl: "",
            };
            const rpcInvalid = rpcLines(endpoint.rpcText).some(
              (url) => !isHttps(url),
            );
            const explorerInvalid =
              endpoint.explorerUrl.trim() !== "" &&
              !isHttps(endpoint.explorerUrl);
            return (
              <div
                className={`wallet-chain-editor-card ${chainClass(chain.id)}`}
                key={chain.id}
              >
                <label className="switch-row wallet-chain-switch-row">
                  <span>
                    <strong className="wallet-chain-title">
                      {chain.name}
                      {chain.testnet ? (
                        <span
                          className="strategy-pill"
                          title="测试网：链上代币没有真实价值"
                        >
                          测试网
                        </span>
                      ) : null}
                    </strong>
                    <small className="mono wallet-chain-meta">
                      chainId {chain.chainId} · {chain.id}
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={on && lastEnabled}
                    title={
                      on && lastEnabled ? "至少要保留一条启用的链" : undefined
                    }
                    onChange={(event) =>
                      onChange((next) => {
                        if (event.target.checked) next.enabled.add(chain.id);
                        else next.enabled.delete(chain.id);
                      })
                    }
                  />
                </label>
                {on && chain.testnet ? (
                  <div className="draft-help-banner" role="alert">
                    <strong>这是测试网。</strong>
                    上面的代币没有真实价值，只应开给内部测试或体验环境的租户。
                    生产租户启用后，用户会在 App
                    里看到一条和主网并列的链，很容易误以为 资产是真的。
                  </div>
                ) : null}
                {on ? (
                  <div className="config-inline-fields">
                    <label className="form-field">
                      <span>{chain.name} RPC 端点</span>
                      <textarea
                        className="input textarea mono"
                        rows={2}
                        aria-invalid={rpcInvalid}
                        value={endpoint.rpcText}
                        placeholder={
                          chain.defaultRpcUrls.join("\n") ||
                          "https://rpc.example.com"
                        }
                        onChange={(event) =>
                          onChange((next) => {
                            next.endpoints[chain.id] = {
                              ...endpoint,
                              rpcText: event.target.value,
                            };
                          })
                        }
                      />
                      {rpcInvalid ? (
                        <small className="field-error">
                          必须是 https:// 开头的完整地址：明文 RPC
                          会泄露用户查询的每个地址和余额。
                        </small>
                      ) : (
                        <small>
                          一行一个，留空使用平台默认（
                          {chain.defaultRpcUrls.join("、") || "无"}
                          ）。下发给客户端的 RPC 是公开的，只能填可公开的端点。
                        </small>
                      )}
                    </label>
                    <label className="form-field">
                      <span>{chain.name} 区块浏览器</span>
                      <input
                        className="input mono"
                        aria-invalid={explorerInvalid}
                        value={endpoint.explorerUrl}
                        placeholder={
                          chain.defaultExplorerUrl || "https://explorer.example"
                        }
                        onChange={(event) =>
                          onChange((next) => {
                            next.endpoints[chain.id] = {
                              ...endpoint,
                              explorerUrl: event.target.value,
                            };
                          })
                        }
                      />
                      {explorerInvalid ? (
                        <small className="field-error">
                          必须是 https:// 开头的完整地址。
                        </small>
                      ) : (
                        <small>
                          App 里“在浏览器中查看”会拼成 /address/&lt;地址&gt;。
                        </small>
                      )}
                    </label>
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() =>
                        onChange((next) => {
                          next.endpoints[chain.id] = {
                            rpcText: "",
                            explorerUrl: "",
                          };
                        })
                      }
                    >
                      <RotateCcw size={16} />
                      恢复 {chain.name} 平台默认
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        {problems.length > 0 ? (
          <div className="card-body">
            <div className="error-banner" role="alert">
              <strong>还有 {problems.length} 处需要修正：</strong>
              <ul>
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
        {!saveComposerOpen ? (
          <div className="card-body save-toolbar">
            <span className="section-caption">
              保存前会要求填写修改原因，并写入配置审计。
            </span>
            <div className="save-actions">
              <Button
                variant="ghost"
                type="button"
                onClick={onCancel}
                disabled={saving}
              >
                取消编辑
              </Button>
              <Button type="button" onClick={onOpenSave} disabled={saving}>
                <Save size={16} />
                保存配置
              </Button>
            </div>
          </div>
        ) : (
          <div className="card-body save-composer">
            <div className="save-composer-heading">
              <div>
                <div className="eyebrow">Activate wallet configuration</div>
                <h2>保存并激活钱包配置</h2>
                <p>
                  保存后 RN-App 下一次刷新 bootstrap 即会读取新的 Project ID
                  与链端点。
                </p>
              </div>
              <Button variant="ghost" type="button" onClick={onCloseSave}>
                收起
              </Button>
            </div>
            <label className="form-field save-reason-field">
              <span>修改原因</span>
              <textarea
                autoFocus
                className="input textarea"
                aria-invalid={Boolean(reasonError)}
                aria-describedby={
                  reasonError ? "wallet-change-reason-error" : undefined
                }
                value={reason}
                placeholder="例如：接入租户自有 BSC 节点并启用 Base"
                onChange={(event) => onReasonChange(event.target.value)}
              />
              {reasonError ? (
                <small className="field-error" id="wallet-change-reason-error">
                  {reasonError}
                </small>
              ) : (
                <small>至少填写 3 个字符，将写入配置审计。</small>
              )}
            </label>
            <div className="save-composer-footer">
              <span className="section-caption">
                下一步仍会显示最终确认，不会立即提交。
              </span>
              <Button type="button" onClick={onContinueSave}>
                继续确认
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
