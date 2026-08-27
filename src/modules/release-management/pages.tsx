import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import * as React from "react";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  CirclePause,
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  QrCode,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  adminApi,
  publicApiUrl,
  uploadArtifactFile,
  type Release,
} from "../../core/api";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FeedbackNotice,
  FileDropzone,
  SelectField,
  SidePanel,
  StatusPill,
} from "../../design-system/components";
import type { AdminPageProps } from "../../plugin-system/types";

function useAdminQuery<T>(key: string[], queryFn: () => Promise<T>) {
  return useQuery({ queryKey: key, queryFn, staleTime: 15_000 });
}

const actionLabels: Record<string, string> = {
  publish: "发布到官网",
  stage: "预发布",
  activate: "恢复发布",
  pause: "暂停",
};

const actionDescriptions: Record<string, string> = {
  publish: "使该版本成为官网当前下载版本，同平台原活跃版本会转为历史版本。",
  pause: "停止官网继续分发该版本；安装包和发布记录保留，之后可以再次发布恢复。",
};
const DEFAULT_RUNTIME_VERSION = "expo:57.0.15";

function formatFileSize(value: number): string {
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function DashboardPage({ onNavigate, tenantId }: AdminPageProps) {
  const query = useAdminQuery(["overview", tenantId], () =>
    adminApi.overview(tenantId),
  );
  if (query.isLoading)
    return (
      <EmptyState
        title="正在加载发布态势"
        detail="正在读取 RN-Server 管理接口"
      />
    );
  if (query.isError)
    return (
      <div className="error-banner">
        无法连接 RN-Server：{query.error.message}
      </div>
    );
  const data = query.data;
  if (!data) return <EmptyState title="没有可用数据" />;
  const activeCount = data.counts.active ?? 0;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Release operations</div>
          <h1>发布总览</h1>
          <p>关注当前线上版本和需要人工处理的发布动作。</p>
        </div>
        <Button onClick={() => onNavigate("releases")}>
          <CloudUpload size={16} />
          管理发布
        </Button>
      </div>
      <div className="metric-grid">
        <Card className="metric">
          <div className="metric-label">线上活跃发布</div>
          <div className="metric-value">{activeCount}</div>
          <div className="metric-caption">Android / iOS / HarmonyOS</div>
        </Card>
        <Card className="metric">
          <div className="metric-label">发布方式</div>
          <div className="metric-value">全量</div>
          <div className="metric-caption">校验通过后由管理员确认发布</div>
        </Card>
        <Card className="metric">
          <div className="metric-label">待处理草稿</div>
          <div className="metric-value">{data.counts.draft ?? 0}</div>
          <div className="metric-caption">需要完成校验后发布</div>
        </Card>
        <Card className="metric">
          <div className="metric-label">可观测性状态</div>
          <div className="metric-value">
            <Activity size={25} color="#f4c86b" />
          </div>
          <div className="metric-caption">生产前接入 telemetry</div>
        </Card>
      </div>
      <div className="section-grid">
        <Card>
          <div className="card-header">
            <h2>当前生产版本</h2>
            <Button variant="ghost" onClick={() => onNavigate("releases")}>
              查看全部 <ArrowUpRight size={15} />
            </Button>
          </div>
          <div className="card-body">
            {(["android", "ios", "harmony"] as const).map((platform) => {
              const release = data.current[platform];
              return (
                <div className="version-row" key={platform}>
                  <div className="platform">
                    <div className="platform-icon">
                      {platform === "android"
                        ? "A"
                        : platform === "ios"
                          ? "i"
                          : "H"}
                    </div>
                    <div>
                      <strong>
                        {platform === "android"
                          ? "Android"
                          : platform === "ios"
                            ? "iOS"
                            : "HarmonyOS"}
                      </strong>
                      {release ? (
                        <div className="version-meta">
                          v{release.version} · build {release.buildNumber} ·{" "}
                          {release.platform}
                        </div>
                      ) : (
                        <div className="version-meta">暂无活跃版本</div>
                      )}
                    </div>
                  </div>
                  {release ? (
                    <div style={{ minWidth: 150 }}>
                      <StatusPill status={release.status} />
                      <div className="progress" style={{ marginTop: 8 }}>
                        <span style={{ width: "100%" }} />
                      </div>
                    </div>
                  ) : (
                    <StatusPill status="draft" />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
        <Card>
          <div className="card-header">
            <h2>发布安全提示</h2>
            <ShieldCheck size={18} color="#74a7ff" />
          </div>
          <div className="card-body">
            <p>
              高风险动作必须填写原因并二次确认，服务端会写入追加式审计日志。
            </p>
            <div style={{ marginTop: 18 }}>
              <StatusPill status="production guard" />
            </div>
            <p style={{ marginTop: 16, fontSize: 12 }}>
              当前管理 API 使用 HttpOnly 服务端会话，发布数据已持久化到 MySQL；
              RBAC 与双人审批暂不进入当前流程。
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}

export function ReleasesPage({ tenantId }: AdminPageProps) {
  const queryClient = useQueryClient();
  const query = useAdminQuery(["releases", tenantId], () =>
    adminApi.releases(tenantId),
  );
  const [showCreate, setShowCreate] = React.useState(false);
  const [publishedRelease, setPublishedRelease] =
    React.useState<Release | null>(null);
  const [shareRelease, setShareRelease] = React.useState<Release | null>(null);
  const [qrDataUrl, setQrDataUrl] = React.useState("");
  const [linkCopied, setLinkCopied] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [platform, setPlatform] = React.useState("android");
  const [version, setVersion] = React.useState("");
  const [buildNumber, setBuildNumber] = React.useState("");
  const [releaseNotes, setReleaseNotes] =
    React.useState("修复已知问题并优化体验");
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [uploadStage, setUploadStage] = React.useState("");
  const [uploadState, setUploadState] = React.useState<
    | "idle"
    | "preparing"
    | "uploading"
    | "uploaded"
    | "saving"
    | "success"
    | "error"
  >("idle");
  const [artifactToken, setArtifactToken] = React.useState("");
  const [uploadError, setUploadError] = React.useState("");
  const uploadAbortRef = React.useRef<AbortController | null>(null);
  const uploadCancelledRef = React.useRef(false);
  const uploadStartRef = React.useRef(false);
  const [pendingAction, setPendingAction] = React.useState<{
    id: string;
    action: string;
  } | null>(null);
  const [actionReason, setActionReason] = React.useState("");
  const [actionReasonError, setActionReasonError] = React.useState("");
  const [actionConfirmOpen, setActionConfirmOpen] = React.useState(false);
  const uploadMutation = useMutation({
    mutationFn: async (input: { file: File }) => {
      const controller = new AbortController();
      uploadAbortRef.current = controller;
      uploadCancelledRef.current = false;
      setUploadState("preparing");
      setUploadError("");
      setUploadStage("正在申请安全上传地址");
      setUploadProgress(0);
      const ticket = await adminApi.createReleaseArtifactUpload(tenantId, {
        fileName: input.file.name,
        contentType:
          input.file.type || "application/vnd.android.package-archive",
        size: input.file.size,
      });
      setArtifactToken(ticket.artifact.token);
      setUploadState("uploading");
      setUploadStage("正在直传对象存储");
      try {
        await uploadArtifactFile(
          ticket.upload,
          input.file,
          setUploadProgress,
          controller.signal,
        );
      } catch (error) {
        await adminApi
          .deleteReleaseArtifact(tenantId, ticket.artifact.token)
          .catch(() => undefined);
        throw error;
      }
      return ticket.artifact;
    },
    onSuccess: () => {
      uploadStartRef.current = false;
      uploadAbortRef.current = null;
      setUploadState("uploaded");
      setUploadStage("文件上传完成，可以保存发布记录");
      setUploadProgress(100);
    },
    onError: (error) => {
      uploadStartRef.current = false;
      uploadAbortRef.current = null;
      if (uploadCancelledRef.current) {
        uploadCancelledRef.current = false;
        return;
      }
      if (artifactToken)
        void adminApi.deleteReleaseArtifact(tenantId, artifactToken);
      setArtifactToken("");
      setUploadState("error");
      setUploadError(error.message);
      setUploadStage("上传未完成");
    },
  });
  const saveReleaseMutation = useMutation({
    mutationFn: async () => {
      if (!artifactToken) throw new Error("请先完成文件上传");
      if (!version.trim() || Number(buildNumber) < 1)
        throw new Error("请填写有效的版本号和构建号");
      if (releaseNotes.trim().length < 3)
        throw new Error("请填写至少 3 个字符的发布说明");
      setUploadState("saving");
      setUploadStage("正在校验安装包并保存发布记录");
      const result = await adminApi.createReleaseFromArtifact(tenantId, {
        artifactToken,
        platform,
        version: version.trim(),
        buildNumber: Number(buildNumber),
        runtimeVersion: DEFAULT_RUNTIME_VERSION,
        releaseNotes: {
          "zh-CN": releaseNotes
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
        },
      });
      return result.release;
    },
    onSuccess: () => {
      setUploadState("success");
      setShowCreate(false);
      setFile(null);
      setArtifactToken("");
      setUploadProgress(0);
      setUploadStage("");
      void queryClient.invalidateQueries({ queryKey: ["releases", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["overview", tenantId] });
    },
    onError: (error) => {
      setUploadState("uploaded");
      setUploadStage("文件已上传，发布记录保存失败，可修改后重试");
      setUploadError(error.message);
    },
  });
  const mutation = useMutation({
    mutationFn: async ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: string;
      reason: string;
    }) => {
      return adminApi.action(tenantId, id, action, reason);
    },
    onSuccess: ({ release }) => {
      setPendingAction(null);
      setActionConfirmOpen(false);
      setActionReason("");
      if (release.status === "active") setPublishedRelease(release);
      void queryClient.invalidateQueries({ queryKey: ["releases", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["overview", tenantId] });
    },
    onError: () => setActionConfirmOpen(false),
  });
  const actionFeedback =
    uploadMutation.isError || saveReleaseMutation.isError
      ? {
          kind: "error" as const,
          message: `操作失败：${uploadError || uploadMutation.error?.message || saveReleaseMutation.error?.message || "请重试"}`,
          dismiss: () => {
            uploadMutation.reset();
            saveReleaseMutation.reset();
            setUploadError("");
          },
        }
      : mutation.isError
        ? {
            kind: "error" as const,
            message: `操作失败：${mutation.error.message}`,
            dismiss: () => mutation.reset(),
          }
        : null;
  const shareUrl = shareRelease
    ? publicApiUrl(`/v1/public/releases/${shareRelease.id}/download`)
    : "";
  React.useEffect(() => {
    if (!shareUrl) {
      setQrDataUrl("");
      setLinkCopied(false);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(shareUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240,
      color: { dark: "#17233f", light: "#ffffff" },
    }).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [shareUrl]);
  const copyShareUrl = () => {
    if (!shareUrl) return;
    void navigator.clipboard?.writeText(shareUrl).then(() => {
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
    });
  };
  const startUpload = (nextFile = file) => {
    if (uploadStartRef.current || uploadMutation.isPending || !nextFile) return;
    uploadStartRef.current = true;
    uploadMutation.mutate({ file: nextFile });
  };
  if (query.isLoading) return <EmptyState title="正在加载发布列表" />;
  if (query.isError)
    return (
      <div className="error-banner">
        无法连接 RN-Server：{query.error.message}
      </div>
    );
  const releases = query.data?.items ?? [];
  const runAction = (id: string, action: string) => {
    setPendingAction({ id, action });
    setActionReason("");
    setActionReasonError("");
  };
  const requestActionConfirmation = () => {
    if (!pendingAction) return;
    const reason = actionReason.trim();
    if (reason.length < 3) {
      setActionReasonError("请填写至少 3 个字符的操作原因。");
      return;
    }
    setActionReasonError("");
    setActionConfirmOpen(true);
  };
  const confirmAction = () => {
    if (!pendingAction) return;
    const reason = actionReason.trim();
    if (reason.length < 3) return;
    mutation.mutate({ ...pendingAction, reason });
  };
  const cancelUpload = () => {
    uploadCancelledRef.current = true;
    uploadStartRef.current = false;
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    uploadMutation.reset();
    setUploadState("idle");
    setUploadStage("");
    setUploadProgress(0);
    if (artifactToken)
      void adminApi.deleteReleaseArtifact(tenantId, artifactToken);
    setArtifactToken("");
  };
  const retryUpload = () => {
    if (artifactToken)
      void adminApi.deleteReleaseArtifact(tenantId, artifactToken);
    uploadMutation.reset();
    setUploadState("idle");
    setUploadError("");
    setArtifactToken("");
    window.setTimeout(() => startUpload(), 0);
  };
  return (
    <>
      <FeedbackNotice
        kind={actionFeedback?.kind ?? "success"}
        message={actionFeedback?.message ?? ""}
        placement="viewport"
        onDismiss={actionFeedback?.dismiss}
      />
      <div className="page-heading">
        <div>
          <div className="eyebrow">Release management</div>
          <h1>发布管理</h1>
          <p>上传 APK，服务端自动校验后发布到官网，生成可分享的安装链接。</p>
        </div>
        <Button
          onClick={() => {
            setPublishedRelease(null);
            setShowCreate(true);
          }}
        >
          <CloudUpload size={16} />
          上传 APK
        </Button>
      </div>
      {publishedRelease && (
        <Card className="publish-success-card">
          <div className="publish-success-icon">
            <CheckCircle2 size={22} />
          </div>
          <div className="publish-success-content">
            <strong>v{publishedRelease.version} 已发布到官网</strong>
            <span>
              build {publishedRelease.buildNumber} · Android Direct ·
              可直接下载安装
            </span>
            <div className="publish-link-row">
              <a
                href={publicApiUrl(
                  `/v1/public/releases/${publishedRelease.id}/download`,
                )}
                target="_blank"
                rel="noreferrer"
              >
                {publicApiUrl(
                  `/v1/public/releases/${publishedRelease.id}/download`,
                )}
              </a>
              <Button
                variant="ghost"
                aria-label="复制安装链接"
                onClick={() =>
                  void navigator.clipboard?.writeText(
                    publicApiUrl(
                      `/v1/public/releases/${publishedRelease.id}/download`,
                    ),
                  )
                }
              >
                <Copy size={14} />
                复制
              </Button>
              <a
                className="icon-link"
                href={publicApiUrl(
                  `/v1/public/releases/${publishedRelease.id}/download`,
                )}
                target="_blank"
                rel="noreferrer"
                aria-label="打开安装链接"
              >
                <ExternalLink size={15} />
              </a>
            </div>
          </div>
        </Card>
      )}
      {shareRelease && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShareRelease(null);
          }}
        >
          <section
            className="share-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-dialog-title"
          >
            <div className="share-dialog-header">
              <div>
                <div className="eyebrow">Share release</div>
                <h2 id="share-dialog-title">扫码安装</h2>
                <p>使用手机扫码后，将直接下载该版本 APK。</p>
              </div>
              <button
                className="dialog-close-button"
                type="button"
                aria-label="关闭二维码"
                onClick={() => setShareRelease(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="share-dialog-content">
              <div className="qr-frame">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`${shareRelease.version} build ${shareRelease.buildNumber} 安装二维码`}
                  />
                ) : (
                  <span className="qr-loading">正在生成二维码…</span>
                )}
              </div>
              <div className="share-dialog-details">
                <strong>
                  v{shareRelease.version} · build {shareRelease.buildNumber}
                </strong>
                <span className="muted">
                  {shareRelease.fileName ?? "APK 安装包"}
                </span>
                <label className="form-field">
                  <span>安装地址</span>
                  <input className="input" value={shareUrl} readOnly />
                </label>
                <div className="toolbar share-dialog-actions">
                  <Button variant="ghost" onClick={copyShareUrl}>
                    <Copy size={14} />
                    {linkCopied ? "已复制" : "复制链接"}
                  </Button>
                  <a className="button button-primary" href={shareUrl}>
                    <Download size={14} />
                    直接下载
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
      <SidePanel
        open={showCreate}
        title="上传安装包"
        description="选择文件后立即上传；保存发布记录时校验包身份，正式发布仍从列表操作。"
        onClose={() => {
          if (!uploadMutation.isPending && !saveReleaseMutation.isPending) {
            cancelUpload();
            setShowCreate(false);
          }
        }}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={
                uploadMutation.isPending || saveReleaseMutation.isPending
              }
              onClick={() => {
                cancelUpload();
                setShowCreate(false);
              }}
            >
              取消
            </Button>
            <Button
              disabled={
                uploadMutation.isPending ||
                saveReleaseMutation.isPending ||
                uploadState !== "uploaded" ||
                !version.trim() ||
                Number(buildNumber) < 1 ||
                releaseNotes.trim().length < 3
              }
              onClick={() => saveReleaseMutation.mutate()}
            >
              <CloudUpload size={16} />
              保存发布记录
            </Button>
          </>
        }
      >
        <div className="release-upload-grid">
          <div className="form-grid form-grid-3">
            <SelectField
              label="平台"
              value={platform}
              disabled={saveReleaseMutation.isPending}
              onChange={(event) => setPlatform(event.target.value)}
            >
              <option value="android">Android</option>
              <option value="ios">iOS</option>
              <option value="harmony">HarmonyOS</option>
            </SelectField>
            <label className="form-field">
              <span>版本号</span>
              <input
                className="input"
                placeholder="1.2.0"
                value={version}
                disabled={saveReleaseMutation.isPending}
                onChange={(event) => setVersion(event.target.value)}
              />
            </label>
            <label className="form-field">
              <span>构建号</span>
              <input
                className="input"
                type="number"
                min={1}
                placeholder="120"
                value={buildNumber}
                disabled={saveReleaseMutation.isPending}
                onChange={(event) => setBuildNumber(event.target.value)}
              />
            </label>
          </div>
          <div className="form-field">
            <span>{platform === "android" ? "APK 安装包" : "安装包"}</span>
            <FileDropzone
              label={platform === "android" ? "APK 安装包" : "安装包"}
              file={file}
              accept={
                platform === "android"
                  ? ".apk,application/vnd.android.package-archive"
                  : undefined
              }
              disabled={uploadState !== "idle" || saveReleaseMutation.isPending}
              hint={
                platform === "android"
                  ? "支持 APK，服务端会校验版本号、构建号与签名"
                  : "服务端会校验文件大小、哈希与版本身份"
              }
              onFileChange={(nextFile) => {
                uploadAbortRef.current?.abort();
                if (artifactToken)
                  void adminApi.deleteReleaseArtifact(tenantId, artifactToken);
                uploadMutation.reset();
                setUploadError("");
                setArtifactToken("");
                setUploadProgress(0);
                setUploadStage("");
                setUploadState("idle");
                setFile(nextFile);
                if (nextFile) startUpload(nextFile);
              }}
            />
          </div>
          <label className="form-field release-notes-field">
            <span>发布说明</span>
            <textarea
              className="input textarea"
              placeholder="例如：修复行情刷新问题，优化钱包连接体验"
              value={releaseNotes}
              disabled={saveReleaseMutation.isPending}
              onChange={(event) => setReleaseNotes(event.target.value)}
            />
          </label>
          <div className="release-upload-actions">
            <span className="muted">
              {!file
                ? "选择文件后立即开始上传，期间可继续填写版本信息"
                : uploadState === "uploaded"
                  ? "安装包已上传，可从底部按钮保存发布记录"
                  : "文件选择后会自动开始上传"}
            </span>
            {(uploadState === "preparing" || uploadState === "uploading") && (
              <Button variant="ghost" onClick={cancelUpload}>
                取消上传
              </Button>
            )}
            {uploadState === "error" && (
              <Button variant="ghost" onClick={retryUpload}>
                重新上传
              </Button>
            )}
          </div>
          {file && uploadState !== "idle" && (
            <div className="upload-progress-panel">
              <div>
                <span>
                  {uploadStage || "等待上传"}
                  {uploadError && (
                    <small className="field-error"> · {uploadError}</small>
                  )}
                </span>
                <strong>{uploadProgress}%</strong>
              </div>
              <div className="progress">
                <span style={{ width: `${uploadProgress}%` }} />
              </div>
              <small className="muted">
                {uploadState === "uploaded"
                  ? "文件已上传，保存发布记录时服务端会校验包身份并写入列表。"
                  : uploadState === "error"
                    ? "文件仍保留在当前表单中，可直接重新上传。"
                    : `${file.name} · ${formatFileSize((file.size * uploadProgress) / 100)} / ${formatFileSize(file.size)}`}
              </small>
            </div>
          )}
        </div>
      </SidePanel>
      <SidePanel
        open={pendingAction !== null}
        title={
          pendingAction
            ? (actionLabels[pendingAction.action] ?? pendingAction.action)
            : "操作"
        }
        description={
          pendingAction ? actionDescriptions[pendingAction.action] : undefined
        }
        onClose={() => {
          setPendingAction(null);
          setActionConfirmOpen(false);
          setActionReason("");
          setActionReasonError("");
        }}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingAction(null)}>
              取消
            </Button>
            <Button
              variant={pendingAction?.action === "pause" ? "danger" : "primary"}
              disabled={actionReason.trim().length < 3 || mutation.isPending}
              onClick={requestActionConfirmation}
            >
              继续确认
            </Button>
          </>
        }
      >
        <div className="side-panel-form">
          <textarea
            className="input textarea"
            aria-label="操作原因"
            aria-invalid={Boolean(actionReasonError)}
            aria-describedby={
              actionReasonError ? "release-action-reason-error" : undefined
            }
            placeholder="至少 3 个字符，例如：已完成测试环境安装验证"
            value={actionReason}
            onChange={(event) => {
              setActionReason(event.target.value);
              if (actionReasonError) setActionReasonError("");
            }}
          />
          {actionReasonError && (
            <small className="field-error" id="release-action-reason-error">
              {actionReasonError}
            </small>
          )}
          <span className="muted">原因会与操作者、请求 ID 一起记录。</span>
        </div>
      </SidePanel>
      <ConfirmDialog
        open={actionConfirmOpen && pendingAction !== null}
        title={`确认${pendingAction ? (actionLabels[pendingAction.action] ?? pendingAction.action) : "操作"}？`}
        description={
          pendingAction
            ? actionDescriptions[pendingAction.action]
            : "操作原因将写入追加式审计日志。"
        }
        confirmLabel={
          pendingAction
            ? `确认${actionLabels[pendingAction.action] ?? pendingAction.action}`
            : "确认操作"
        }
        tone={pendingAction?.action === "pause" ? "danger" : "default"}
        loading={mutation.isPending}
        onCancel={() => setActionConfirmOpen(false)}
        onConfirm={confirmAction}
      >
        <div className="dialog-detail-list">
          <span>操作原因：{actionReason.trim() || "未填写"}</span>
          <span>该动作由服务端状态机最终校验</span>
        </div>
      </ConfirmDialog>
      <Card className="table-wrap">
        <div className="card-header">
          <div>
            <h2>发布记录</h2>
            <p style={{ fontSize: 12, marginTop: 4 }}>
              查看官网当前版本与历史发布结果
            </p>
            <p className="release-action-help">
              暂停会停止该版本继续分发，安装包和记录仍保留，之后可以再次发布恢复。
            </p>
          </div>
          <div className="toolbar">
            <SelectField aria-label="平台">
              <option>全部平台</option>
            </SelectField>
            <SelectField aria-label="状态">
              <option>全部状态</option>
            </SelectField>
          </div>
        </div>
        {releases.length === 0 ? (
          <EmptyState title="还没有发布" />
        ) : (
          <table>
            <thead>
              <tr>
                <th>版本</th>
                <th>平台 / 渠道</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>安装链接</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {releases.map((release) => (
                <tr key={release.id}>
                  <td>
                    <strong>v{release.version}</strong>
                    <div className="muted mono">
                      build {release.buildNumber}
                    </div>
                  </td>
                  <td>
                    {release.platform}
                    <div className="muted">{release.platform}</div>
                  </td>
                  <td>
                    <StatusPill status={release.status} />
                  </td>
                  <td className="muted">
                    {new Date(release.updatedAt).toLocaleString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>
                    {release.status === "active" ? (
                      <div className="toolbar">
                        <Button
                          variant="ghost"
                          title="打开二维码和安装链接"
                          onClick={() => setShareRelease(release)}
                        >
                          <QrCode size={14} />
                          二维码
                        </Button>
                        <a
                          className="icon-link"
                          href={publicApiUrl(
                            `/v1/public/releases/${release.id}/download`,
                          )}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="打开安装链接"
                          title="打开安装链接"
                        >
                          <ExternalLink size={15} />
                        </a>
                      </div>
                    ) : (
                      <span className="muted">发布后生成</span>
                    )}
                  </td>
                  <td>
                    <div className="toolbar">
                      {release.status === "uploaded" && (
                        <span className="muted">需重新上传真实 APK</span>
                      )}
                      {release.status === "verified" && (
                        <Button
                          onClick={() => runAction(release.id, "publish")}
                        >
                          <ShieldCheck size={14} />
                          发布到官网
                        </Button>
                      )}
                      {release.status === "staged" && (
                        <Button
                          onClick={() => runAction(release.id, "activate")}
                        >
                          <ArrowUpRight size={14} />
                          完成发布
                        </Button>
                      )}
                      {release.status === "active" && (
                        <>
                          <Button
                            variant="ghost"
                            title="停止官网继续分发，可再次发布恢复"
                            onClick={() => runAction(release.id, "pause")}
                          >
                            <CirclePause size={14} />
                            暂停
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
