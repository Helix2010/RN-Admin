import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
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
  publicApiUrl,
  type AppConfig,
  type BrandingView,
  type LocalizationView,
  type ManagedAppConfig,
} from "../../core/api";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FeedbackNotice,
  type FormValidationError,
  FormValidationSummary,
  focusFirstInvalidField,
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

const paletteUsage: Record<(typeof paletteKeys)[number], string> = {
  primary: "主按钮、选中状态和品牌强调",
  onPrimary: "主品牌色背景上的文字与图标",
  background: "App 页面最底层背景",
  surface: "卡片、导航栏和弹层容器",
  surfaceVariant: "次级卡片、筛选和输入区域",
  text: "标题、金额和重要正文",
  textMuted: "辅助说明、时间和次要信息",
  border: "卡片、输入框和分割线",
  success: "成功状态和安全提示",
  warning: "待处理、风险提醒和警告",
  danger: "失败、删除和危险操作",
  info: "普通信息和帮助提示",
  pricePositive: "价格上涨和正收益",
  priceNegative: "价格下跌和负收益",
  risk: "Web3 授权、交易等风险标签",
  focus: "输入框和可操作组件的焦点环",
  backdrop: "弹层后方的页面遮罩",
};

const tradingThemePreset: ManagedAppConfig["theme"] = {
  defaultMode: "system",
  allowUserOverride: true,
  paletteVersion: "trading-1",
  light: {
    primary: "#F0B90B",
    onPrimary: "#181A20",
    background: "#F5F5F5",
    surface: "#FFFFFF",
    surfaceVariant: "#F0F1F2",
    text: "#1E2329",
    textMuted: "#707A8A",
    border: "#EAECEF",
    success: "#0ECB81",
    warning: "#D0980B",
    danger: "#F6465D",
    info: "#3861FB",
    pricePositive: "#0ECB81",
    priceNegative: "#F6465D",
    risk: "#D0980B",
    focus: "#FCD535",
    backdrop: "rgba(24,26,32,0.56)",
  },
  dark: {
    primary: "#F0B90B",
    onPrimary: "#181A20",
    background: "#0B0E11",
    surface: "#181A20",
    surfaceVariant: "#23262D",
    text: "#EAECEF",
    textMuted: "#848E9C",
    border: "#2B3139",
    success: "#0ECB81",
    warning: "#F0B90B",
    danger: "#F6465D",
    info: "#4A7DFF",
    pricePositive: "#0ECB81",
    priceNegative: "#F6465D",
    risk: "#F0B90B",
    focus: "#FCD535",
    backdrop: "rgba(0,0,0,0.72)",
  },
};

const featureLabels: Record<keyof ManagedAppConfig["features"], string> = {
  updateCenter: "升级中心",
  otaEnabled: "OTA 热更新",
  directUpdateEnabled: "Android 直装更新",
  diagnosticsEnabled: "诊断信息",
};

const moduleLabels: Record<keyof ManagedAppConfig["modules"], string> = {
  predict: "预测市场",
  dex: "DEX 兑换",
};

function moduleNavigationItems(modules: ManagedAppConfig["modules"]): string[] {
  if (modules.predict && modules.dex) return ["首页", "预测", "DEX", "资产"];
  if (modules.predict) return ["首页", "预测", "持仓", "资产"];
  return ["首页", "行情", "兑换", "资产"];
}

export function AppConfigPage({ tenantId }: AdminPageProps) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["config", tenantId],
    queryFn: () => adminApi.config(tenantId),
  });
  const brandingQuery = useQuery({
    queryKey: ["branding", tenantId],
    queryFn: () => adminApi.branding(),
    staleTime: 15_000,
  });
  const localizationQuery = useQuery({
    queryKey: ["localization", tenantId],
    queryFn: () => adminApi.localization(),
    staleTime: 15_000,
  });
  const [draft, setDraft] = useState<ManagedAppConfig | null>(null);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [saveComposerOpen, setSaveComposerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "error" | "success";
    message: string;
  } | null>(null);
  const [configErrors, setConfigErrors] = useState<FormValidationError[]>([]);

  const mutation = useMutation({
    mutationFn: ({
      config,
      expectedVersion,
      changeReason,
    }: {
      config: ManagedAppConfig;
      expectedVersion: number;
      changeReason: string;
    }) =>
      adminApi.saveConfig(
        tenantId,
        // 钱包段由「钱包与链」页维护；这里省略它，服务端沿用已存的值。
        // 传回去的是归一化后的视图，会把平台默认端点固化成租户快照
        { ...config, wallet: undefined },
        expectedVersion,
        changeReason,
      ),
    onSuccess: (saved) => {
      queryClient.setQueryData<AppConfig>(["config", tenantId], saved);
      void queryClient.invalidateQueries({ queryKey: ["audits", tenantId] });
      setDraft(null);
      setDraftVersion(null);
      setReason("");
      setReasonError("");
      setSaveComposerOpen(false);
      setConfirmOpen(false);
      setFeedback({
        kind: "success",
        message: `配置已激活，数据库版本为 ${saved.metadata.databaseVersion}。`,
      });
    },
    onError: (error) => {
      setConfirmOpen(false);
      // 乐观锁冲突（别人先改了）之后本地版本号已经过期，不刷新的话再点一次还是 409
      void queryClient.invalidateQueries({ queryKey: ["config", tenantId] });
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
    setReasonError("");
    setSaveComposerOpen(false);
    setFeedback(null);
    setConfigErrors([]);
  };
  const cancelEdit = () => {
    setDraft(null);
    setDraftVersion(null);
    setReason("");
    setReasonError("");
    setSaveComposerOpen(false);
    setFeedback(null);
    setConfigErrors([]);
  };
  const updateDraft = (change: (next: ManagedAppConfig) => void) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      change(next);
      return next;
    });
  };
  const openSaveComposer = () => {
    if (!draft || draftVersion === null) return;
    const errors = validateConfigErrors(draft);
    if (errors.length > 0) {
      setConfigErrors(errors);
      setFeedback(null);
      focusFirstInvalidField(`#${errors[0]!.targetId}`);
      return;
    }
    setConfigErrors([]);
    setFeedback(null);
    setReasonError("");
    setSaveComposerOpen(true);
  };
  const continueSave = () => {
    if (reason.trim().length < 3) {
      setReasonError("请填写至少 3 个字符的修改原因。");
      focusFirstInvalidField('.save-composer [aria-invalid="true"]');
      return;
    }
    setReasonError("");
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
      <FeedbackNotice
        kind={feedback?.kind ?? "success"}
        message={feedback?.message ?? ""}
        placement="viewport"
        onDismiss={() => setFeedback(null)}
      />
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

      {draft && draftVersion !== null ? (
        <ConfigEditor
          draft={draft}
          databaseVersion={draftVersion}
          reason={reason}
          reasonError={reasonError}
          saveComposerOpen={saveComposerOpen}
          saving={mutation.isPending}
          onReasonChange={(value) => {
            setReason(value);
            if (reasonError) setReasonError("");
          }}
          onChange={updateDraft}
          onCancel={cancelEdit}
          onOpenSave={openSaveComposer}
          onCloseSave={() => {
            setSaveComposerOpen(false);
            setReasonError("");
          }}
          onContinueSave={continueSave}
          branding={brandingQuery.data}
          localization={localizationQuery.data}
          validationErrors={configErrors}
        />
      ) : (
        <ConfigSummary data={data} branding={brandingQuery.data} />
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

function ConfigSummary({
  data,
  branding,
}: {
  data: AppConfig;
  branding?: BrandingView;
}) {
  const brandingConfig = branding?.config ?? {};
  const launch =
    brandingConfig.launch && typeof brandingConfig.launch === "object"
      ? (brandingConfig.launch as Record<string, unknown>)
      : {};
  const launchEnabled = launch.enabled !== false;
  const brandingVersion = branding?.metadata.version ?? 0;
  const selectedVisual =
    launch.defaultVisual && typeof launch.defaultVisual === "object"
      ? (launch.defaultVisual as Record<string, unknown>)
      : {};
  const lightVisual =
    selectedVisual.light && typeof selectedVisual.light === "object"
      ? (selectedVisual.light as Record<string, unknown>)
      : {};
  const logo =
    lightVisual.logo && typeof lightVisual.logo === "object"
      ? (lightVisual.logo as Record<string, unknown>)
      : undefined;
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
            <Database size={18} />
            <strong>业务模块</strong>
            <span>
              {Object.entries(data.config.modules)
                .filter(([, enabled]) => enabled)
                .map(
                  ([key]) =>
                    moduleLabels[key as keyof ManagedAppConfig["modules"]],
                )
                .join(" · ")}
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
          <div className="config-item">
            <Palette size={18} />
            <strong>品牌与启动</strong>
            <span>
              {launchEnabled ? "启动页已启用" : "启动页已关闭"} · 品牌配置 v
              {brandingVersion}
              {typeof logo?.assetId === "string"
                ? " · Logo 已配置"
                : " · 使用内置 Logo"}
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
  reasonError,
  saveComposerOpen,
  saving,
  onReasonChange,
  onChange,
  onCancel,
  onOpenSave,
  onCloseSave,
  onContinueSave,
  branding,
  localization,
  validationErrors,
}: {
  draft: ManagedAppConfig;
  databaseVersion: number;
  reason: string;
  reasonError: string;
  saveComposerOpen: boolean;
  saving: boolean;
  onReasonChange: (value: string) => void;
  onChange: (change: (next: ManagedAppConfig) => void) => void;
  onCancel: () => void;
  onOpenSave: () => void;
  onCloseSave: () => void;
  onContinueSave: () => void;
  branding?: BrandingView;
  localization?: LocalizationView;
  validationErrors: FormValidationError[];
}) {
  const [previewMode, setPreviewMode] = useState<"light" | "dark">("light");
  const [previewLocale, setPreviewLocale] = useState(
    localization?.settings.fallbackLanguage ?? "zh-CN",
  );
  const previewLanguages = Object.entries(
    localization?.settings.languages ?? {},
  )
    .filter(([, item]) => item.enabled)
    .sort(([, left], [, right]) => left.sort - right.sort);
  useEffect(() => {
    if (!previewLanguages.some(([code]) => code === previewLocale))
      setPreviewLocale(
        localization?.settings.fallbackLanguage ??
          previewLanguages[0]?.[0] ??
          "zh-CN",
      );
  }, [
    localization?.settings.fallbackLanguage,
    previewLanguages,
    previewLocale,
  ]);
  return (
    <div className="config-editor">
      <FormValidationSummary errors={validationErrors} />
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
              id="app-config-configVersion"
              className="input"
              aria-invalid={Boolean(
                validationErrors.some(
                  (error) => error.targetId === "app-config-configVersion",
                ),
              )}
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
              id="app-config-ttlSeconds"
              className="input"
              type="number"
              min={30}
              max={86400}
              value={draft.ttlSeconds}
              aria-invalid={Boolean(
                validationErrors.some(
                  (error) => error.targetId === "app-config-ttlSeconds",
                ),
              )}
              onChange={(event) =>
                onChange((next) => {
                  next.ttlSeconds = Number(event.target.value);
                })
              }
            />
          </Field>
          <Field label="状态页地址" hint="必须是 HTTPS/HTTP 完整 URL">
            <input
              id="app-config-statusPageUrl"
              className="input"
              type="url"
              value={draft.support.statusPageUrl}
              aria-invalid={Boolean(
                validationErrors.some(
                  (error) => error.targetId === "app-config-statusPageUrl",
                ),
              )}
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
          <Field
            label="调色板版本"
            hint="修改后建议同步递增版本号，便于 App 缓存失效"
          >
            <input
              id="app-config-paletteVersion"
              className="input palette-version-input"
              value={draft.theme.paletteVersion}
              aria-invalid={Boolean(
                validationErrors.some(
                  (error) => error.targetId === "app-config-paletteVersion",
                ),
              )}
              onChange={(event) =>
                onChange((next) => {
                  next.theme.paletteVersion = event.target.value;
                })
              }
            />
          </Field>
          <div className="theme-mode-tabs" role="tablist" aria-label="预览主题">
            {(["light", "dark"] as const).map((mode) => (
              <button
                className={previewMode === mode ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={previewMode === mode}
                key={mode}
                onClick={() => setPreviewMode(mode)}
              >
                {mode === "light" ? "浅色主题" : "深色主题"}
              </button>
            ))}
          </div>
          {previewLanguages.length > 0 ? (
            <div
              className="release-note-language-tabs theme-preview-language-tabs"
              role="tablist"
              aria-label="预览语言"
            >
              {previewLanguages.map(([code, item]) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewLocale === code}
                  className={`release-note-language-tab${previewLocale === code ? " is-active" : ""}`}
                  key={code}
                  onClick={() => setPreviewLocale(code)}
                >
                  {item.nativeName || item.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="theme-workbench">
            <ThemePreview
              mode={previewMode}
              palette={draft.theme[previewMode]}
              messages={draft.localization.messages}
              featureState={draft.features}
              updatePolicy={draft.updatePolicy}
              locale={previewLocale}
              localization={localization}
              branding={branding}
            />
            <div className="palette-panel palette-editor-panel">
              <div className="palette-editor-heading">
                <div>
                  <h3>
                    {previewMode === "light" ? "Light Palette" : "Dark Palette"}
                  </h3>
                  <p>修改后左侧 App 落地页会实时更新。</p>
                </div>
                <span className="status-pill status-editing">实时预览</span>
              </div>
              <div className="palette-grid">
                {paletteKeys.map((key) => (
                  <label className="palette-field" key={key}>
                    <span>{paletteLabels[key]}</span>
                    <small>{paletteUsage[key]}</small>
                    <div className="color-input-row">
                      {isHexColor(draft.theme[previewMode][key]) ? (
                        <input
                          className="color-picker"
                          type="color"
                          aria-label={`${previewMode === "light" ? "浅色" : "深色"}${paletteLabels[key]}颜色选择器`}
                          value={draft.theme[previewMode][key]}
                          onChange={(event) =>
                            onChange((next) => {
                              next.theme[previewMode][key] = event.target.value;
                            })
                          }
                        />
                      ) : (
                        <i
                          className="color-swatch"
                          aria-hidden="true"
                          style={{ background: draft.theme[previewMode][key] }}
                        />
                      )}
                      <input
                        id={`app-config-${previewMode}-${key}`}
                        className="input mono"
                        aria-invalid={Boolean(
                          validationErrors.some(
                            (error) =>
                              error.targetId ===
                              `app-config-${previewMode}-${key}`,
                          ),
                        )}
                        aria-label={`${previewMode === "light" ? "浅色" : "深色"}${paletteLabels[key]}`}
                        value={draft.theme[previewMode][key]}
                        onChange={(event) =>
                          onChange((next) => {
                            next.theme[previewMode][key] = event.target.value;
                          })
                        }
                      />
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="config-two-column">
        <Card>
          <div className="card-header">
            <div>
              <h2>业务模块</h2>
              <p className="section-caption">
                控制 App 首页、底栏、资产账户和设置项，至少开启一个模块
              </p>
            </div>
          </div>
          <div className="preset-toolbar">
            <button
              className="button button-ghost"
              type="button"
              onClick={() =>
                onChange((next) => {
                  next.theme = structuredClone(tradingThemePreset);
                })
              }
            >
              应用交易产品配色预设
            </button>
            <span className="section-caption">
              应用后保存配置，App 将通过 Bootstrap 使用 Light / Dark 主题色。
            </span>
          </div>
          <div className="card-body switch-list">
            {(
              Object.keys(moduleLabels) as (keyof ManagedAppConfig["modules"])[]
            ).map((key) => (
              <label className="switch-row" key={key}>
                <span>
                  <strong>{moduleLabels[key]}</strong>
                  <small className="mono">modules.{key}</small>
                  {key === "predict" && (
                    <small className="section-caption">
                      开启前要在「预测市场」页配置平台关联（接口域名、scopeId、链），否则保存会被服务端拒绝。
                    </small>
                  )}
                </span>
                <input
                  id={`app-config-module-${key}`}
                  type="checkbox"
                  checked={draft.modules[key]}
                  disabled={
                    draft.modules[key] &&
                    !draft.modules[key === "predict" ? "dex" : "predict"]
                  }
                  onChange={(event) =>
                    onChange((next) => {
                      next.modules[key] = event.target.checked;
                    })
                  }
                />
              </label>
            ))}
            <div
              className="module-navigation-preview"
              aria-label="当前底栏预览"
            >
              <small>当前底栏</small>
              <div>
                {moduleNavigationItems(draft.modules).map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          </div>
        </Card>

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
                id="app-config-minSupportedVersion"
                className="input"
                value={draft.updatePolicy.minSupportedVersion}
                aria-invalid={Boolean(
                  validationErrors.some(
                    (error) =>
                      error.targetId === "app-config-minSupportedVersion",
                  ),
                )}
                onChange={(event) =>
                  onChange((next) => {
                    next.updatePolicy.minSupportedVersion = event.target.value;
                  })
                }
              />
            </Field>
            <Field label="最新版本">
              <input
                id="app-config-latestVersion"
                className="input"
                value={draft.updatePolicy.latestVersion}
                aria-invalid={Boolean(
                  validationErrors.some(
                    (error) => error.targetId === "app-config-latestVersion",
                  ),
                )}
                onChange={(event) =>
                  onChange((next) => {
                    next.updatePolicy.latestVersion = event.target.value;
                  })
                }
              />
            </Field>
            <Field label="OTA Channel">
              <input
                id="app-config-otaChannel"
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

      <Card
        className={`save-card ${saveComposerOpen ? "save-card-expanded" : "save-card-compact"}`}
      >
        {!saveComposerOpen ? (
          <div className="card-body save-toolbar">
            <div className="save-state">
              <StatusPill status="editing" />
              <span>配置修改只在当前草稿中，校验通过后才会激活。</span>
            </div>
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
                <div className="eyebrow">Activate configuration</div>
                <h2>保存并激活应用配置</h2>
                <p>
                  保存后 RN-App 下一次刷新 bootstrap
                  即会读取新的主题、功能开关和升级策略。
                </p>
              </div>
              <Button variant="ghost" type="button" onClick={onCloseSave}>
                收起
              </Button>
            </div>
            <label className="form-field save-reason-field">
              <span>修改原因</span>
              <textarea
                id="app-config-change-reason"
                autoFocus
                className="input textarea"
                aria-invalid={Boolean(reasonError)}
                aria-describedby={
                  reasonError ? "app-config-change-reason-error" : undefined
                }
                value={reason}
                placeholder="例如：调整生产环境主题并更新 OTA 渠道"
                onChange={(event) => onReasonChange(event.target.value)}
              />
              {reasonError ? (
                <small
                  className="field-error"
                  id="app-config-change-reason-error"
                >
                  {reasonError}
                </small>
              ) : (
                <small>至少填写 3 个字符，将写入配置审计。</small>
              )}
            </label>
            <FormValidationSummary
              errors={
                reasonError
                  ? [
                      {
                        field: "修改原因",
                        message: reasonError,
                        targetId: "app-config-change-reason",
                      },
                    ]
                  : []
              }
            />
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

type PreviewPalette = ManagedAppConfig["theme"]["light"];

function brandingLogoUrl(
  branding: BrandingView | undefined,
  locale: string,
  mode: "light" | "dark",
): string {
  const config = branding?.config as Record<string, unknown> | undefined;
  const launch = config?.launch as Record<string, unknown> | undefined;
  const defaults = launch?.defaultVisual as Record<string, unknown> | undefined;
  const overrides = launch?.localeOverrides as
    Record<string, unknown> | undefined;
  const localeVisual = overrides?.[locale] as
    Record<string, unknown> | undefined;
  const localeMode = localeVisual?.[mode] as
    Record<string, unknown> | undefined;
  const defaultMode = defaults?.[mode] as Record<string, unknown> | undefined;
  const asset = (localeMode?.logo ?? defaultMode?.logo) as
    Record<string, unknown> | undefined;
  const url = asset?.fileUrl;
  return typeof url === "string" ? publicApiUrl(url) : "";
}

function PreviewBrandLogo({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) return <span className="app-preview-logo">D</span>;
  return (
    <img
      className="app-preview-logo-image"
      src={url}
      alt="AnyFun"
      onError={() => setFailed(true)}
    />
  );
}

function ThemePreview({
  mode,
  palette,
  messages,
  featureState,
  updatePolicy,
  locale,
  localization,
  branding,
}: {
  mode: "light" | "dark";
  palette: PreviewPalette;
  messages: ManagedAppConfig["localization"]["messages"];
  featureState: ManagedAppConfig["features"];
  updatePolicy: ManagedAppConfig["updatePolicy"];
  locale: string;
  localization?: LocalizationView;
  branding?: BrandingView;
}) {
  const copy = (key: string, fallback: string): string => {
    const document = localization?.documents.items.find(
      (candidate) => candidate.key === key.toLowerCase(),
    );
    const remote = document?.values[locale]?.content;
    const fallbackRemote =
      document?.values[localization?.settings.fallbackLanguage ?? ""]?.content;
    return (
      remote ??
      fallbackRemote ??
      messages["zh-CN"][key] ??
      messages["en-US"][key] ??
      fallback
    );
  };
  const logoUrl = brandingLogoUrl(branding, locale, mode);
  const previewStyle = {
    "--preview-background": palette.background,
    "--preview-surface": palette.surface,
    "--preview-surface-variant": palette.surfaceVariant,
    "--preview-text": palette.text,
    "--preview-muted": palette.textMuted,
    "--preview-border": palette.border,
    "--preview-primary": palette.primary,
    "--preview-on-primary": palette.onPrimary,
    "--preview-success": palette.success,
    "--preview-warning": palette.warning,
    "--preview-danger": palette.danger,
    "--preview-info": palette.info,
    "--preview-price-positive": palette.pricePositive,
    "--preview-price-negative": palette.priceNegative,
    "--preview-risk": palette.risk,
    "--preview-focus": palette.focus,
  } as CSSProperties;
  return (
    <div className="theme-preview-panel">
      <div className="theme-preview-heading">
        <div>
          <h3>App 首页预览</h3>
          <p>模拟真实 App 中主题令牌的使用位置</p>
        </div>
        <span className="status-pill">
          {mode === "light" ? "Light" : "Dark"}
        </span>
      </div>
      <div className="theme-preview-layout">
        <div
          className="app-preview"
          style={previewStyle}
          data-testid="app-theme-preview"
        >
          <div className="app-preview-topbar">
            <PreviewBrandLogo url={logoUrl} />
            <span className="app-preview-title">
              {copy("app.name", "AnyFun")}
            </span>
            <span className="app-preview-menu">•••</span>
          </div>
          <div className="app-preview-body">
            <span className="app-preview-eyebrow">PORTFOLIO</span>
            <h4>{copy("home.title", "资产总览")}</h4>
            <p className="app-preview-muted">
              {copy("home.description", "实时查看你的 Web3 资产")}
            </p>
            <div className="app-preview-balance">
              <span className="app-preview-muted">总资产估值</span>
              <strong>¥ 128,640.00</strong>
              <span className="app-preview-positive">+12.48%</span>
            </div>
            <div className="app-preview-actions">
              <button type="button">
                {copy("home.primaryAction", "买入")}
              </button>
              <button type="button">
                {copy("home.secondaryAction", "转账")}
              </button>
            </div>
            <div className="app-preview-statuses">
              <span>{copy("status.connected", "已连接")}</span>
              <span>{copy("home.network", "主网")}</span>
              <span>
                {featureState.diagnosticsEnabled
                  ? copy("feature.diagnostics", "诊断")
                  : ""}
              </span>
            </div>
            <div className="app-preview-list-item">
              <span className="app-preview-token-icon">E</span>
              <span>
                <strong>Ethereum</strong>
                <small className="app-preview-muted">ETH · 主网</small>
              </span>
              <strong className="app-preview-amount">2.48 ETH</strong>
            </div>
            <div className="app-preview-market-moves">
              <span>ETH +3.20%</span>
              <span>BTC -1.14%</span>
            </div>
            <div className="app-preview-alert">
              <span>!</span>
              <span>
                {copy("home.securityDescription", "交易前请确认网络与收款地址")}
              </span>
            </div>
          </div>
        </div>
        <div className="theme-preview-legend">
          <h4>令牌使用说明</h4>
          {[
            ["primary", "主品牌色", "买入、转账主按钮"],
            ["surface", "容器背景", "资产卡片和顶部导航"],
            ["text", "主文本", "标题和资产金额"],
            ["success", "成功色", "收益和完成状态"],
            ["warning", "警告色", "交易风险提醒"],
            ["border", "边框色", "卡片和列表分隔线"],
          ].map(([key, label, usage]) => (
            <div className="theme-preview-legend-item" key={key}>
              <i
                style={{ background: palette[key as keyof PreviewPalette] }}
                aria-hidden="true"
              />
              <span>
                <strong>{label}</strong>
                <small>{usage}</small>
              </span>
              <code>{palette[key as keyof PreviewPalette]}</code>
            </div>
          ))}
        </div>
      </div>
      <div className="theme-preview-runtime-meta">
        <span>升级中心：{featureState.updateCenter ? "已启用" : "已关闭"}</span>
        <span>OTA：{featureState.otaEnabled ? "已启用" : "已关闭"}</span>
        <span>最低版本：{updatePolicy.minSupportedVersion}</span>
        <span>最新版本：{updatePolicy.latestVersion}</span>
      </div>
    </div>
  );
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value.trim());
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

function validateConfigErrors(config: ManagedAppConfig): FormValidationError[] {
  const parsed = managedAppConfigSchema.safeParse(config);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.join(".");
    const targets: Record<string, [string, string]> = {
      configVersion: ["配置版本", "app-config-configVersion"],
      ttlSeconds: ["缓存 TTL", "app-config-ttlSeconds"],
      "support.statusPageUrl": ["状态页地址", "app-config-statusPageUrl"],
      "theme.paletteVersion": ["调色板版本", "app-config-paletteVersion"],
      "updatePolicy.minSupportedVersion": [
        "最低支持版本",
        "app-config-minSupportedVersion",
      ],
      "updatePolicy.latestVersion": ["最新版本", "app-config-latestVersion"],
      "updatePolicy.otaChannel": ["OTA Channel", "app-config-otaChannel"],
    };
    const [field, targetId] =
      targets[path] ?? ([path || "配置", "app-config-configVersion"] as const);
    return [{ field, message: issue.message, targetId }];
  }
  if (!config.modules.predict && !config.modules.dex) {
    return [
      {
        field: "业务模块",
        message: "预测市场和 DEX 兑换至少需要开启一个。",
        targetId: "app-config-module-predict",
      },
    ];
  }
  for (const mode of ["light", "dark"] as const) {
    for (const key of paletteKeys) {
      const value = config.theme[mode][key].trim();
      const valid =
        isHexColor(value) ||
        (key === "backdrop" &&
          /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(
            value,
          ));
      if (!valid) {
        return [
          {
            field: `${mode === "light" ? "浅色" : "深色"}${paletteLabels[key]}`,
            message: `必须使用 #RRGGBB${key === "backdrop" ? " 或 rgba(...)" : ""} 格式。`,
            targetId: `app-config-${mode}-${key}`,
          },
        ];
      }
    }
  }
  const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
  if (!semver.test(config.updatePolicy.minSupportedVersion)) {
    return [
      {
        field: "最低支持版本",
        message: "必须使用 SemVer，例如 1.2.0。",
        targetId: "app-config-minSupportedVersion",
      },
    ];
  }
  if (!semver.test(config.updatePolicy.latestVersion)) {
    return [
      {
        field: "最新版本",
        message: "必须使用 SemVer，例如 1.2.0。",
        targetId: "app-config-latestVersion",
      },
    ];
  }
  if (
    compareVersions(
      config.updatePolicy.minSupportedVersion,
      config.updatePolicy.latestVersion,
    ) > 0
  ) {
    return [
      {
        field: "升级版本范围",
        message: "最低支持版本不能高于最新版本。",
        targetId: "app-config-latestVersion",
      },
    ];
  }
  return [];
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
