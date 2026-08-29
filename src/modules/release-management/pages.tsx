import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import * as React from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  CirclePause,
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  Pause,
  Play,
  QrCode,
  RotateCcw,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import {
  adminApi,
  publicApiUrl,
  uploadArtifactFile,
  uploadUploadSessionPart,
  type UploadSession,
  type UploadSessionPart,
  type OtaReleaseDetail,
  type OtaRelease,
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
function formatFileSize(value: number): string {
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

type ReleaseManagementTab = "full" | "ota";
type ReleaseManagementPageProps = AdminPageProps & {
  onOpenOta?: (
    baseReleaseId: string,
    platform: "android" | "ios",
    create: boolean,
  ) => void;
};

function releaseTabFromLocation(): ReleaseManagementTab {
  return new URLSearchParams(window.location.search).get("tab") === "ota"
    ? "ota"
    : "full";
}

function releaseQueryParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

export function ReleaseManagementPage(props: AdminPageProps) {
  const [tab, setTab] = React.useState<ReleaseManagementTab>(
    releaseTabFromLocation,
  );

  React.useEffect(() => {
    const syncFromBrowser = () => {
      const nextTab = releaseTabFromLocation();
      const expected = `/releases?tab=${nextTab}`;
      if (`${window.location.pathname}${window.location.search}` !== expected) {
        window.history.replaceState(null, "", `/releases?tab=${nextTab}`);
      }
      setTab(nextTab);
    };
    syncFromBrowser();
    window.addEventListener("popstate", syncFromBrowser);
    return () => window.removeEventListener("popstate", syncFromBrowser);
  }, []);

  const selectTab = (
    nextTab: ReleaseManagementTab,
    params: Record<string, string> = {},
  ) => {
    const search = new URLSearchParams({ tab: nextTab, ...params });
    window.history.pushState(null, "", `/releases?${search.toString()}`);
    setTab(nextTab);
  };

  const openOta = (
    baseReleaseId: string,
    platform: "android" | "ios",
    create: boolean,
  ) => {
    selectTab("ota", {
      baseReleaseId,
      platform,
      ...(create ? { action: "create" } : {}),
    });
  };

  return (
    <>
      <div
        className="release-management-tabs"
        role="tablist"
        aria-label="发布类型"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "full"}
          className={tab === "full" ? "is-active" : ""}
          onClick={() => selectTab("full")}
        >
          全量版本
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "ota"}
          className={tab === "ota" ? "is-active" : ""}
          onClick={() => selectTab("ota")}
        >
          OTA 热更新
        </button>
      </div>
      {tab === "ota" ? (
        <OtaPage {...props} />
      ) : (
        <ReleasesPage {...props} onOpenOta={openOta} />
      )}
    </>
  );
}

function shortRuntimeVersion(value: string): string {
  if (!value) return "不支持 OTA";
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

function RuntimeVersionValue({ value }: { value: string }) {
  return (
    <span
      className={`runtime-version-value${value ? "" : " is-missing"}`}
      data-full={value || "未检测到 Runtime Version"}
      title={value || "该安装包未包含 Expo Fingerprint，不能作为 OTA 基线"}
    >
      {shortRuntimeVersion(value)}
    </span>
  );
}

export function DashboardPage({ onNavigate, tenantId }: AdminPageProps) {
  const query = useAdminQuery(["overview", tenantId], () =>
    adminApi.overview(tenantId),
  );
  const installations = useAdminQuery(["installation-overview", tenantId], () =>
    adminApi.installationOverview(tenantId),
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
          <div className="metric-label">安装实例</div>
          <div className="metric-value">{installations.data?.total ?? "-"}</div>
          <div className="metric-caption">当前租户已上报的安装实例</div>
        </Card>
        <Card className="metric">
          <div className="metric-label">待处理草稿</div>
          <div className="metric-value">{data.counts.draft ?? 0}</div>
          <div className="metric-caption">需要完成校验后发布</div>
        </Card>
        <Card className="metric">
          <div className="metric-label">7 日活跃</div>
          <div className="metric-value">
            {installations.data?.active.sevenDays ?? "-"}
          </div>
          <div className="metric-caption">最近七天有心跳的安装实例</div>
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

export function ReleasesPage({
  tenantId,
  onOpenOta,
}: ReleaseManagementPageProps) {
  const queryClient = useQueryClient();
  const query = useAdminQuery(["releases", tenantId], () =>
    adminApi.releases(tenantId),
  );
  const localizationQuery = useAdminQuery(["localization", tenantId], () =>
    adminApi.localization(),
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
  const [releaseNotes, setReleaseNotes] = React.useState<
    Record<string, string>
  >({
    "zh-CN": "修复已知问题并优化体验",
  });
  const [activeReleaseNoteLanguage, setActiveReleaseNoteLanguage] =
    React.useState("zh-CN");
  const releaseNoteLanguageInitialized = React.useRef(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [uploadedBytes, setUploadedBytes] = React.useState(0);
  const [uploadSpeed, setUploadSpeed] = React.useState(0);
  const [uploadStage, setUploadStage] = React.useState("");
  const [uploadState, setUploadState] = React.useState<
    | "idle"
    | "preparing"
    | "uploading"
    | "paused"
    | "uploaded"
    | "saving"
    | "success"
    | "error"
  >("idle");
  const [artifactToken, setArtifactToken] = React.useState("");
  const [uploadError, setUploadError] = React.useState("");
  const uploadAbortRef = React.useRef<AbortController | null>(null);
  const uploadSessionRef = React.useRef<UploadSession | null>(null);
  const uploadedPartsRef = React.useRef(new Map<number, UploadSessionPart>());
  const partProgressRef = React.useRef(new Map<number, number>());
  const uploadStartedAtRef = React.useRef(0);
  const uploadPausedRef = React.useRef(false);
  const uploadCancelledRef = React.useRef(false);
  const uploadStartRef = React.useRef(false);
  const [pendingAction, setPendingAction] = React.useState<{
    id: string;
    action: string;
  } | null>(null);
  const [actionReason, setActionReason] = React.useState("");
  const [actionReasonError, setActionReasonError] = React.useState("");
  const [actionConfirmOpen, setActionConfirmOpen] = React.useState(false);
  const releaseNoteLanguages = React.useMemo(
    () =>
      Object.entries(localizationQuery.data?.settings.languages ?? {})
        .filter(([, language]) => language.enabled)
        .sort(([, left], [, right]) => left.sort - right.sort),
    [localizationQuery.data?.settings.languages],
  );
  const requiredReleaseNoteLanguage =
    releaseNoteLanguages.find(
      ([code]) => code === localizationQuery.data?.settings.fallbackLanguage,
    )?.[0] ??
    releaseNoteLanguages[0]?.[0] ??
    "";
  const releaseNotesValid =
    requiredReleaseNoteLanguage !== "" &&
    (releaseNotes[requiredReleaseNoteLanguage] ?? "").trim().length >= 3;
  const normalizedReleaseNotes = Object.fromEntries(
    releaseNoteLanguages
      .map(([language]) => [
        language,
        (releaseNotes[language] ?? "")
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
      ])
      .filter(([, value]) => value.length > 0),
  );
  React.useEffect(() => {
    if (releaseNoteLanguages.length === 0) return;
    if (!releaseNoteLanguageInitialized.current) {
      releaseNoteLanguageInitialized.current = true;
      setActiveReleaseNoteLanguage(requiredReleaseNoteLanguage);
    }
    if (
      !releaseNoteLanguages.some(([code]) => code === activeReleaseNoteLanguage)
    ) {
      setActiveReleaseNoteLanguage(releaseNoteLanguages[0]![0]);
    }
    setReleaseNotes((current) => {
      const next = { ...current };
      let changed = false;
      for (const [code] of releaseNoteLanguages) {
        if (!(code in next)) {
          next[code] = "";
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [
    activeReleaseNoteLanguage,
    releaseNoteLanguages,
    requiredReleaseNoteLanguage,
  ]);
  const uploadFingerprint = (input: File) =>
    `${input.name}:${input.size}:${input.lastModified}`;
  const uploadStorageKey = (input: File) =>
    `rn-admin:apk-upload:${tenantId}:${uploadFingerprint(input)}`;
  const uploadMutation = useMutation({
    mutationFn: async (input: { file: File }) => {
      const controller = new AbortController();
      uploadAbortRef.current = controller;
      uploadCancelledRef.current = false;
      uploadPausedRef.current = false;
      setUploadState("preparing");
      setUploadError("");
      setUploadStage("正在准备分片上传");
      setUploadProgress(0);
      setUploadedBytes(0);
      setUploadSpeed(0);
      uploadStartedAtRef.current = Date.now();
      const cachedRaw = window.localStorage.getItem(
        uploadStorageKey(input.file),
      );
      let cached: { id: string; token?: string } | null = null;
      try {
        cached = cachedRaw ? JSON.parse(cachedRaw) : null;
      } catch {
        cached = cachedRaw ? { id: cachedRaw } : null;
      }
      let session: UploadSession;
      if (cached?.id) {
        try {
          const current = await adminApi.getUploadSession(
            tenantId,
            cached.id,
            cached.token,
          );
          if (
            current.session.status === "active" &&
            current.session.fileName === input.file.name &&
            current.session.size === input.file.size
          )
            session = current.session;
          else throw new Error("上传会话已失效");
        } catch {
          window.localStorage.removeItem(uploadStorageKey(input.file));
          session = (
            await adminApi.createUploadSession(tenantId, {
              uploadType: "apk",
              fileName: input.file.name,
              contentType:
                input.file.type || "application/vnd.android.package-archive",
              size: input.file.size,
              partSize: 16 * 1024 * 1024,
            })
          ).session;
        }
      } else {
        session = (
          await adminApi.createUploadSession(tenantId, {
            uploadType: "apk",
            fileName: input.file.name,
            contentType:
              input.file.type || "application/vnd.android.package-archive",
            size: input.file.size,
            partSize: 16 * 1024 * 1024,
          })
        ).session;
      }
      if (controller.signal.aborted || uploadCancelledRef.current) {
        if (uploadCancelledRef.current && session!) {
          void adminApi
            .deleteUploadSession(tenantId, session.id, session.token)
            .catch(() => undefined);
        }
        throw new Error("上传已取消");
      }
      uploadSessionRef.current = session;
      window.localStorage.setItem(
        uploadStorageKey(input.file),
        JSON.stringify({ id: session.id, token: session.token }),
      );
      uploadedPartsRef.current = new Map(
        session.uploadedParts.map((part) => [part.partNumber, part]),
      );
      partProgressRef.current = new Map();
      const totalParts = session.totalParts;
      const pendingParts = Array.from(
        { length: totalParts },
        (_, index) => index + 1,
      ).filter((partNumber) => !uploadedPartsRef.current.has(partNumber));
      setUploadState("uploading");
      setUploadStage(
        `正在上传分片（${totalParts - pendingParts.length}/${totalParts}）`,
      );
      const updateProgress = () => {
        let uploaded = 0;
        for (const part of uploadedPartsRef.current.values())
          uploaded +=
            part.size ??
            Math.min(
              session.partSize,
              input.file.size - (part.partNumber - 1) * session.partSize,
            );
        for (const value of partProgressRef.current.values()) uploaded += value;
        setUploadedBytes(uploaded);
        const elapsedSeconds = Math.max(
          (Date.now() - uploadStartedAtRef.current) / 1000,
          0.25,
        );
        setUploadSpeed(uploaded / elapsedSeconds);
        setUploadProgress(
          Math.min(99, Math.round((uploaded / input.file.size) * 100)),
        );
        setUploadStage(
          `正在上传分片（${uploadedPartsRef.current.size}/${totalParts}）`,
        );
      };
      updateProgress();
      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < pendingParts.length) {
          const partNumber = pendingParts[nextIndex++];
          const start = (partNumber - 1) * session.partSize;
          const end = Math.min(start + session.partSize, input.file.size);
          let lastError: unknown;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              const part = await uploadUploadSessionPart(
                session,
                partNumber,
                input.file.slice(start, end),
                (loaded) => {
                  partProgressRef.current.set(partNumber, loaded);
                  updateProgress();
                },
                controller.signal,
              );
              uploadedPartsRef.current.set(partNumber, {
                ...part,
                size: end - start,
              });
              partProgressRef.current.delete(partNumber);
              updateProgress();
              lastError = undefined;
              break;
            } catch (error) {
              lastError = error;
              if (controller.signal.aborted) throw error;
              await new Promise((resolve) =>
                window.setTimeout(resolve, 300 * (attempt + 1)),
              );
            }
          }
          if (lastError) throw lastError;
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(3, pendingParts.length || 1) }, worker),
      );
      if (controller.signal.aborted || uploadCancelledRef.current) {
        throw new Error("上传已取消");
      }
      if (uploadPausedRef.current) throw new Error("上传已暂停");
      setUploadState("preparing");
      setUploadStage("正在合并分片并校验文件");
      const complete = await adminApi.completeUploadSession(
        tenantId,
        session.id,
        Array.from(uploadedPartsRef.current.values()).sort(
          (a, b) => a.partNumber - b.partNumber,
        ),
        session.token,
      );
      setArtifactToken(complete.artifact.token);
      window.localStorage.removeItem(uploadStorageKey(input.file));
      return complete.artifact;
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
      if (uploadPausedRef.current) {
        setUploadState("paused");
        setUploadStage("上传已暂停，可继续上传");
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
      if (!releaseNotesValid)
        throw new Error(`请填写 ${requiredReleaseNoteLanguage} 发布说明`);
      setUploadState("saving");
      setUploadStage("正在校验安装包并保存发布记录");
      const result = await adminApi.createReleaseFromArtifact(tenantId, {
        artifactToken,
        platform,
        version: version.trim(),
        buildNumber: Number(buildNumber),
        releaseNotes: normalizedReleaseNotes,
      });
      return result.release;
    },
    onSuccess: () => {
      setUploadState("success");
      setShowCreate(false);
      setFile(null);
      setArtifactToken("");
      uploadSessionRef.current = null;
      uploadedPartsRef.current.clear();
      partProgressRef.current.clear();
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
    (uploadMutation.isError && uploadState !== "paused") ||
    saveReleaseMutation.isError
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
  const releases = [...(query.data?.items ?? [])].sort(
    (left, right) =>
      right.buildNumber - left.buildNumber ||
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
      right.id.localeCompare(left.id),
  );
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
    uploadPausedRef.current = false;
    uploadStartRef.current = false;
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    uploadMutation.reset();
    if (file) window.localStorage.removeItem(uploadStorageKey(file));
    if (uploadSessionRef.current)
      void adminApi
        .deleteUploadSession(
          tenantId,
          uploadSessionRef.current.id,
          uploadSessionRef.current.token,
        )
        .catch(() => undefined);
    uploadSessionRef.current = null;
    uploadedPartsRef.current.clear();
    partProgressRef.current.clear();
    setUploadState("idle");
    setUploadStage("");
    setUploadProgress(0);
    setUploadedBytes(0);
    setUploadSpeed(0);
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
    uploadPausedRef.current = false;
    window.setTimeout(() => startUpload(), 0);
  };
  const pauseUpload = () => {
    if (uploadState !== "uploading") return;
    uploadPausedRef.current = true;
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
  };
  const resumeUpload = () => {
    if (!file || uploadState !== "paused") return;
    uploadPausedRef.current = false;
    uploadStartRef.current = true;
    uploadMutation.mutate({ file });
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
          <p>上传 APK，填写多语言发布说明，校验通过后从列表发布到官网。</p>
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
                !localizationQuery.isSuccess ||
                !version.trim() ||
                Number(buildNumber) < 1 ||
                !releaseNotesValid
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
                if (uploadSessionRef.current) {
                  void adminApi
                    .deleteUploadSession(
                      tenantId,
                      uploadSessionRef.current.id,
                      uploadSessionRef.current.token,
                    )
                    .catch(() => undefined);
                  uploadSessionRef.current = null;
                }
                if (artifactToken)
                  void adminApi.deleteReleaseArtifact(tenantId, artifactToken);
                uploadMutation.reset();
                setUploadError("");
                setArtifactToken("");
                setUploadProgress(0);
                setUploadedBytes(0);
                setUploadSpeed(0);
                setUploadStage("");
                setUploadState("idle");
                setFile(nextFile);
                if (nextFile) startUpload(nextFile);
              }}
            />
          </div>
          <label className="form-field release-notes-field">
            <span>发布说明（多语言）</span>
            {localizationQuery.isLoading ? (
              <div className="prerequisite-panel">
                正在读取当前租户语言配置…
              </div>
            ) : localizationQuery.isError ? (
              <div className="error-banner">
                无法读取语言配置，请刷新后重试：
                {localizationQuery.error.message}
              </div>
            ) : (
              <>
                <div
                  className="release-note-language-tabs"
                  role="tablist"
                  aria-label="发布说明语言"
                >
                  {releaseNoteLanguages.map(([code, language]) => (
                    <button
                      key={code}
                      className={`release-note-language-tab${activeReleaseNoteLanguage === code ? " is-active" : ""}`}
                      type="button"
                      role="tab"
                      aria-selected={activeReleaseNoteLanguage === code}
                      onClick={() => setActiveReleaseNoteLanguage(code)}
                    >
                      {language.nativeName || language.label || code}
                      {code === requiredReleaseNoteLanguage ? "（默认）" : ""}
                      {releaseNotes[code]?.trim() ? (
                        <span aria-label="已填写">●</span>
                      ) : null}
                    </button>
                  ))}
                </div>
                <textarea
                  className="input textarea"
                  placeholder="例如：修复行情刷新问题，优化钱包连接体验"
                  value={releaseNotes[activeReleaseNoteLanguage] ?? ""}
                  disabled={saveReleaseMutation.isPending}
                  onChange={(event) =>
                    setReleaseNotes((current) => ({
                      ...current,
                      [activeReleaseNoteLanguage]: event.target.value,
                    }))
                  }
                  aria-label={`${activeReleaseNoteLanguage} 发布说明`}
                />
                <small>
                  支持语言来自多语言管理；默认语言必须填写，其他语言可选。
                </small>
              </>
            )}
          </label>
          {file && uploadState !== "idle" && (
            <div className="upload-progress-panel">
              <div>
                <span className="upload-progress-label">
                  <span>
                    {uploadStage || "等待上传"}
                    {uploadError && (
                      <small className="field-error"> · {uploadError}</small>
                    )}
                  </span>
                  <span className="upload-progress-actions">
                    {uploadState === "uploading" && (
                      <>
                        <button
                          className="upload-icon-action"
                          type="button"
                          title="暂停上传"
                          aria-label="暂停上传"
                          onClick={pauseUpload}
                        >
                          <Pause size={15} aria-hidden="true" />
                        </button>
                        <button
                          className="upload-icon-action is-danger"
                          type="button"
                          title="取消上传"
                          aria-label="取消上传"
                          onClick={cancelUpload}
                        >
                          <XCircle size={16} aria-hidden="true" />
                        </button>
                      </>
                    )}
                    {uploadState === "paused" && (
                      <>
                        <button
                          className="upload-icon-action is-primary"
                          type="button"
                          title="继续上传"
                          aria-label="继续上传"
                          onClick={resumeUpload}
                        >
                          <Play size={15} aria-hidden="true" />
                        </button>
                        <button
                          className="upload-icon-action is-danger"
                          type="button"
                          title="取消上传"
                          aria-label="取消上传"
                          onClick={cancelUpload}
                        >
                          <XCircle size={16} aria-hidden="true" />
                        </button>
                      </>
                    )}
                    {uploadState === "error" && (
                      <button
                        className="upload-icon-action is-primary"
                        type="button"
                        title="重试上传"
                        aria-label="重试上传"
                        onClick={retryUpload}
                      >
                        <RotateCcw size={15} aria-hidden="true" />
                      </button>
                    )}
                  </span>
                  <strong>{uploadProgress}%</strong>
                </span>
              </div>
              <div
                className="progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={uploadProgress}
                aria-label="APK 上传进度"
              >
                <span style={{ width: `${uploadProgress}%` }} />
              </div>
              <small className="muted">
                {uploadState === "uploaded"
                  ? "文件已上传，保存发布记录时服务端会校验包身份并写入列表。"
                  : uploadState === "error"
                    ? "文件仍保留在当前表单中，可直接重新上传。"
                    : `${file.name} · ${formatFileSize(uploadedBytes)} / ${formatFileSize(file.size)}${uploadSpeed > 0 ? ` · ${formatFileSize(uploadSpeed)}/s` : ""}`}
              </small>
              {(uploadState === "uploading" || uploadState === "paused") && (
                <small className="muted upload-resume-hint">
                  16 MB 分片 · 最多 3 路并发 · 刷新后重新选择同一文件即可继续
                </small>
              )}
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
                <th>序号</th>
                <th>版本</th>
                <th>平台 / 渠道</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>安装链接</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {releases.map((release, index) => (
                <tr key={release.id}>
                  <td className="release-index muted mono">{index + 1}</td>
                  <td>
                    <strong>v{release.version}</strong>
                    <div className="muted mono">
                      build {release.buildNumber}
                    </div>
                    <div className="muted runtime-version-line">
                      Runtime{" "}
                      <RuntimeVersionValue value={release.runtimeVersion} />
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
                      {onOpenOta &&
                        release.platform !== "harmony" &&
                        (release.status === "verified" ||
                          release.status === "active") && (
                          <Button
                            variant="ghost"
                            onClick={() =>
                              onOpenOta(
                                release.id,
                                release.platform === "ios" ? "ios" : "android",
                                true,
                              )
                            }
                          >
                            <CloudUpload size={14} />
                            发布 OTA
                          </Button>
                        )}
                      {onOpenOta && release.platform !== "harmony" && (
                        <Button
                          variant="ghost"
                          onClick={() =>
                            onOpenOta(
                              release.id,
                              release.platform === "ios" ? "ios" : "android",
                              false,
                            )
                          }
                        >
                          <ArrowUpRight size={14} />
                          查看 OTA
                        </Button>
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

type OtaUploadState =
  "idle" | "preparing" | "uploading" | "uploaded" | "saving" | "error";

const otaIdentityFields: Array<{
  key: keyof NonNullable<OtaReleaseDetail["identity"]>;
  label: string;
  source: string;
}> = [
  { key: "apiBaseUrl", label: "apiBaseUrl", source: "当前租户请求域名" },
  {
    key: "distributionChannel",
    label: "distributionChannel",
    source: "基线 APK / 构建渠道",
  },
  { key: "otaChannel", label: "otaChannel", source: "OTA 发布 Channel" },
  {
    key: "applicationId",
    label: "applicationId",
    source: "基线 APK 应用身份",
  },
  { key: "appVersion", label: "appVersion", source: "基线 APK version" },
  {
    key: "buildNumber",
    label: "buildNumber",
    source: "基线 APK build_number",
  },
  {
    key: "runtimeVersion",
    label: "runtimeVersion",
    source: "基线 APK runtime_version",
  },
  {
    key: "expoClientVersion",
    label: "expoClient.version",
    source: "基线 APK version",
  },
  {
    key: "expoClientAndroidVersionCode",
    label: "expoClient.android.versionCode",
    source: "基线 APK build_number",
  },
];

function OtaReleaseDetailPanel({ detail }: { detail: OtaReleaseDetail }) {
  const identity = detail.identity ?? {};
  return (
    <div className="ota-detail-panel">
      <section className="ota-detail-section">
        <div className="ota-detail-section-heading">
          <div>
            <h3>发布身份</h3>
            <p>最终值来自服务端保存后的不可变 Manifest。</p>
          </div>
          <StatusPill status={detail.release.status} />
        </div>
        <div className="ota-detail-grid">
          {otaIdentityFields.map((field) => (
            <div className="ota-detail-item" key={field.key}>
              <span>{field.label}</span>
              <strong className="mono">
                {String(identity[field.key] ?? "-")}
              </strong>
              <small>来源：{field.source}</small>
            </div>
          ))}
        </div>
      </section>
      <section className="ota-detail-section">
        <h3>发布记录</h3>
        <div className="ota-detail-grid">
          <div className="ota-detail-item">
            <span>基线 APK</span>
            <strong>
              v{detail.release.baseVersion ?? "-"} · build{" "}
              {detail.release.baseBuildNumber ?? "-"}
            </strong>
          </div>
          <div className="ota-detail-item">
            <span>Revision / Update ID</span>
            <strong className="mono">
              {detail.release.revision} · {detail.release.updateId}
            </strong>
          </div>
          <div className="ota-detail-item">
            <span>生效策略</span>
            <strong>
              {detail.release.applyStrategy === "immediate"
                ? "立即重启"
                : "下次启动"}
            </strong>
          </div>
          <div className="ota-detail-item">
            <span>Manifest SHA-256</span>
            <strong className="mono">
              {detail.release.manifestSha256 ?? "-"}
            </strong>
          </div>
          <div className="ota-detail-item">
            <span>Manifest Object Key</span>
            <strong className="mono">
              {detail.release.manifestKey ?? "-"}
            </strong>
          </div>
          <div className="ota-detail-item">
            <span>代码提交 SHA</span>
            <strong className="mono">
              {detail.release.sourceCommitSha ?? "-"}
            </strong>
          </div>
        </div>
      </section>
      <details className="ota-manifest-raw">
        <summary>查看最终 Manifest JSON</summary>
        <pre>{JSON.stringify(detail.manifest, null, 2)}</pre>
      </details>
    </div>
  );
}

export function OtaPage({ tenantId }: AdminPageProps) {
  const queryClient = useQueryClient();
  const otaQuery = useAdminQuery(["ota-releases", tenantId], () =>
    adminApi.otaReleases(tenantId),
  );
  const localizationQuery = useAdminQuery(["localization", tenantId], () =>
    adminApi.localization(),
  );
  const [showCreate, setShowCreate] = React.useState(false);
  const [detailRelease, setDetailRelease] = React.useState<OtaRelease | null>(
    null,
  );
  const detailQuery = useQuery({
    queryKey: ["ota-release-detail", tenantId, detailRelease?.id],
    queryFn: () => adminApi.otaReleaseDetail(tenantId, detailRelease!.id),
    enabled: Boolean(detailRelease),
    staleTime: 15_000,
  });
  const [platform, setPlatform] = React.useState<"android" | "ios">(() =>
    releaseQueryParam("platform") === "ios" ? "ios" : "android",
  );
  const [channel, setChannel] = React.useState("production");
  const [applyStrategy, setApplyStrategy] = React.useState<
    "next_launch" | "immediate"
  >("next_launch");
  const [baseReleaseId, setBaseReleaseId] = React.useState(() =>
    releaseQueryParam("baseReleaseId"),
  );
  const [platformFilter, setPlatformFilter] = React.useState(() =>
    releaseQueryParam("platform"),
  );
  const [statusFilter, setStatusFilter] = React.useState(() =>
    releaseQueryParam("status"),
  );
  const [baseFilter, setBaseFilter] = React.useState(() =>
    releaseQueryParam("baseReleaseId"),
  );
  const [listChannel, setListChannel] = React.useState(() =>
    releaseQueryParam("channel"),
  );
  const baseQuery = useAdminQuery(
    ["ota-base-releases", tenantId, platform],
    () => adminApi.otaBaseReleases(tenantId, platform),
  );
  const autoOpenHandledRef = React.useRef(false);
  React.useEffect(() => {
    if (
      releaseQueryParam("action") === "create" &&
      baseReleaseId &&
      baseQuery.data &&
      !autoOpenHandledRef.current
    ) {
      autoOpenHandledRef.current = true;
      setShowCreate(true);
    }
  }, [baseQuery.data, baseReleaseId]);
  React.useEffect(() => {
    const syncFilters = () => {
      setPlatformFilter(releaseQueryParam("platform"));
      setStatusFilter(releaseQueryParam("status"));
      setListChannel(releaseQueryParam("channel"));
      setBaseFilter(releaseQueryParam("baseReleaseId"));
      const requestedPlatform = releaseQueryParam("platform");
      if (requestedPlatform === "android" || requestedPlatform === "ios") {
        setPlatform(requestedPlatform);
      }
      const requestedBase = releaseQueryParam("baseReleaseId");
      if (requestedBase) setBaseReleaseId(requestedBase);
    };
    window.addEventListener("popstate", syncFilters);
    return () => window.removeEventListener("popstate", syncFilters);
  }, []);
  const [file, setFile] = React.useState<File | null>(null);
  const [releaseNotes, setReleaseNotes] = React.useState<
    Record<string, string>
  >({ "zh-CN": "修复已知问题并优化体验" });
  const [activeReleaseNoteLanguage, setActiveReleaseNoteLanguage] =
    React.useState("zh-CN");
  const otaNoteLanguages = React.useMemo(
    () =>
      Object.entries(localizationQuery.data?.settings.languages ?? {})
        .filter(([, item]) => item.enabled)
        .sort(([, left], [, right]) => left.sort - right.sort),
    [localizationQuery.data?.settings.languages],
  );
  const otaDefaultLanguage =
    localizationQuery.data?.settings.fallbackLanguage ??
    otaNoteLanguages[0]?.[0] ??
    "zh-CN";
  React.useEffect(() => {
    setReleaseNotes((current) => {
      const next = { ...current };
      for (const [code] of otaNoteLanguages)
        if (!(code in next)) next[code] = "";
      if (!(next[otaDefaultLanguage] ?? "").trim())
        next[otaDefaultLanguage] = "修复已知问题并优化体验";
      return next;
    });
    if (!otaNoteLanguages.some(([code]) => code === activeReleaseNoteLanguage))
      setActiveReleaseNoteLanguage(otaDefaultLanguage);
  }, [activeReleaseNoteLanguage, otaDefaultLanguage, otaNoteLanguages]);
  const [sourceCommitSha, setSourceCommitSha] = React.useState("");
  const [uploadState, setUploadState] = React.useState<OtaUploadState>("idle");
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [uploadStage, setUploadStage] = React.useState("");
  const [uploadError, setUploadError] = React.useState("");
  const [artifactToken, setArtifactToken] = React.useState("");
  const [pendingAction, setPendingAction] = React.useState<{
    id: string;
    action: "publish" | "pause";
  } | null>(null);
  const [reason, setReason] = React.useState("");
  const [reasonError, setReasonError] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const uploadCancelledRef = React.useRef(false);
  const uploadStartedRef = React.useRef(false);
  const uploadMutation = useMutation({
    mutationFn: async (nextFile: File) => {
      const base = baseQuery.data?.items.find(
        (item) => item.id === baseReleaseId,
      );
      if (!base) throw new Error("请先选择有效的基线 APK");
      const controller = new AbortController();
      abortRef.current = controller;
      uploadCancelledRef.current = false;
      setUploadState("preparing");
      setUploadStage("正在申请安全上传地址");
      setUploadError("");
      setUploadProgress(0);
      const ticket = await adminApi.createOtaArtifactUpload(tenantId, {
        fileName: nextFile.name,
        contentType: nextFile.type || "application/zip",
        size: nextFile.size,
        baseReleaseId: base.id,
        channel,
      });
      setArtifactToken(ticket.artifact.token);
      setUploadState("uploading");
      setUploadStage("正在上传 OTA 资源");
      try {
        await uploadArtifactFile(
          ticket.upload,
          nextFile,
          setUploadProgress,
          controller.signal,
        );
      } catch (error) {
        await adminApi
          .deleteOtaArtifact(tenantId, ticket.artifact.token)
          .catch(() => undefined);
        throw error;
      }
      return ticket.artifact.token;
    },
    onSuccess: (token) => {
      setArtifactToken(token);
      setUploadState("uploaded");
      setUploadProgress(100);
      setUploadStage("资源上传完成，可以保存为待发布");
      uploadStartedRef.current = false;
      abortRef.current = null;
    },
    onError: (error) => {
      uploadStartedRef.current = false;
      abortRef.current = null;
      setArtifactToken("");
      if (uploadCancelledRef.current) {
        uploadCancelledRef.current = false;
        return;
      }
      setUploadState("error");
      setUploadStage("上传未完成");
      setUploadError(error instanceof Error ? error.message : "OTA 上传失败");
    },
  });
  const saveMutation = useMutation({
    mutationFn: () => {
      if (!artifactToken) throw new Error("请先上传 OTA 资源");
      if (!baseReleaseId) throw new Error("请选择基线 APK");
      if ((releaseNotes[otaDefaultLanguage] ?? "").trim().length < 3)
        throw new Error("请填写至少 3 个字符的发布说明");
      setUploadState("saving");
      setUploadStage("正在校验 Manifest 和资源并保存草稿");
      return adminApi.createOtaRelease(tenantId, {
        artifactToken,
        baseReleaseId,
        channel,
        applyStrategy,
        releaseNotes: Object.fromEntries(
          Object.entries(releaseNotes)
            .map(([language, value]) => [
              language,
              value
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean),
            ])
            .filter(([, value]) => (value as string[]).length > 0),
        ),
        ...(sourceCommitSha.trim()
          ? { sourceCommitSha: sourceCommitSha.trim() }
          : {}),
      });
    },
    onSuccess: () => {
      setShowCreate(false);
      resetForm();
      void queryClient.invalidateQueries({
        queryKey: ["ota-releases", tenantId],
      });
    },
    onError: (error) => {
      setUploadState("uploaded");
      setUploadStage("资源已上传，保存失败，可修改后重试");
      setUploadError(error instanceof Error ? error.message : "保存 OTA 失败");
    },
  });
  const actionMutation = useMutation({
    mutationFn: ({
      id,
      action,
      actionReason,
    }: {
      id: string;
      action: "publish" | "pause";
      actionReason: string;
    }) => adminApi.otaAction(tenantId, id, action, actionReason),
    onSuccess: () => {
      setPendingAction(null);
      setConfirmOpen(false);
      setReason("");
      void queryClient.invalidateQueries({
        queryKey: ["ota-releases", tenantId],
      });
    },
  });
  const resetForm = () => {
    abortRef.current?.abort();
    setFile(null);
    setArtifactToken("");
    setUploadState("idle");
    setUploadProgress(0);
    setUploadStage("");
    setUploadError("");
    setBaseReleaseId("");
    setApplyStrategy("next_launch");
    setSourceCommitSha("");
    uploadMutation.reset();
    saveMutation.reset();
  };
  const closeCreate = () => {
    if (uploadMutation.isPending || saveMutation.isPending) return;
    if (artifactToken)
      void adminApi
        .deleteOtaArtifact(tenantId, artifactToken)
        .catch(() => undefined);
    resetForm();
    setShowCreate(false);
  };
  const startUpload = (nextFile: File | null) => {
    if (
      !nextFile ||
      uploadStartedRef.current ||
      uploadMutation.isPending ||
      !baseReleaseId
    )
      return;
    uploadStartedRef.current = true;
    uploadMutation.mutate(nextFile);
  };
  const feedback =
    uploadMutation.isError || saveMutation.isError || actionMutation.isError
      ? (uploadMutation.error ?? saveMutation.error ?? actionMutation.error)
      : null;
  const otaReleases = [...(otaQuery.data?.items ?? [])].sort(
    (left, right) =>
      right.revision - left.revision ||
      Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
      right.id.localeCompare(left.id),
  );
  const filteredOtaReleases = otaReleases.filter((release) => {
    if (platformFilter && release.platform !== platformFilter) return false;
    if (statusFilter && release.status !== statusFilter) return false;
    if (listChannel && release.channel !== listChannel) return false;
    if (baseFilter && release.baseReleaseId !== baseFilter) return false;
    return true;
  });
  const updateOtaFilters = (next: Record<string, string>) => {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "ota");
    params.delete("action");
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    window.history.replaceState(null, "", `/releases?${params.toString()}`);
  };
  return (
    <>
      {feedback && (
        <FeedbackNotice
          kind="error"
          placement="viewport"
          message={feedback instanceof Error ? feedback.message : "操作失败"}
          onDismiss={() => {
            uploadMutation.reset();
            saveMutation.reset();
            actionMutation.reset();
          }}
        />
      )}
      <div className="page-heading">
        <div>
          <div className="eyebrow">OTA updates</div>
          <h1>OTA 热更新</h1>
          <p>选择基线 APK 后上传 OTA 资源，校验通过后从列表单独发布。</p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setShowCreate(true);
          }}
        >
          <CloudUpload size={16} />
          上传 OTA
        </Button>
      </div>
      {otaQuery.isLoading ? (
        <EmptyState title="正在加载 OTA 发布记录" />
      ) : otaQuery.isError ? (
        <div className="error-banner">
          无法加载 OTA：{otaQuery.error.message}
        </div>
      ) : otaReleases.length === 0 ? (
        <Card>
          <EmptyState
            title="还没有 OTA 发布"
            detail="上传第一个 OTA 包开始热更新。"
          />
        </Card>
      ) : filteredOtaReleases.length === 0 ? (
        <Card>
          <EmptyState
            title="没有匹配的 OTA 记录"
            detail="请调整平台、状态、Channel 或基线 APK筛选条件。"
          />
        </Card>
      ) : (
        <Card className="table-wrap">
          <div className="card-header">
            <div>
              <h2>OTA 发布记录</h2>
              <p style={{ fontSize: 12, marginTop: 4 }}>
                每条 OTA 必须兼容所选基线 APK 的 Runtime Version。
              </p>
            </div>
            <div className="toolbar ota-filter-toolbar">
              <SelectField
                aria-label="OTA 平台筛选"
                value={platformFilter}
                onChange={(e) => {
                  setPlatformFilter(e.target.value);
                  updateOtaFilters({ platform: e.target.value });
                }}
              >
                <option value="">全部平台</option>
                <option value="android">Android</option>
                <option value="ios">iOS</option>
              </SelectField>
              <SelectField
                aria-label="OTA 状态筛选"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  updateOtaFilters({ status: e.target.value });
                }}
              >
                <option value="">全部状态</option>
                <option value="verified">待发布</option>
                <option value="active">已发布</option>
                <option value="paused">已暂停</option>
                <option value="superseded">历史版本</option>
              </SelectField>
              <SelectField
                aria-label="OTA 通道筛选"
                value={listChannel}
                onChange={(e) => {
                  setListChannel(e.target.value);
                  updateOtaFilters({ channel: e.target.value });
                }}
              >
                <option value="">全部 Channel</option>
                <option value="production">production</option>
                <option value="staging">staging</option>
              </SelectField>
              <SelectField
                aria-label="OTA 基线 APK 筛选"
                value={baseFilter}
                onChange={(e) => {
                  setBaseFilter(e.target.value);
                  updateOtaFilters({ baseReleaseId: e.target.value });
                }}
              >
                <option value="">全部基线 APK</option>
                {otaReleases
                  .filter(
                    (release, index, items) =>
                      items.findIndex(
                        (item) => item.baseReleaseId === release.baseReleaseId,
                      ) === index,
                  )
                  .map((release) => (
                    <option
                      key={release.baseReleaseId}
                      value={release.baseReleaseId}
                    >
                      v{release.baseVersion ?? "-"} · build{" "}
                      {release.baseBuildNumber ?? "-"}
                    </option>
                  ))}
              </SelectField>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>序号</th>
                <th>基线 APK</th>
                <th>平台 / 通道</th>
                <th>Runtime / Revision</th>
                <th>生效策略</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredOtaReleases.map((release, index) => (
                <tr key={release.id}>
                  <td className="muted mono">{index + 1}</td>
                  <td>
                    <strong>
                      v
                      {release.baseRelease?.version ??
                        release.baseVersion ??
                        "-"}
                    </strong>
                    <div className="muted mono">
                      build{" "}
                      {release.baseRelease?.buildNumber ??
                        release.baseBuildNumber ??
                        "-"}
                    </div>
                  </td>
                  <td>
                    {release.platform}
                    <div className="muted">{release.channel}</div>
                  </td>
                  <td className="mono">
                    <RuntimeVersionValue value={release.runtimeVersion} />
                    <div className="muted">revision {release.revision}</div>
                  </td>
                  <td>
                    <span className="strategy-pill">
                      {release.applyStrategy === "immediate"
                        ? "立即重启"
                        : "下次启动"}
                    </span>
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
                    <div className="toolbar">
                      <Button
                        variant="ghost"
                        onClick={() => setDetailRelease(release)}
                      >
                        详情
                      </Button>
                      {release.status === "verified" && (
                        <Button
                          onClick={() => {
                            setPendingAction({
                              id: release.id,
                              action: "publish",
                            });
                            setReason("");
                          }}
                        >
                          发布 OTA
                        </Button>
                      )}
                      {release.status === "active" && (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setPendingAction({
                              id: release.id,
                              action: "pause",
                            });
                            setReason("");
                          }}
                        >
                          暂停
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <SidePanel
        open={detailRelease !== null}
        title="OTA 详情"
        description="展示服务端最终保存的 Manifest、字段来源和基线 APK 身份。"
        onClose={() => setDetailRelease(null)}
        footer={
          <Button variant="ghost" onClick={() => setDetailRelease(null)}>
            关闭
          </Button>
        }
      >
        {detailQuery.isLoading ? (
          <EmptyState title="正在读取 OTA Manifest" />
        ) : detailQuery.isError ? (
          <div className="error-banner">
            无法读取 OTA 详情：{detailQuery.error.message}
          </div>
        ) : detailQuery.data ? (
          <OtaReleaseDetailPanel detail={detailQuery.data} />
        ) : null}
      </SidePanel>
      <SidePanel
        open={showCreate}
        title="上传 OTA 热更新"
        description="先选择兼容的基线 APK，再选择文件立即上传；保存只生成待发布记录，不会自动生效。"
        onClose={closeCreate}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={uploadMutation.isPending || saveMutation.isPending}
              onClick={closeCreate}
            >
              取消
            </Button>
            <Button
              disabled={
                uploadMutation.isPending ||
                saveMutation.isPending ||
                uploadState !== "uploaded" ||
                !baseReleaseId ||
                (releaseNotes[otaDefaultLanguage] ?? "").trim().length < 3
              }
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "正在保存…" : "保存为待发布"}
            </Button>
          </>
        }
      >
        <div className="side-panel-form">
          <SelectField
            label="平台"
            value={platform}
            disabled={uploadState !== "idle"}
            onChange={(e) => {
              setPlatform(e.target.value as "android" | "ios");
              setBaseReleaseId("");
            }}
          >
            <option value="android">Android</option>
            <option value="ios">iOS</option>
          </SelectField>
          <SelectField
            label="基线 APK"
            value={baseReleaseId}
            disabled={uploadState !== "idle" || baseQuery.isLoading}
            onChange={(e) => setBaseReleaseId(e.target.value)}
          >
            <option value="">请选择已校验或已发布的 APK</option>
            {(baseQuery.data?.items ?? []).map((base) => (
              <option key={base.id} value={base.id}>
                v{base.version} · build {base.buildNumber} ·{" "}
                {base.runtimeVersion} · {base.status}
              </option>
            ))}
          </SelectField>
          {baseReleaseId &&
            (() => {
              const base = baseQuery.data?.items.find(
                (item) => item.id === baseReleaseId,
              );
              return base ? (
                <div className="prerequisite-panel">
                  <ShieldCheck size={18} />
                  <div>
                    <strong>
                      Runtime Version：
                      <RuntimeVersionValue value={base.runtimeVersion} />
                    </strong>
                    <p>
                      OTA 只会分发给相同 Runtime 的 {base.platform} 客户端。
                    </p>
                  </div>
                </div>
              ) : null;
            })()}
          <SelectField
            label="Channel"
            value={channel}
            disabled={uploadState !== "idle"}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="production">production</option>
            <option value="staging">staging</option>
          </SelectField>
          <fieldset className="form-field ota-strategy-field">
            <legend>生效策略</legend>
            <div className="ota-strategy-grid">
              <label
                className={`ota-strategy-option${applyStrategy === "next_launch" ? " is-selected" : ""}`}
              >
                <input
                  type="radio"
                  name="ota-apply-strategy"
                  value="next_launch"
                  checked={applyStrategy === "next_launch"}
                  onChange={() => setApplyStrategy("next_launch")}
                />
                <span>
                  <strong>下次启动生效</strong>
                  <small>下载完成后不打断当前使用，下次打开 App 时应用。</small>
                </span>
              </label>
              <label
                className={`ota-strategy-option${applyStrategy === "immediate" ? " is-selected" : ""}`}
              >
                <input
                  type="radio"
                  name="ota-apply-strategy"
                  value="immediate"
                  checked={applyStrategy === "immediate"}
                  onChange={() => setApplyStrategy("immediate")}
                />
                <span>
                  <strong>立即重启生效</strong>
                  <small>下载完成后由 App 提示用户确认，确认后重启应用。</small>
                </span>
              </label>
            </div>
          </fieldset>
          <div className="form-field">
            <span>OTA 资源包</span>
            <FileDropzone
              label="OTA 资源包"
              file={file}
              accept=".zip,application/zip"
              disabled={uploadState !== "idle" || !baseReleaseId}
              hint={
                baseReleaseId
                  ? "选择后立即上传 ZIP，服务端会校验 Manifest 和资源"
                  : "请先选择基线 APK"
              }
              onFileChange={(next) => {
                if (artifactToken)
                  void adminApi.deleteOtaArtifact(tenantId, artifactToken);
                setFile(next);
                setArtifactToken("");
                setUploadState("idle");
                setUploadError("");
                setUploadProgress(0);
                startUpload(next);
              }}
            />
          </div>
          {file && uploadState !== "idle" && (
            <div className="upload-progress-panel">
              <div>
                <span>
                  {uploadStage}
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
                  ? "资源已上传，保存后由服务端校验并创建待发布记录。"
                  : `${file.name} · ${formatFileSize((file.size * uploadProgress) / 100)} / ${formatFileSize(file.size)}`}
              </small>
              {(uploadState === "preparing" || uploadState === "uploading") && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    uploadCancelledRef.current = true;
                    abortRef.current?.abort();
                    abortRef.current = null;
                    uploadStartedRef.current = false;
                    setArtifactToken("");
                    setUploadState("idle");
                    setUploadStage("");
                    setUploadProgress(0);
                  }}
                >
                  取消上传
                </Button>
              )}
              {uploadState === "error" && (
                <Button variant="ghost" onClick={() => startUpload(file)}>
                  重新上传
                </Button>
              )}
            </div>
          )}
          <label className="form-field">
            <span>发布说明</span>
            <div
              className="release-note-language-tabs"
              role="tablist"
              aria-label="OTA 发布说明语言"
            >
              {otaNoteLanguages.map(([code, item]) => (
                <button
                  type="button"
                  key={code}
                  className={
                    activeReleaseNoteLanguage === code ? "is-active" : ""
                  }
                  onClick={() => setActiveReleaseNoteLanguage(code)}
                >
                  {item.nativeName || item.label}
                  {code === otaDefaultLanguage ? "（默认）" : ""}
                </button>
              ))}
            </div>
            <textarea
              className="input textarea"
              value={releaseNotes[activeReleaseNoteLanguage] ?? ""}
              onChange={(e) =>
                setReleaseNotes((current) => ({
                  ...current,
                  [activeReleaseNoteLanguage]: e.target.value,
                }))
              }
              placeholder="例如：修复行情刷新问题"
              disabled={saveMutation.isPending}
            />
            <small>语言来自多语言管理；默认语言必须填写，其他语言可选。</small>
          </label>
          <label className="form-field">
            <span>代码提交 SHA（可选）</span>
            <input
              className="input mono"
              value={sourceCommitSha}
              onChange={(e) => setSourceCommitSha(e.target.value)}
              placeholder="用于追踪 OTA 来源"
              disabled={saveMutation.isPending}
            />
          </label>
        </div>
      </SidePanel>
      <SidePanel
        open={pendingAction !== null}
        title={pendingAction?.action === "pause" ? "暂停 OTA" : "发布 OTA"}
        description="高风险操作需要填写原因并再次确认，最终状态由服务端校验。"
        onClose={() => {
          setPendingAction(null);
          setReason("");
          setReasonError("");
        }}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingAction(null)}>
              取消
            </Button>
            <Button
              variant={pendingAction?.action === "pause" ? "danger" : "primary"}
              disabled={reason.trim().length < 3}
              onClick={() => {
                if (reason.trim().length < 3) {
                  setReasonError("请填写至少 3 个字符的操作原因。");
                  return;
                }
                setConfirmOpen(true);
              }}
            >
              继续确认
            </Button>
          </>
        }
      >
        <div className="side-panel-form">
          <label className="form-field">
            <span>操作原因</span>
            <textarea
              className="input textarea"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError("");
              }}
              aria-invalid={Boolean(reasonError)}
              aria-describedby={
                reasonError ? "ota-action-reason-error" : undefined
              }
              placeholder="至少 3 个字符"
            />
            {reasonError && (
              <small className="field-error" id="ota-action-reason-error">
                {reasonError}
              </small>
            )}
          </label>
          <span className="muted">原因会与操作者、请求 ID 一起记录。</span>
        </div>
      </SidePanel>
      <ConfirmDialog
        open={confirmOpen && pendingAction !== null}
        title={`确认${pendingAction?.action === "pause" ? "暂停 OTA" : "发布 OTA"}？`}
        description="该操作会影响当前租户对应 Runtime 的客户端。"
        confirmLabel="确认操作"
        tone={pendingAction?.action === "pause" ? "danger" : "default"}
        loading={actionMutation.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          if (pendingAction)
            actionMutation.mutate({
              id: pendingAction.id,
              action: pendingAction.action,
              actionReason: reason.trim(),
            });
        }}
      >
        <div className="dialog-detail-list">
          <span>操作原因：{reason.trim()}</span>
          <span>状态转换由服务端最终校验</span>
        </div>
      </ConfirmDialog>
    </>
  );
}
