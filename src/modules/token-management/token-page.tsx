import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Edit3,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import {
  adminApi,
  ApiError,
  type Token,
  type TokenList,
  type TokenCreateInput,
  type TokenPreview,
  type TokenUpdateInput,
  type WalletCatalogEntry,
} from "../../core/api";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FeedbackNotice,
  FormValidationSummary,
  focusFirstInvalidField,
  SelectField,
  SidePanel,
  StatusPill,
} from "../../design-system/components";
import type { AdminPageProps } from "../../plugin-system/types";

/**
 * 代币管理：App 钱包里显示哪些代币、精度与排序。
 *
 * symbol / decimals 只能从链上读取（服务端在入库时会再读一次链），管理端没有
 * 这两项的输入框；能改的只有名称、展示精度、颜色、排序与启用。列表是服务端的
 * 合并视图：平台全局行 + 本租户行，同一 (chain, address) 只出现租户行。
 */

const contractAddressPattern = /^0x[0-9a-fA-F]{40}$/;
const hexColorPattern = /^#[0-9a-fA-F]{6}$/;
const minReasonLength = 3;
const reasonHint = "至少填写 3 个字符，将写入操作审计。";
const reasonTooShort = "请填写至少 3 个字符的修改原因。";

/** 读链失败时按错误码给运营看得懂的话；没有对应文案时用服务端的 detail。 */
const previewErrorMessages: Record<string, string> = {
  TOKEN_NOT_A_CONTRACT:
    "这个地址在所选链上不是合约（链上没有代码）。请核对地址，或确认选对了链。",
  TOKEN_CHAIN_MISMATCH:
    "所选链与平台节点不匹配：节点返回的 chainId 与链目录不符，请联系平台运维检查端点。",
  TOKEN_CHAIN_UNAVAILABLE: "链上节点暂时不可用（读取超时或失败），请稍后再试。",
  TOKEN_METADATA_INVALID:
    "合约返回的 symbol 或 decimals 不合法，不能作为代币加入目录。",
};
const writeErrorMessages: Record<string, string> = {
  ...previewErrorMessages,
  TOKEN_EXISTS: "该代币已在目录中，请直接编辑对应的行。",
  TOKEN_FIELD_READONLY:
    "symbol、decimals、链与合约地址不能修改，只能重新从链上读取。",
  TOKEN_GLOBAL_READONLY: "平台全局代币不能删除，可停用。",
  TOKEN_GLOBAL_METADATA_READONLY:
    "平台全局代币的链上元数据由平台维护，租户不能重新读取。",
  TOKEN_NATIVE_REQUIRED:
    "原生币不能停用或删除：要停用它，请在钱包配置里关闭这条链。",
  CONFIG_VERSION_CONFLICT: "配置刚被其他人修改过，列表已刷新，请重新操作。",
};

function describeError(
  error: unknown,
  messages: Record<string, string>,
): string {
  if (error instanceof ApiError) return messages[error.code] ?? error.message;
  return error instanceof Error ? error.message : "未知错误";
}

function shortAddress(address: string): string {
  return address.length > 14
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;
}

function scopeLabel(scope: Token["scope"]): string {
  return scope === "global" ? "全局" : "本租户";
}

function syncedAtLabel(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

type ChainGroup = { chain: WalletCatalogEntry; tokens: Token[] };
const disabledChainCollapseThreshold = 3;
const disabledChainSectionCountThreshold = 3;
const disabledChainSectionTokenThreshold = 8;

/** 按链目录顺序分组。组内 sortWeight 降序、symbol 升序，与下发顺序一致。 */
function groupByChain(
  tokens: Token[],
  catalog: WalletCatalogEntry[],
  enabledChains: string[],
): ChainGroup[] {
  const chains = new Map<string, WalletCatalogEntry>(
    catalog.map((chain) => [chain.id, chain]),
  );
  for (const token of tokens)
    if (!chains.has(token.chain))
      // 代币只可能在平台链目录里的链上：目录里没有就是服务端数据不一致，按 error 态呈现
      throw new Error(
        `代币 ${token.symbol} 所在的链 ${token.chain} 不在平台链目录里`,
      );
  const catalogOrder = new Map(
    catalog.map((chain, index) => [chain.id, index]),
  );
  return Array.from(chains.values())
    .map((chain) => ({
      chain,
      tokens: tokens
        .filter((token) => token.chain === chain.id)
        .sort(
          (a, b) =>
            b.sortWeight - a.sortWeight || a.symbol.localeCompare(b.symbol),
        ),
    }))
    .sort(
      (a, b) =>
        Number(!enabledChains.includes(a.chain.id)) -
          Number(!enabledChains.includes(b.chain.id)) ||
        (catalogOrder.get(a.chain.id) ?? Number.MAX_SAFE_INTEGER) -
          (catalogOrder.get(b.chain.id) ?? Number.MAX_SAFE_INTEGER),
    );
}

function parseInteger(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "" || !/^-?\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

type Feedback = { kind: "error" | "success"; message: string } | null;
type PanelState = { mode: "create" } | { mode: "edit"; token: Token } | null;
type RowAction = { kind: "toggle" | "delete"; token: Token } | null;

export function TokenPage({ tenantId }: AdminPageProps) {
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    queryKey: ["config", tenantId],
    queryFn: () => adminApi.config(tenantId),
    staleTime: 15_000,
  });
  const tokensQuery = useQuery({
    queryKey: ["tokens", tenantId],
    queryFn: () => adminApi.listTokens(),
  });
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [panel, setPanel] = useState<PanelState>(null);
  const [rowAction, setRowAction] = useState<RowAction>(null);
  const [rowReason, setRowReason] = useState("");
  const [rowReasonError, setRowReasonError] = useState("");
  const [toggledChains, setToggledChains] = useState<Set<string>>(
    () => new Set(),
  );
  const [disabledSectionToggled, setDisabledSectionToggled] = useState(false);

  const refreshAfterWrite = (metadata?: { databaseVersion: number }) => {
    // 写操作的响应里已经带了新版本号：先同步写进缓存，再后台刷新。否则从"重新读链
    // 确认"到列表刷新完成之间，"保存修改"按钮已经可点而 expectedVersion 还是旧的，
    // 这一下必然吃一个可避免的 409
    if (metadata)
      queryClient.setQueryData<TokenList>(["tokens", tenantId], (old) =>
        old ? { ...old, metadata } : old,
      );
    void queryClient.invalidateQueries({ queryKey: ["tokens", tenantId] });
    // 代币写操作也会让 app_configs.version +1，配置页缓存的版本号随之过期
    void queryClient.invalidateQueries({ queryKey: ["config", tenantId] });
    void queryClient.invalidateQueries({ queryKey: ["audits", tenantId] });
  };
  const recoverFromFailure = () => {
    // 乐观锁冲突之后本地版本号已经过期，不刷新的话再点一次还是 409
    void queryClient.invalidateQueries({ queryKey: ["tokens", tenantId] });
    void queryClient.invalidateQueries({ queryKey: ["config", tenantId] });
  };

  const rowMutation = useMutation({
    mutationFn: ({
      action,
      token,
      reason,
      expectedVersion,
    }: {
      action: "toggle" | "delete";
      token: Token;
      reason: string;
      expectedVersion: number;
    }) =>
      action === "delete"
        ? adminApi.deleteToken(token.id, { reason, expectedVersion })
        : adminApi.updateToken(token.id, {
            enabled: !token.enabled,
            reason,
            expectedVersion,
          }),
    onSuccess: (result, variables) => {
      setRowAction(null);
      setRowReason("");
      setRowReasonError("");
      refreshAfterWrite(result.metadata);
      const { token } = variables;
      setFeedback({
        kind: "success",
        message:
          variables.action === "delete"
            ? token.scope === "tenant"
              ? `已删除本租户的 ${token.symbol}；若平台有同一代币的全局行，它会重新生效。`
              : `已删除 ${token.symbol}。`
            : token.enabled
              ? `已停用 ${token.symbol}，App 下次刷新 bootstrap 后不再显示它。`
              : `已启用 ${token.symbol}，App 下次刷新 bootstrap 后即可看到。`,
      });
    },
    onError: (error) => {
      setRowAction(null);
      recoverFromFailure();
      setFeedback({
        kind: "error",
        message: `操作失败：${describeError(error, writeErrorMessages)}`,
      });
    },
  });

  if (tokensQuery.isLoading || configQuery.isLoading)
    return <EmptyState title="正在加载代币目录" />;
  if (tokensQuery.isError)
    return (
      <div className="error-banner">
        无法加载代币目录：{tokensQuery.error.message}
      </div>
    );
  if (configQuery.isError)
    return (
      <div className="error-banner">
        无法加载链目录：{configQuery.error.message}
      </div>
    );
  const list = tokensQuery.data;
  const config = configQuery.data;
  if (!list || !config) return <EmptyState title="没有代币目录" />;
  const catalog = config.metadata.walletCatalog;
  // 钱包配置里没启用的链，它上面的代币不会下发给 App：卡片与添加结果都要说清
  const enabledChains = config.config.wallet.chains;
  const groups = groupByChain(list.tokens, catalog, enabledChains);
  const enabledGroups = groups.filter((group) =>
    enabledChains.includes(group.chain.id),
  );
  const disabledGroups = groups.filter(
    (group) => !enabledChains.includes(group.chain.id),
  );
  const disabledTokenCount = disabledGroups.reduce(
    (total, group) => total + group.tokens.length,
    0,
  );
  const disabledSectionDefaultsCollapsed =
    disabledGroups.length >= disabledChainSectionCountThreshold ||
    disabledTokenCount >= disabledChainSectionTokenThreshold;
  const disabledSectionCollapsed = disabledSectionToggled
    ? !disabledSectionDefaultsCollapsed
    : disabledSectionDefaultsCollapsed;
  const expectedVersion = list.metadata.databaseVersion;
  const globalCount = list.tokens.filter((t) => t.scope === "global").length;

  const openRowAction = (kind: "toggle" | "delete", token: Token) => {
    setFeedback(null);
    setRowReason("");
    setRowReasonError("");
    setRowAction({ kind, token });
  };
  const confirmRowAction = () => {
    if (!rowAction) return;
    if (rowReason.trim().length < minReasonLength) {
      setRowReasonError(reasonTooShort);
      return;
    }
    rowMutation.mutate({
      action: rowAction.kind,
      token: rowAction.token,
      reason: rowReason.trim(),
      expectedVersion,
    });
  };
  const chainOf = (token: Token) =>
    catalog.find((chain) => chain.id === token.chain);

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
          <div className="eyebrow">Token catalogue</div>
          <h1>代币管理</h1>
          <p>
            App 钱包里显示哪些代币、用几位小数展示、怎么排序，由这里决定。symbol
            与 decimals 从链上读取，不能手填；改完随 bootstrap
            下发，无需重新打包。
          </p>
        </div>
        <div className="heading-actions">
          <span className="section-caption">数据库版本 v{expectedVersion}</span>
          <Button
            onClick={() => {
              setFeedback(null);
              setPanel({ mode: "create" });
            }}
            disabled={catalog.length === 0}
          >
            <Plus size={16} />
            添加代币
          </Button>
        </div>
      </div>

      <div className="token-page">
        {catalog.length === 0 ? (
          <EmptyState
            title="服务端没有下发链目录"
            detail="升级 RN-Server 后这里会按链列出代币。"
          />
        ) : list.tokens.length === 0 ? (
          <EmptyState
            title="目录里还没有代币"
            detail="点击右上角“添加代币”，从链上读取合约信息后加入目录。"
          />
        ) : null}
        {enabledGroups.map((group) => (
          <ChainTokenCard
            key={group.chain.id}
            group={group}
            enabled={enabledChains.includes(group.chain.id)}
            toggled={toggledChains.has(group.chain.id)}
            onToggleCollapsed={() =>
              setToggledChains((current) => {
                const next = new Set(current);
                if (next.has(group.chain.id)) next.delete(group.chain.id);
                else next.add(group.chain.id);
                return next;
              })
            }
            onEdit={(token) => {
              setFeedback(null);
              setPanel({ mode: "edit", token });
            }}
            onToggle={(token) => openRowAction("toggle", token)}
            onDelete={(token) => openRowAction("delete", token)}
          />
        ))}
        {disabledGroups.length > 0 ? (
          <section className="token-disabled-chains">
            <div className="token-disabled-chains-header">
              <div>
                <strong>未启用链</strong>
                <span>
                  {disabledGroups.length} 条链 · {disabledTokenCount} 个代币
                </span>
              </div>
              <button
                className="token-chain-toggle"
                type="button"
                aria-expanded={!disabledSectionCollapsed}
                onClick={() => setDisabledSectionToggled((value) => !value)}
              >
                {disabledSectionCollapsed ? "展开全部" : "收起全部"}
                <ChevronDown
                  size={15}
                  aria-hidden="true"
                  className={disabledSectionCollapsed ? "" : "is-open"}
                />
              </button>
            </div>
            {disabledSectionCollapsed
              ? null
              : disabledGroups.map((group) => (
                  <ChainTokenCard
                    key={group.chain.id}
                    group={group}
                    enabled={false}
                    toggled={toggledChains.has(group.chain.id)}
                    onToggleCollapsed={() =>
                      setToggledChains((current) => {
                        const next = new Set(current);
                        if (next.has(group.chain.id))
                          next.delete(group.chain.id);
                        else next.add(group.chain.id);
                        return next;
                      })
                    }
                    onEdit={(token) => {
                      setFeedback(null);
                      setPanel({ mode: "edit", token });
                    }}
                    onToggle={(token) => openRowAction("toggle", token)}
                    onDelete={(token) => openRowAction("delete", token)}
                  />
                ))}
          </section>
        ) : null}
        {list.tokens.length > 0 ? (
          <div className="config-meta">
            <span>
              共 {list.tokens.length} 个代币 · 平台全局 {globalCount} · 本租户{" "}
              {list.tokens.length - globalCount}
            </span>
            <span>
              全局代币可停用、可覆盖显示设置，但不能从租户里删除；删除本租户覆盖行等于恢复全局行。
            </span>
          </div>
        ) : null}
      </div>

      {panel?.mode === "create" ? (
        <CreateTokenPanel
          catalog={catalog}
          expectedVersion={expectedVersion}
          onClose={() => setPanel(null)}
          onCreated={(token, metadata) => {
            setPanel(null);
            refreshAfterWrite(metadata);
            const chainName = chainOf(token)?.name ?? token.chain;
            setFeedback({
              kind: "success",
              message: enabledChains.includes(token.chain)
                ? `已添加 ${token.symbol}（${chainName}），App 下次刷新 bootstrap 后即可看到。`
                : `已添加 ${token.symbol}（${chainName}）。这条链未在钱包配置里启用，App 不会收到它；到钱包配置启用这条链后生效。`,
            });
          }}
          onFailed={recoverFromFailure}
        />
      ) : null}
      {panel?.mode === "edit" ? (
        <EditTokenPanel
          key={panel.token.id}
          token={panel.token}
          chain={chainOf(panel.token)}
          expectedVersion={expectedVersion}
          onClose={() => setPanel(null)}
          onSaved={(saved, before, metadata) => {
            setPanel(null);
            refreshAfterWrite(metadata);
            setFeedback({
              kind: "success",
              message:
                before.scope === "global" && saved.scope === "tenant"
                  ? `已保存为本租户对 ${saved.symbol} 的覆盖行，平台全局行不受影响。`
                  : `已保存 ${saved.symbol} 的修改，App 下次刷新 bootstrap 后生效。`,
            });
          }}
          onResynced={refreshAfterWrite}
          onFailed={recoverFromFailure}
        />
      ) : null}

      <ConfirmDialog
        open={rowAction !== null}
        title={
          rowAction?.kind === "delete"
            ? `删除 ${rowAction.token.symbol}？`
            : rowAction?.token.enabled
              ? `停用 ${rowAction.token.symbol}？`
              : `启用 ${rowAction?.token.symbol ?? ""}？`
        }
        description={
          rowAction?.kind === "delete"
            ? "软删除，可由平台恢复。删除本租户的覆盖行后，同一代币的平台全局行会重新生效。"
            : rowAction?.token.scope === "global"
              ? "这是平台全局代币，改动只影响本租户（会创建本租户的覆盖行）。"
              : rowAction?.token.enabled
                ? "停用后不再随 bootstrap 下发给 App，用户的链上余额不受影响。"
                : "启用后随 bootstrap 下发给 App。"
        }
        confirmLabel={
          rowAction?.kind === "delete"
            ? "确认删除"
            : rowAction?.token.enabled
              ? "确认停用"
              : "确认启用"
        }
        tone={rowAction?.kind === "delete" ? "danger" : "default"}
        loading={rowMutation.isPending}
        onCancel={() => setRowAction(null)}
        onConfirm={confirmRowAction}
      >
        {rowAction ? (
          <>
            <div className="dialog-detail-list">
              <span>
                代币：{chainOf(rowAction.token)?.name ?? rowAction.token.chain}{" "}
                · {rowAction.token.symbol}（{rowAction.token.name}）
              </span>
              <span>范围：{scopeLabel(rowAction.token.scope)}</span>
              <span>基于数据库版本 v{expectedVersion}</span>
            </div>
            <label className="form-field save-reason-field">
              <span>修改原因</span>
              <textarea
                id="token-row-reason"
                className="input textarea"
                aria-invalid={Boolean(rowReasonError)}
                aria-describedby={
                  rowReasonError ? "token-row-reason-error" : undefined
                }
                value={rowReason}
                placeholder={
                  rowAction.kind === "delete"
                    ? "例如：租户不再支持该代币"
                    : "例如：暂停展示，等待流动性恢复"
                }
                onChange={(event) => {
                  setRowReason(event.target.value);
                  if (rowReasonError) setRowReasonError("");
                }}
              />
              {rowReasonError ? (
                <small className="field-error" id="token-row-reason-error">
                  {rowReasonError}
                </small>
              ) : (
                <small>{reasonHint}</small>
              )}
            </label>
            <FormValidationSummary
              errors={
                rowReasonError
                  ? [
                      {
                        field: "修改原因",
                        message: rowReasonError,
                        targetId: "token-row-reason",
                      },
                    ]
                  : []
              }
            />
          </>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

function ChainTokenCard({
  group,
  enabled,
  toggled,
  onToggleCollapsed,
  onEdit,
  onToggle,
  onDelete,
}: {
  group: ChainGroup;
  /** 这条链是否在钱包配置里启用；没启用的链上的代币不会下发给 App */
  enabled: boolean;
  toggled: boolean;
  onToggleCollapsed: () => void;
  onEdit: (token: Token) => void;
  onToggle: (token: Token) => void;
  onDelete: (token: Token) => void;
}) {
  const { chain, tokens } = group;
  const defaultCollapsed =
    !enabled && tokens.length >= disabledChainCollapseThreshold;
  const collapsed = toggled ? !defaultCollapsed : defaultCollapsed;
  return (
    <Card className="token-chain-card">
      <div className="card-header">
        <div>
          <h2>
            {chain.name}
            {chain.testnet ? (
              <span
                className="strategy-pill"
                title="测试网：链上代币没有真实价值"
              >
                测试网
              </span>
            ) : null}
            {enabled ? null : (
              <span
                className="status-pill status-draft"
                title="这条链未在钱包配置里启用，App 不会收到它上面的代币"
              >
                链未启用
              </span>
            )}
            {tokens.length > 0 ? (
              <button
                className="token-chain-toggle"
                type="button"
                aria-expanded={!collapsed}
                aria-label={`${collapsed ? "展开" : "收起"} ${chain.name} 代币`}
                onClick={onToggleCollapsed}
              >
                {collapsed ? "展开" : "收起"}
                <ChevronDown
                  size={15}
                  aria-hidden="true"
                  className={collapsed ? "" : "is-open"}
                />
              </button>
            ) : null}
          </h2>
          <p className="section-caption mono">
            {`chainId ${chain.chainId} · ${chain.id} · 原生币 ${chain.nativeSymbol}（${chain.nativeDecimals} 位） · ${tokens.length} 个代币`}
          </p>
        </div>
      </div>
      {tokens.length === 0 ? (
        <div className="card-body">
          <EmptyState title="这条链还没有代币" />
        </div>
      ) : collapsed ? (
        <div className="token-chain-collapsed-summary">
          <span>已折叠 {tokens.length} 个代币</span>
          <span>这条链未在钱包配置中启用，App 当前不会收到这些代币。</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="token-table">
            <thead>
              <tr>
                <th>代币</th>
                <th>合约地址</th>
                <th>精度</th>
                <th>范围</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => {
                const isGlobal = token.scope === "global";
                return (
                  <tr key={token.id} data-testid={`token-row-${token.id}`}>
                    <td>
                      <div className="token-identity">
                        <i
                          className="token-color"
                          aria-hidden="true"
                          style={{
                            background: token.logoColor,
                          }}
                        />
                        <div>
                          <strong className="mono">{token.symbol}</strong>
                          <span className="secondary-value">{token.name}</span>
                        </div>
                      </div>
                      {token.allowlisted ? null : (
                        <small className="secondary-value">
                          不在 App 内置的主流合约表中：App
                          不显示美元估值，转出一律要求验证
                        </small>
                      )}
                    </td>
                    <td>
                      {token.address === "native" ? (
                        <span className="status-pill">原生币</span>
                      ) : (
                        <span
                          className="mono token-address"
                          title={token.address}
                        >
                          {shortAddress(token.address)}
                        </span>
                      )}
                    </td>
                    <td>
                      {token.decimals} 位 · 展示 {token.displayDecimals} 位
                    </td>
                    <td>
                      <span
                        className={
                          isGlobal ? "status-pill" : "status-pill status-draft"
                        }
                      >
                        {scopeLabel(token.scope)}
                      </span>
                    </td>
                    <td>
                      <StatusPill
                        status={token.enabled ? "enabled" : "disabled"}
                      />
                    </td>
                    <td>
                      <div className="token-row-actions">
                        <Button
                          variant="ghost"
                          type="button"
                          aria-label={`编辑 ${token.symbol}`}
                          onClick={() => onEdit(token)}
                        >
                          <Edit3 size={14} />
                          编辑
                        </Button>
                        <span
                          title={
                            token.address === "native" && token.enabled
                              ? "原生币不能停用：要停用它，请在钱包配置里关闭这条链"
                              : undefined
                          }
                        >
                          <Button
                            variant="ghost"
                            type="button"
                            aria-label={`${token.enabled ? "停用" : "启用"} ${token.symbol}`}
                            disabled={
                              token.address === "native" && token.enabled
                            }
                            onClick={() => onToggle(token)}
                          >
                            {token.enabled ? "停用" : "启用"}
                          </Button>
                        </span>
                        <span
                          title={
                            isGlobal
                              ? "平台全局代币不能删除，可停用"
                              : undefined
                          }
                        >
                          <Button
                            variant="ghost"
                            type="button"
                            aria-label={`删除 ${token.symbol}`}
                            disabled={isGlobal}
                            onClick={() => onDelete(token)}
                          >
                            <Trash2 size={14} />
                            删除
                          </Button>
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ReasonField({
  id,
  value,
  error,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  error: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="form-field save-reason-field">
      <span>修改原因</span>
      <textarea
        id={id}
        className="input textarea"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <small className="field-error" id={`${id}-error`}>
          {error}
        </small>
      ) : (
        <small>{reasonHint}</small>
      )}
    </label>
  );
}

function ColorField({
  value,
  error,
  errorId,
  inputId,
  onChange,
}: {
  value: string;
  error: string;
  errorId: string;
  inputId: string;
  onChange: (value: string) => void;
}) {
  const valid = hexColorPattern.test(value.trim());
  return (
    <label className="form-field">
      <span>图标颜色</span>
      <div className="color-input-row">
        <span className={`color-picker-control${valid ? "" : " is-empty"}`}>
          <input
            className="color-picker"
            type="color"
            aria-label="图标颜色选择器"
            value={valid ? value.trim() : "#000000"}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
          />
        </span>
        <input
          id={inputId}
          className="input mono"
          aria-label="图标颜色"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          value={value}
          placeholder="#26A17B"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {error ? (
        <small className="field-error" id={errorId}>
          {error}
        </small>
      ) : (
        <small>必填。App 里代币图标的底色，#RRGGBB 格式。</small>
      )}
    </label>
  );
}

/** 展示精度：只影响显示，上限是代币精度。返回错误文案，合法时为空串。 */
function displayDecimalsProblem(value: string, decimals: number): string {
  const parsed = parseInteger(value);
  if (parsed === null || parsed < 0) return "展示精度必须是 0 或正整数。";
  if (parsed > decimals) return `展示精度不能超过代币精度 ${decimals} 位。`;
  return "";
}

type CreateStep = 1 | 2 | 3;
const createSteps: ReadonlyArray<readonly [CreateStep, string]> = [
  [1, "选链与地址"],
  [2, "读取链上信息"],
  [3, "显示与排序"],
];

function CreateTokenPanel({
  catalog,
  expectedVersion,
  onClose,
  onCreated,
  onFailed,
}: {
  catalog: WalletCatalogEntry[];
  expectedVersion: number;
  onClose: () => void;
  onCreated: (token: Token, metadata: { databaseVersion: number }) => void;
  onFailed: () => void;
}) {
  const [step, setStep] = useState<CreateStep>(1);
  const [chain, setChain] = useState(catalog[0]?.id ?? "");
  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState("");
  const [preview, setPreview] = useState<TokenPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [name, setName] = useState("");
  const [displayDecimals, setDisplayDecimals] = useState("");
  const [displayDecimalsError, setDisplayDecimalsError] = useState("");
  const [sortWeight, setSortWeight] = useState("0");
  const [sortWeightError, setSortWeightError] = useState("");
  const [logoColor, setLogoColor] = useState("");
  const [colorError, setColorError] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const selectedChain = catalog.find((item) => item.id === chain);
  const validationErrors = [
    displayDecimalsError
      ? {
          field: "展示精度",
          message: displayDecimalsError,
          targetId: "token-create-display-decimals",
        }
      : null,
    sortWeightError
      ? {
          field: "排序权重",
          message: sortWeightError,
          targetId: "token-create-sort-weight",
        }
      : null,
    colorError
      ? {
          field: "图标颜色",
          message: colorError,
          targetId: "token-create-color",
        }
      : null,
    reasonError
      ? {
          field: "修改原因",
          message: reasonError,
          targetId: "token-create-reason",
        }
      : null,
  ].filter((error): error is NonNullable<typeof error> => error !== null);
  const previewMutation = useMutation({
    mutationFn: (payload: { chain: string; contractAddress: string }) =>
      adminApi.previewToken(payload),
    onSuccess: (result) => {
      setPreview(result);
      setPreviewError("");
      setName(result.name);
      setDisplayDecimals(String(Math.min(6, result.decimals)));
      setDisplayDecimalsError("");
      setStep(2);
    },
    onError: (error) => {
      // 没有链上数据就没有这条记录：停在第一步
      setPreview(null);
      setStep(1);
      setPreviewError(describeError(error, previewErrorMessages));
    },
  });
  const createMutation = useMutation({
    mutationFn: (payload: TokenCreateInput) => adminApi.createToken(payload),
    onSuccess: (result) => onCreated(result.token, result.metadata),
    onError: (error) => {
      setConfirmOpen(false);
      setSubmitError(describeError(error, writeErrorMessages));
      onFailed();
    },
  });

  const readOnchain = () => {
    const trimmed = address.trim();
    if (!contractAddressPattern.test(trimmed)) {
      setAddressError("合约地址应为 0x 开头的 40 位十六进制字符。");
      return;
    }
    if (!chain) {
      setPreviewError("请先选择链。");
      return;
    }
    setAddressError("");
    setPreviewError("");
    previewMutation.mutate({ chain, contractAddress: trimmed });
  };
  const restart = () => {
    setStep(1);
    setPreview(null);
    setPreviewError("");
    setSubmitError("");
    // 换了一枚代币，第三步里为上一枚填的排序、颜色、启用状态不该被带过去
    setName("");
    setDisplayDecimals("");
    setDisplayDecimalsError("");
    setSortWeight("0");
    setSortWeightError("");
    setLogoColor("");
    setEnabled(true);
  };
  const submit = () => {
    if (!preview) return;
    let ok = true;
    const decimalsProblem = displayDecimalsProblem(
      displayDecimals,
      preview.decimals,
    );
    setDisplayDecimalsError(decimalsProblem);
    if (decimalsProblem) ok = false;
    if (parseInteger(sortWeight) === null) {
      setSortWeightError("排序权重必须是整数。");
      ok = false;
    } else setSortWeightError("");
    if (!hexColorPattern.test(logoColor.trim())) {
      setColorError("图标颜色是必填项，#RRGGBB 格式，例如 #26A17B。");
      ok = false;
    } else setColorError("");
    if (reason.trim().length < minReasonLength) {
      setReasonError(reasonTooShort);
      ok = false;
    } else setReasonError("");
    if (!ok) {
      focusFirstInvalidField();
      return;
    }
    setSubmitError("");
    setConfirmOpen(true);
  };
  const confirmCreate = () => {
    if (!preview) return;
    // 请求体里没有 symbol / decimals：服务端会自己读链回填
    const payload: TokenCreateInput = {
      chain,
      contractAddress: address.trim(),
      displayDecimals: Number(displayDecimals),
      logoColor: logoColor.trim(),
      enabled,
      sortWeight: Number(sortWeight),
      reason: reason.trim(),
      expectedVersion,
    };
    if (name.trim() !== "") payload.name = name.trim();
    createMutation.mutate(payload);
  };

  const exists = preview?.exists ?? null;
  const busy = previewMutation.isPending || createMutation.isPending;
  return (
    <>
      <SidePanel
        open
        title="添加代币"
        description="先选链并填合约地址，从链上读取 symbol 与 decimals，再决定怎么显示。没有链上数据就没有这条记录。"
        onClose={() => {
          if (!confirmOpen) onClose();
        }}
        footer={
          <>
            <Button variant="ghost" type="button" onClick={onClose}>
              取消
            </Button>
            {step === 3 ? (
              <Button
                variant="ghost"
                type="button"
                onClick={() => setStep(2)}
                disabled={busy}
              >
                上一步
              </Button>
            ) : null}
            {step === 1 ? (
              <Button
                type="button"
                onClick={readOnchain}
                disabled={previewMutation.isPending}
              >
                <RefreshCw size={16} />
                {previewMutation.isPending ? "读取中…" : "读取链上信息"}
              </Button>
            ) : null}
            {step === 2 ? (
              <Button
                type="button"
                onClick={() => setStep(3)}
                disabled={exists !== null}
              >
                下一步
              </Button>
            ) : null}
            {step === 3 ? (
              <Button type="button" onClick={submit} disabled={busy}>
                <Plus size={16} />
                添加到目录
              </Button>
            ) : null}
          </>
        }
      >
        <div className="side-panel-form">
          <ol className="token-steps" aria-label="添加步骤">
            {createSteps.map(([index, label]) => (
              <li
                key={index}
                className={
                  step === index ? "is-active" : step > index ? "is-done" : ""
                }
                aria-current={step === index ? "step" : undefined}
              >
                <strong>Step {index}</strong>
                {label}
              </li>
            ))}
          </ol>

          <SelectField
            label="链"
            value={chain}
            disabled={step > 1}
            onChange={(event) => setChain(event.target.value)}
            hint={
              selectedChain?.testnet
                ? "测试网代币没有真实价值，只应用于内部测试或体验环境。"
                : undefined
            }
          >
            {catalog.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.testnet ? "（测试网）" : ""}
              </option>
            ))}
          </SelectField>
          <label className="form-field">
            <span>合约地址</span>
            <input
              className="input mono"
              autoFocus
              value={address}
              disabled={step > 1}
              aria-invalid={Boolean(addressError)}
              aria-describedby={
                addressError ? "token-create-address-error" : undefined
              }
              placeholder="0x…"
              onChange={(event) => {
                setAddress(event.target.value);
                if (addressError) setAddressError("");
                if (previewError) setPreviewError("");
              }}
            />
            {addressError ? (
              <small className="field-error" id="token-create-address-error">
                {addressError}
              </small>
            ) : (
              <small>
                0x 开头的 40
                位十六进制；大小写不限，入库时会转成校验和格式。原生币由平台维护，不在这里添加。
              </small>
            )}
          </label>
          {step > 1 ? (
            <div>
              <Button variant="ghost" type="button" onClick={restart}>
                修改链或地址
              </Button>
            </div>
          ) : null}
          {previewError ? (
            <div className="error-banner" role="alert">
              <strong>读取链上信息失败。</strong> {previewError}
            </div>
          ) : null}

          {step > 1 && preview ? (
            <>
              <div className="token-readonly-grid">
                <label className="form-field">
                  <span>Symbol</span>
                  <input
                    className="input mono"
                    value={preview.symbol}
                    readOnly
                    aria-readonly="true"
                  />
                </label>
                <label className="form-field">
                  <span>Decimals</span>
                  <input
                    className="input mono"
                    value={String(preview.decimals)}
                    readOnly
                    aria-readonly="true"
                  />
                </label>
                <span className="token-readonly-note">
                  <span>
                    symbol 与 decimals
                    来自合约本身，不能手填；入库时服务端会再读一次链。
                  </span>
                </span>
              </div>
              <label className="form-field">
                <span>名称</span>
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <small>
                  链上预填，可改成用户更熟悉的叫法；留空则沿用链上名称，合约没有名称时服务端用符号代替。保存后名称不能为空。
                </small>
              </label>
              {preview.allowlisted ? (
                <p className="section-caption">
                  在 App
                  内置的主流合约表中：显示美元估值，按大额阈值决定是否要求验证。
                </p>
              ) : (
                <div className="draft-help-banner" role="note">
                  <strong>不在 App 内置的主流合约表中。</strong>
                  <span>
                    加入目录后 App
                    正常显示与转出，不显示美元估值，转出一律要求验证；
                    只有当符号与某个主流代币相同而合约地址不同时，App
                    才会提醒用户核对合约地址。
                  </span>
                </div>
              )}
              {exists ? (
                <div className="error-banner" role="alert">
                  该代币已在目录中（{scopeLabel(exists.scope)}
                  ），不能重复添加；请回到列表编辑对应的行。
                </div>
              ) : null}
            </>
          ) : null}

          {step === 3 && preview ? (
            <>
              <div className="token-inline-fields">
                <label className="form-field">
                  <span>展示精度（位）</span>
                  <input
                    id="token-create-display-decimals"
                    className="input token-number-input"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={preview.decimals}
                    step={1}
                    value={displayDecimals}
                    aria-invalid={Boolean(displayDecimalsError)}
                    aria-describedby={
                      displayDecimalsError
                        ? "token-create-display-decimals-error"
                        : "token-create-display-decimals-hint"
                    }
                    onChange={(event) => {
                      setDisplayDecimals(event.target.value);
                      if (displayDecimalsError) setDisplayDecimalsError("");
                    }}
                  />
                  {displayDecimalsError ? (
                    <small
                      className="field-error"
                      id="token-create-display-decimals-error"
                    >
                      {displayDecimalsError}
                    </small>
                  ) : (
                    <small id="token-create-display-decimals-hint">
                      只影响显示，不参与金额换算；最多 {preview.decimals} 位（=
                      代币精度）。
                    </small>
                  )}
                </label>
                <label className="form-field">
                  <span>排序权重（整数）</span>
                  <input
                    id="token-create-sort-weight"
                    className="input token-number-input"
                    type="number"
                    inputMode="numeric"
                    step={1}
                    value={sortWeight}
                    aria-invalid={Boolean(sortWeightError)}
                    aria-describedby={
                      sortWeightError
                        ? "token-create-sort-weight-error"
                        : undefined
                    }
                    onChange={(event) => {
                      setSortWeight(event.target.value);
                      if (sortWeightError) setSortWeightError("");
                    }}
                  />
                  {sortWeightError ? (
                    <small
                      className="field-error"
                      id="token-create-sort-weight-error"
                    >
                      {sortWeightError}
                    </small>
                  ) : (
                    <small>
                      默认 0；数值越大越靠前，平台全局代币通常为 100 以上。
                    </small>
                  )}
                </label>
              </div>
              <ColorField
                value={logoColor}
                error={colorError}
                errorId="token-create-color-error"
                inputId="token-create-color"
                onChange={(value) => {
                  setLogoColor(value);
                  if (colorError) setColorError("");
                }}
              />
              <label className="switch-row">
                <span>
                  <strong>启用</strong>
                  <small>停用的代币不会随 bootstrap 下发给 App。</small>
                </span>
                <input
                  type="checkbox"
                  aria-label="启用"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                />
              </label>
              <ReasonField
                id="token-create-reason"
                value={reason}
                error={reasonError}
                placeholder="例如：上线 USDC 交易对，钱包需要显示余额"
                onChange={(value) => {
                  setReason(value);
                  if (reasonError) setReasonError("");
                }}
              />
              <FormValidationSummary
                errors={validationErrors}
                title="请修正表单中的错误后再添加。"
              />
              <FeedbackNotice
                kind="error"
                message={submitError ? `添加失败：${submitError}` : ""}
                onDismiss={() => setSubmitError("")}
              />
            </>
          ) : null}
        </div>
      </SidePanel>
      <ConfirmDialog
        open={confirmOpen}
        title="添加代币？"
        description="服务端会重新读一次链回填 symbol 与 decimals，然后写入目录并记录审计。"
        confirmLabel="确认添加"
        loading={createMutation.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmCreate}
      >
        {preview ? (
          <div className="dialog-detail-list">
            <span>
              链：{selectedChain?.name ?? chain}
              {selectedChain?.testnet ? "（测试网）" : ""}
            </span>
            <span className="mono">合约地址：{address.trim()}</span>
            <span>
              代币：{preview.symbol} · {name.trim() || preview.name} ·{" "}
              {preview.decimals} 位 · 展示 {displayDecimals} 位
            </span>
            <span>
              排序 {sortWeight} · {enabled ? "启用" : "停用"} · 基于数据库版本 v
              {expectedVersion}
            </span>
            <span>修改原因：{reason.trim()}</span>
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

function EditTokenPanel({
  token,
  chain,
  expectedVersion,
  onClose,
  onSaved,
  onResynced,
  onFailed,
}: {
  token: Token;
  chain: WalletCatalogEntry | undefined;
  expectedVersion: number;
  onClose: () => void;
  onSaved: (
    saved: Token,
    before: Token,
    metadata: { databaseVersion: number },
  ) => void;
  onResynced: (metadata?: { databaseVersion: number }) => void;
  onFailed: () => void;
}) {
  // 重新读链确认后 symbol / decimals 会变，所以只读字段跟着本地的 current 走
  const [current, setCurrent] = useState(token);
  const [name, setName] = useState(token.name);
  const [displayDecimals, setDisplayDecimals] = useState(
    String(token.displayDecimals),
  );
  const [displayDecimalsError, setDisplayDecimalsError] = useState("");
  const [sortWeight, setSortWeight] = useState(String(token.sortWeight));
  const [sortWeightError, setSortWeightError] = useState("");
  const [logoColor, setLogoColor] = useState(token.logoColor);
  const [colorError, setColorError] = useState("");
  const [enabled, setEnabled] = useState(token.enabled);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resyncDiff, setResyncDiff] = useState<{
    current: { symbol: string; decimals: number };
    onchain: { symbol: string; decimals: number };
  } | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [notice, setNotice] = useState("");
  const validationErrors = [
    displayDecimalsError
      ? {
          field: "展示精度",
          message: displayDecimalsError,
          targetId: "token-edit-display-decimals",
        }
      : null,
    sortWeightError
      ? {
          field: "排序权重",
          message: sortWeightError,
          targetId: "token-edit-sort-weight",
        }
      : null,
    colorError
      ? {
          field: "图标颜色",
          message: colorError,
          targetId: "token-edit-color",
        }
      : null,
    reasonError
      ? {
          field: "修改原因",
          message: reasonError,
          targetId: "token-edit-reason",
        }
      : null,
  ].filter((error): error is NonNullable<typeof error> => error !== null);

  const isNative = current.address === "native";
  const resyncMutation = useMutation({
    mutationFn: (confirm: boolean) =>
      adminApi.resyncToken(current.id, {
        reason: reason.trim(),
        expectedVersion,
        confirm,
      }),
    onSuccess: (result) => {
      setResyncDiff(null);
      setSubmitError("");
      if (!result.changed) {
        // 没有差异也写了链上读取时间：行是新的，列表也要刷新
        setCurrent(result.token);
        setNotice("链上数据与目录一致，没有需要更新的内容。");
        onResynced();
        return;
      }
      if ("token" in result) {
        setCurrent(result.token);
        // 新精度比原来小时，展示精度跟着截到新精度
        setDisplayDecimals((value) => {
          const parsed = parseInteger(value);
          return parsed === null || parsed <= result.token.decimals
            ? value
            : String(result.token.decimals);
        });
        setNotice(
          `已按链上数据更新：${result.token.symbol} · ${result.token.decimals} 位。`,
        );
        onResynced(result.metadata);
        return;
      }
      setNotice("");
      setResyncDiff({ current: result.current, onchain: result.onchain });
    },
    onError: (error) => {
      setResyncDiff(null);
      setNotice("");
      setSubmitError(describeError(error, writeErrorMessages));
      onFailed();
    },
  });
  const updateMutation = useMutation({
    mutationFn: (payload: TokenUpdateInput) =>
      adminApi.updateToken(current.id, payload),
    onSuccess: (result) => onSaved(result.token, current, result.metadata),
    onError: (error) => {
      setConfirmOpen(false);
      setSubmitError(describeError(error, writeErrorMessages));
      onFailed();
    },
  });

  const reasonReady = () => {
    if (reason.trim().length < minReasonLength) {
      setReasonError(reasonTooShort);
      return false;
    }
    setReasonError("");
    return true;
  };
  const startResync = () => {
    setNotice("");
    setSubmitError("");
    if (!reasonReady()) return;
    resyncMutation.mutate(false);
  };
  const changes = (): TokenUpdateInput => {
    const payload: TokenUpdateInput = {
      reason: reason.trim(),
      expectedVersion,
    };
    if (name.trim() !== current.name) payload.name = name.trim();
    if (Number(displayDecimals) !== current.displayDecimals)
      payload.displayDecimals = Number(displayDecimals);
    if (logoColor.trim() !== current.logoColor)
      payload.logoColor = logoColor.trim();
    if (Number(sortWeight) !== current.sortWeight)
      payload.sortWeight = Number(sortWeight);
    if (enabled !== current.enabled) payload.enabled = enabled;
    return payload;
  };
  const changedFields = (payload: TokenUpdateInput) =>
    Object.keys(payload).filter(
      (key) => key !== "reason" && key !== "expectedVersion",
    );
  const submit = () => {
    let ok = true;
    const decimalsProblem = displayDecimalsProblem(
      displayDecimals,
      current.decimals,
    );
    setDisplayDecimalsError(decimalsProblem);
    if (decimalsProblem) ok = false;
    if (parseInteger(sortWeight) === null) {
      setSortWeightError("排序权重必须是整数。");
      ok = false;
    } else setSortWeightError("");
    if (!hexColorPattern.test(logoColor.trim())) {
      setColorError("图标颜色是必填项，#RRGGBB 格式，例如 #26A17B。");
      ok = false;
    } else setColorError("");
    if (!reasonReady()) ok = false;
    if (!ok) {
      focusFirstInvalidField();
      return;
    }
    if (changedFields(changes()).length === 0) {
      setSubmitError("没有需要保存的修改。");
      return;
    }
    setSubmitError("");
    setConfirmOpen(true);
  };

  const fieldLabels: Record<string, string> = {
    name: "名称",
    displayDecimals: "展示精度",
    logoColor: "图标颜色",
    sortWeight: "排序权重",
    enabled: "启用状态",
  };
  const busy = resyncMutation.isPending || updateMutation.isPending;
  const pendingPayload = confirmOpen ? changes() : null;
  return (
    <>
      <SidePanel
        open
        title={`编辑 ${current.symbol}`}
        description={
          current.scope === "global"
            ? "这是平台全局代币：保存后会创建本租户的覆盖行，只影响本租户。"
            : "链、合约地址、symbol 与 decimals 来自链上，不能手填。"
        }
        onClose={() => {
          if (!confirmOpen && resyncDiff === null) onClose();
        }}
        footer={
          <>
            <Button
              variant="ghost"
              type="button"
              onClick={onClose}
              disabled={busy}
            >
              取消
            </Button>
            <Button type="button" onClick={submit} disabled={busy}>
              <Save size={16} />
              保存修改
            </Button>
          </>
        }
      >
        <div className="side-panel-form">
          <div className="token-readonly-grid">
            <label className="form-field">
              <span>链</span>
              <input
                className="input"
                value={chain ? `${chain.name}（${chain.id}）` : current.chain}
                readOnly
                aria-readonly="true"
              />
            </label>
            <label className="form-field">
              <span>合约地址</span>
              <input
                className="input mono"
                value={isNative ? "原生币（没有合约）" : current.address}
                readOnly
                aria-readonly="true"
              />
            </label>
            <label className="form-field">
              <span>Symbol</span>
              <input
                className="input mono"
                value={current.symbol}
                readOnly
                aria-readonly="true"
              />
            </label>
            <label className="form-field">
              <span>Decimals</span>
              <input
                className="input mono"
                value={String(current.decimals)}
                readOnly
                aria-readonly="true"
              />
            </label>
            <div className="token-readonly-note">
              <span>
                {isNative
                  ? "原生币由平台维护，没有链上元数据。"
                  : current.scope === "global"
                    ? "平台全局代币的链上元数据由平台维护。"
                    : current.metadataSyncedAt
                      ? `上次从链上读取：${syncedAtLabel(current.metadataSyncedAt)}`
                      : "尚未记录链上读取时间。"}
              </span>
              {isNative ? null : (
                <span
                  title={
                    current.scope === "global"
                      ? "平台全局代币的链上元数据由平台维护，租户不能重新读取"
                      : undefined
                  }
                >
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={startResync}
                    disabled={busy || current.scope === "global"}
                  >
                    <RefreshCw size={14} />
                    {resyncMutation.isPending ? "读取中…" : "重新从链上读取"}
                  </Button>
                </span>
              )}
            </div>
          </div>
          {notice ? (
            <div className="success-banner" role="status">
              {notice}
            </div>
          ) : null}

          <label className="form-field">
            <span>名称</span>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="token-inline-fields">
            <label className="form-field">
              <span>展示精度</span>
              <input
                id="token-edit-display-decimals"
                className="input"
                type="number"
                min={0}
                max={current.decimals}
                step={1}
                value={displayDecimals}
                aria-invalid={Boolean(displayDecimalsError)}
                aria-describedby={
                  displayDecimalsError
                    ? "token-edit-display-decimals-error"
                    : "token-edit-display-decimals-hint"
                }
                onChange={(event) => {
                  setDisplayDecimals(event.target.value);
                  if (displayDecimalsError) setDisplayDecimalsError("");
                }}
              />
              {displayDecimalsError ? (
                <small
                  className="field-error"
                  id="token-edit-display-decimals-error"
                >
                  {displayDecimalsError}
                </small>
              ) : (
                <small id="token-edit-display-decimals-hint">
                  只影响显示，不参与金额换算；最多 {current.decimals} 位（=
                  代币精度）。
                </small>
              )}
            </label>
            <label className="form-field">
              <span>排序权重</span>
              <input
                id="token-edit-sort-weight"
                className="input"
                type="number"
                step={1}
                value={sortWeight}
                aria-invalid={Boolean(sortWeightError)}
                aria-describedby={
                  sortWeightError ? "token-edit-sort-weight-error" : undefined
                }
                onChange={(event) => {
                  setSortWeight(event.target.value);
                  if (sortWeightError) setSortWeightError("");
                }}
              />
              {sortWeightError ? (
                <small
                  className="field-error"
                  id="token-edit-sort-weight-error"
                >
                  {sortWeightError}
                </small>
              ) : (
                <small>数值越大越靠前。</small>
              )}
            </label>
          </div>
          <ColorField
            value={logoColor}
            error={colorError}
            errorId="token-edit-color-error"
            inputId="token-edit-color"
            onChange={(value) => {
              setLogoColor(value);
              if (colorError) setColorError("");
            }}
          />
          <label className="switch-row">
            <span>
              <strong>启用</strong>
              <small>停用后不再随 bootstrap 下发给 App。</small>
            </span>
            <input
              type="checkbox"
              aria-label="启用"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
          </label>
          <ReasonField
            id="token-edit-reason"
            value={reason}
            error={reasonError}
            placeholder="例如：把 USDT 展示精度改成 2 位"
            onChange={(value) => {
              setReason(value);
              if (reasonError) setReasonError("");
            }}
          />
          <FormValidationSummary errors={validationErrors} />
          <FeedbackNotice
            kind="error"
            message={submitError}
            onDismiss={() => setSubmitError("")}
          />
        </div>
      </SidePanel>

      <ConfirmDialog
        open={confirmOpen}
        title={`保存 ${current.symbol} 的修改？`}
        description={
          current.scope === "global"
            ? "会创建或更新本租户的覆盖行，平台全局行不受影响。此操作会写入操作审计。"
            : "保存后 App 下次刷新 bootstrap 即生效。此操作会写入操作审计。"
        }
        confirmLabel="确认保存"
        loading={updateMutation.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => updateMutation.mutate(changes())}
      >
        <div className="dialog-detail-list">
          <span>
            修改项：
            {pendingPayload
              ? changedFields(pendingPayload)
                  .map((key) => fieldLabels[key] ?? key)
                  .join("、")
              : "-"}
          </span>
          <span>基于数据库版本 v{expectedVersion}</span>
          <span>修改原因：{reason.trim()}</span>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={resyncDiff !== null}
        title="链上数据与目录不一致"
        description="确认后用链上读取的值覆盖目录里的 symbol 与 decimals；展示精度超过新精度时会被截到新精度。此操作会写入操作审计。"
        confirmLabel="按链上数据更新"
        tone="danger"
        loading={resyncMutation.isPending}
        onCancel={() => setResyncDiff(null)}
        onConfirm={() => resyncMutation.mutate(true)}
      >
        {resyncDiff ? (
          <table className="token-diff-table">
            <thead>
              <tr>
                <th>字段</th>
                <th>目录中</th>
                <th>链上</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Symbol</th>
                <td className="mono">{resyncDiff.current.symbol}</td>
                <td
                  className={
                    resyncDiff.current.symbol !== resyncDiff.onchain.symbol
                      ? "mono is-changed"
                      : "mono"
                  }
                  data-testid="resync-onchain-symbol"
                >
                  {resyncDiff.onchain.symbol}
                </td>
              </tr>
              <tr>
                <th>Decimals</th>
                <td className="mono">{resyncDiff.current.decimals}</td>
                <td
                  className={
                    resyncDiff.current.decimals !== resyncDiff.onchain.decimals
                      ? "mono is-changed"
                      : "mono"
                  }
                  data-testid="resync-onchain-decimals"
                >
                  {resyncDiff.onchain.decimals}
                </td>
              </tr>
            </tbody>
          </table>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
