import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image, Palette, Save, UploadCloud } from "lucide-react";
import {
  adminApi,
  publicApiUrl,
  uploadArtifactFile,
  type BrandingView,
  type LocalizationView,
} from "../../core/api";
import {
  Button,
  Card,
  EmptyState,
  FeedbackNotice,
  FileDropzone,
  SidePanel,
} from "../../design-system/components";
import type { AdminPageProps } from "../../plugin-system/types";

type Json = Record<string, unknown>;
type Language = LocalizationView["settings"]["languages"][string];
const clone = <T,>(value: T): T => structuredClone(value);

function enabledLanguages(data?: LocalizationView): [string, Language][] {
  return Object.entries(data?.settings.languages ?? {})
    .filter(([, value]) => value.enabled)
    .sort(([, left], [, right]) => left.sort - right.sort);
}

function child(parent: Json, key: string): Json {
  const current = parent[key];
  if (current && typeof current === "object" && !Array.isArray(current))
    return current as Json;
  const next: Json = {};
  parent[key] = next;
  return next;
}

function readPath(config: Json, keys: string[]): unknown {
  let current: unknown = config;
  for (const key of keys) {
    if (!current || typeof current !== "object" || Array.isArray(current))
      return undefined;
    current = (current as Json)[key];
  }
  return current;
}

function visual(config: Json, locale: string, mode: "light" | "dark"): Json {
  if (locale === "default") {
    return child(child(child(config, "launch"), "defaultVisual"), mode);
  }
  return child(
    child(child(child(config, "launch"), "localeOverrides"), locale),
    mode,
  );
}

export function BrandingPage({ tenantId }: AdminPageProps) {
  const queryClient = useQueryClient();
  const brandingQuery = useQuery({
    queryKey: ["branding", tenantId],
    queryFn: () => adminApi.branding(),
  });
  const localizationQuery = useQuery({
    queryKey: ["localization", tenantId],
    queryFn: () => adminApi.localization(),
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Json | null>(null);
  const [version, setVersion] = useState(0);
  const [locale, setLocale] = useState("default");
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [reason, setReason] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<
    Record<string, File | null>
  >({});
  const [feedback, setFeedback] = useState<{
    kind: "error" | "success";
    message: string;
  } | null>(null);

  const languages = useMemo(
    () => enabledLanguages(localizationQuery.data),
    [localizationQuery.data],
  );
  const allLocales = useMemo(
    () =>
      [
        [
          "default",
          {
            label: "公共资源",
            nativeName: "公共资源",
            enabled: true,
            direction: "ltr" as const,
            sort: 0,
            source: "tenant" as const,
            publishStatus: "published",
          },
        ],
        ...languages,
      ] as [string, Language][],
    [languages],
  );
  const saveMutation = useMutation({
    mutationFn: () =>
      adminApi.saveBranding(draft ?? {}, version, reason.trim()),
    onSuccess: (saved) => {
      queryClient.setQueryData<BrandingView>(["branding", tenantId], saved);
      setEditing(false);
      setDraft(null);
      setReason("");
      setFeedback({
        kind: "success",
        message: `品牌资源已发布，版本 ${saved.metadata.version}`,
      });
    },
    onError: (error) =>
      setFeedback({
        kind: "error",
        message: `保存失败：${error instanceof Error ? error.message : "未知错误"}`,
      }),
  });

  if (brandingQuery.isLoading || localizationQuery.isLoading)
    return <EmptyState title="正在加载品牌配置" />;
  if (brandingQuery.isError || localizationQuery.isError)
    return <div className="error-banner">无法加载品牌配置，请刷新后重试。</div>;
  if (!brandingQuery.data) return <EmptyState title="没有品牌配置" />;
  const activeConfig = brandingQuery.data.config as Json;
  const previewVisual = draft ? visual(draft, locale, mode) : {};
  const previewLogoValue = readPath(previewVisual, ["logo", "localPreview"]);
  const storedLogoValue = readPath(previewVisual, ["logo", "fileUrl"]);
  const previewLogo =
    typeof previewLogoValue === "string"
      ? previewLogoValue
      : typeof storedLogoValue === "string"
        ? publicApiUrl(storedLogoValue)
        : "";
  const documents = localizationQuery.data?.documents.items ?? [];
  const titleKey = String(
    readPath(draft ?? {}, ["launch", "messages", "titleKey"]) ?? "launch.title",
  ).toLowerCase();
  const subtitleKey = String(
    readPath(draft ?? {}, ["launch", "messages", "subtitleKey"]) ??
      "launch.subtitle",
  ).toLowerCase();
  const documentValue = (key: string): string => {
    const item = documents.find((candidate) => candidate.key === key);
    if (!item) return key;
    const languageValue = item.values[locale];
    const fallbackValue =
      item.values[localizationQuery.data?.settings.fallbackLanguage ?? ""];
    return languageValue?.content || fallbackValue?.content || key;
  };
  const previewBackgroundValue = readPath(previewVisual, [
    "backgroundImage",
    "localPreview",
  ]);
  const storedBackgroundValue = readPath(previewVisual, [
    "backgroundImage",
    "fileUrl",
  ]);
  const previewBackground =
    typeof previewBackgroundValue === "string"
      ? previewBackgroundValue
      : typeof storedBackgroundValue === "string"
        ? publicApiUrl(storedBackgroundValue)
        : "";

  const beginEdit = () => {
    setDraft(clone(brandingQuery.data!.config));
    setVersion(
      brandingQuery.data!.metadata.sourceTenant === tenantId
        ? brandingQuery.data!.metadata.version
        : 0,
    );
    setEditing(true);
    setFeedback(null);
  };
  const update = (change: (next: Json) => void) =>
    setDraft((current) => {
      if (!current) return current;
      const next = clone(current);
      change(next);
      return next;
    });
  const upload = async (
    file: File,
    assetType: "launch_logo" | "launch_background",
  ) => {
    if (!draft) return;
    if (!/^image\/(png|jpeg)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
      setFeedback({
        kind: "error",
        message: "仅支持不超过 5MB 的 PNG 或 JPG 图片",
      });
      return;
    }
    const ticket = await adminApi.createBrandingAssetUpload({
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      assetType,
      locale: locale === "default" ? undefined : locale,
      theme: mode,
    });
    setUploadProgress(0);
    try {
      await uploadArtifactFile(ticket.upload, file, setUploadProgress);
    } catch (error) {
      await adminApi
        .deleteBrandingAsset(ticket.asset.token)
        .catch(() => undefined);
      setUploadProgress(null);
      throw error;
    }
    setUploadProgress(100);
    update((next) => {
      const target = visual(next, locale, mode);
      const field =
        assetType === "launch_background" ? "backgroundImage" : "logo";
      target[field] = {
        uploadToken: ticket.asset.token,
        localPreview: URL.createObjectURL(file),
      };
    });
  };

  return (
    <div className="branding-page">
      <FeedbackNotice
        kind={feedback?.kind ?? "success"}
        message={feedback?.message ?? ""}
        placement="viewport"
        onDismiss={() => setFeedback(null)}
      />
      <div className="page-heading">
        <div>
          <div className="eyebrow">Brand and launch</div>
          <h1>品牌与启动</h1>
          <p>配置 App 内启动页与品牌 Logo；系统桌面图标仍需全量 APK 更新。</p>
        </div>
        <Button onClick={beginEdit}>
          <Palette size={16} />
          编辑配置
        </Button>
      </div>
      <Card>
        <div className="card-header">
          <div>
            <h2>当前生效配置</h2>
            <p className="section-caption">
              版本 v{brandingQuery.data.metadata.version} · 来源租户{" "}
              {brandingQuery.data.metadata.sourceTenant}
            </p>
          </div>
          <span className="mono muted">
            {String(
              readPath(activeConfig, ["launch", "animation", "type"]) ??
                "fade_scale",
            )}
          </span>
        </div>
        <div className="card-body config-list">
          <div className="config-item">
            <Image size={18} />
            <strong>App 内启动页</strong>
            <span>
              {readPath(activeConfig, ["launch", "enabled"]) === false
                ? "已关闭"
                : "已启用"}
            </span>
          </div>
          <div className="config-item">
            <UploadCloud size={18} />
            <strong>远程资源</strong>
            <span>下载后校验，下一次启动生效，旧版本受控清理</span>
          </div>
        </div>
      </Card>
      <SidePanel
        open={editing}
        title="编辑品牌与启动"
        description="语言来自多语言管理，保存前上传到临时资源，发布后才对 App 生效。"
        onClose={() => setEditing(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              取消
            </Button>
            <Button
              disabled={saveMutation.isPending || reason.trim().length < 3}
              onClick={() => saveMutation.mutate()}
            >
              <Save size={16} />
              发布资源
            </Button>
          </>
        }
      >
        <div className="form-field">
          <span>语言</span>
          <div className="release-note-language-tabs" role="tablist">
            {allLocales.map(([code, item]) => (
              <button
                type="button"
                key={code}
                role="tab"
                aria-selected={locale === code}
                className={`release-note-language-tab${locale === code ? " is-active" : ""}`}
                onClick={() => setLocale(code)}
              >
                {item.nativeName || item.label}
                {code !== "default" &&
                languages.some(
                  ([c]) =>
                    c === code &&
                    c === localizationQuery.data?.settings.fallbackLanguage,
                )
                  ? "（默认）"
                  : ""}
              </button>
            ))}
          </div>
        </div>
        <div className="form-field">
          <span>主题预览</span>
          <div
            className="release-note-language-tabs"
            role="tablist"
            aria-label="启动页主题"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "light"}
              className={`release-note-language-tab${mode === "light" ? " is-active" : ""}`}
              onClick={() => setMode("light")}
            >
              浅色
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "dark"}
              className={`release-note-language-tab${mode === "dark" ? " is-active" : ""}`}
              onClick={() => setMode("dark")}
            >
              深色
            </button>
          </div>
        </div>
        <label className="form-field">
          <span>启动标题 Key</span>
          <input
            className="input"
            value={String(
              readPath(draft ?? {}, ["launch", "messages", "titleKey"]) ??
                "launch.title",
            )}
            onChange={(event) =>
              update((next) => {
                child(child(next, "launch"), "messages").titleKey =
                  event.target.value;
              })
            }
          />
        </label>
        <label className="form-field">
          <span>副标题 Key</span>
          <input
            className="input"
            value={String(
              readPath(draft ?? {}, ["launch", "messages", "subtitleKey"]) ??
                "launch.subtitle",
            )}
            onChange={(event) =>
              update((next) => {
                child(child(next, "launch"), "messages").subtitleKey =
                  event.target.value;
              })
            }
          />
        </label>
        <label className="form-field">
          <span>背景颜色</span>
          <input
            className="input mono"
            value={String(
              visual(draft ?? {}, locale, mode).backgroundColor ??
                (mode === "dark" ? "#0B1220" : "#F4F7FB"),
            )}
            onChange={(event) =>
              update((next) => {
                visual(next, locale, mode).backgroundColor = event.target.value;
              })
            }
          />
        </label>
        <div
          className="brand-launch-preview"
          style={{
            backgroundColor: String(
              previewVisual.backgroundColor ??
                (mode === "dark" ? "#0B1220" : "#F4F7FB"),
            ),
            backgroundImage: previewBackground
              ? `url(${JSON.stringify(previewBackground)})`
              : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          {previewLogo ? (
            <img src={previewLogo} alt="启动 Logo 预览" />
          ) : (
            <div className="brand-launch-preview-placeholder">A</div>
          )}
          <strong>{documentValue(titleKey)}</strong>
          <span>
            {locale === "default"
              ? "公共资源预览"
              : `${locale} · ${mode === "light" ? "浅色" : "深色"} · ${documentValue(subtitleKey)}`}
          </span>
        </div>
        <div className="form-field">
          <span>启动 Logo</span>
          <FileDropzone
            label="启动 Logo"
            file={selectedFiles[`${locale}:logo`] ?? null}
            accept="image/png,image/jpeg"
            disabled={uploadProgress !== null && uploadProgress < 100}
            hint="PNG / JPG，选择后自动上传"
            onFileChange={(file) => {
              setSelectedFiles((current) => ({
                ...current,
                [`${locale}:logo`]: file,
              }));
              if (file)
                void upload(file, "launch_logo").catch((error: unknown) =>
                  setFeedback({
                    kind: "error",
                    message:
                      error instanceof Error
                        ? error.message
                        : "品牌资源上传失败",
                  }),
                );
            }}
          />
          <small>
            {uploadProgress !== null && uploadProgress < 100
              ? `正在上传 ${uploadProgress}%`
              : "选择文件后自动上传；当前语言未配置时继承公共资源。"}
          </small>
        </div>
        <div className="form-field">
          <span>启动背景图（可选）</span>
          <FileDropzone
            label="启动背景图"
            file={selectedFiles[`${locale}:background`] ?? null}
            accept="image/png,image/jpeg"
            disabled={uploadProgress !== null && uploadProgress < 100}
            hint="可选，PNG / JPG，选择后自动上传"
            onFileChange={(file) => {
              setSelectedFiles((current) => ({
                ...current,
                [`${locale}:background`]: file,
              }));
              if (file)
                void upload(file, "launch_background").catch((error: unknown) =>
                  setFeedback({
                    kind: "error",
                    message:
                      error instanceof Error
                        ? error.message
                        : "启动背景图上传失败",
                  }),
                );
            }}
          />
          <small>未配置时继承公共背景色；图片仅作为 App 内启动页背景。</small>
        </div>
        <label className="form-field">
          <span>修改原因</span>
          <textarea
            className="input textarea"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="例如：更新夏季活动品牌 Logo"
          />
          <small>至少 3 个字符。</small>
        </label>
      </SidePanel>
    </div>
  );
}
