import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  CirclePause,
  CloudUpload,
  Copy,
  ExternalLink,
  RotateCcw,
  ShieldCheck,
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
  FileDropzone,
  SelectField,
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
  rollback: "回滚",
};

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
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [publishedRelease, setPublishedRelease] =
    React.useState<Release | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [platform, setPlatform] = React.useState("android");
  const [version, setVersion] = React.useState("");
  const [buildNumber, setBuildNumber] = React.useState("");
  const [runtimeVersion, setRuntimeVersion] = React.useState("expo:57.0.15");
  const [releaseNotes, setReleaseNotes] =
    React.useState("修复已知问题并优化体验");
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [uploadStage, setUploadStage] = React.useState("");
  const [pendingAction, setPendingAction] = React.useState<{
    id: string;
    action: string;
  } | null>(null);
  const [actionReason, setActionReason] = React.useState("");
  const [actionConfirmOpen, setActionConfirmOpen] = React.useState(false);
  const [uploadConfirmOpen, setUploadConfirmOpen] = React.useState(false);
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("请选择 APK 文件");
      if (!version.trim() || !buildNumber.trim())
        throw new Error("请填写版本号和构建号");
      setUploadStage("正在申请安全上传地址");
      setUploadProgress(0);
      const ticket = await adminApi.createReleaseUpload(tenantId, {
        platform,
        version: version.trim(),
        buildNumber: Number(buildNumber),
        runtimeVersion,
        releaseNotes: {
          "zh-CN": releaseNotes
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
        },
        fileName: file.name,
        contentType: file.type || "application/vnd.android.package-archive",
        size: file.size,
      });
      setUploadStage("正在直传对象存储");
      await uploadArtifactFile(ticket.upload, file, setUploadProgress);
      setUploadStage("服务端正在校验包身份与签名");
      await adminApi.finalizeReleaseUpload(tenantId, ticket.release.id);
      const auditReason = releaseNotes.trim().slice(0, 400);
      if (auditReason.length < 3) {
        throw new Error("请填写至少 3 个字符的发布说明");
      }
      setUploadStage("正在发布到官网");
      const activated = await adminApi.action(
        tenantId,
        ticket.release.id,
        "publish",
        auditReason,
      );
      return activated.release;
    },
    onSuccess: (release) => {
      setShowCreate(false);
      setUploadConfirmOpen(false);
      setFile(null);
      setUploadProgress(0);
      setUploadStage("");
      setPublishedRelease(release);
      void queryClient.invalidateQueries({ queryKey: ["releases", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["overview", tenantId] });
    },
    onError: () => setUploadConfirmOpen(false),
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
  };
  const requestActionConfirmation = () => {
    if (!pendingAction) return;
    const reason = actionReason.trim();
    if (reason.length < 3) return;
    setActionConfirmOpen(true);
  };
  const confirmAction = () => {
    if (!pendingAction) return;
    const reason = actionReason.trim();
    if (reason.length < 3) return;
    mutation.mutate({ ...pendingAction, reason });
  };
  const confirmUpload = () => {
    createMutation.mutate();
  };
  return (
    <>
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
      {showCreate && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-header">
            <h2>上传安装包</h2>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              取消
            </Button>
          </div>
          <div className="card-body">
            <div className="release-upload-grid">
              <div className="form-grid form-grid-3">
                <SelectField
                  label="平台"
                  value={platform}
                  disabled={createMutation.isPending}
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
                  disabled={createMutation.isPending}
                  hint={
                    platform === "android"
                      ? "支持 APK，服务端会校验版本号、构建号与签名"
                      : "服务端会校验文件大小、哈希与版本身份"
                  }
                  onFileChange={setFile}
                />
              </div>
              <label className="form-field release-notes-field">
                <span>发布说明</span>
                <textarea
                  className="input textarea"
                  placeholder="例如：修复行情刷新问题，优化钱包连接体验"
                  value={releaseNotes}
                  disabled={createMutation.isPending}
                  onChange={(event) => setReleaseNotes(event.target.value)}
                />
              </label>
              <div className="release-upload-actions">
                <Button
                  disabled={
                    createMutation.isPending ||
                    !file ||
                    releaseNotes.trim().length < 3 ||
                    !version.trim() ||
                    Number(buildNumber) < 1
                  }
                  onClick={() => {
                    setUploadConfirmOpen(true);
                  }}
                >
                  <CloudUpload size={16} />
                  校验并发布到官网
                </Button>
              </div>
              {createMutation.isPending && (
                <div className="upload-progress-panel">
                  <div>
                    <span>{uploadStage}</span>
                    <strong>{uploadProgress}%</strong>
                  </div>
                  <div className="progress">
                    <span style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}
              <details
                className="advanced-release-options"
                open={advancedOpen}
                onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
              >
                <summary>高级选项</summary>
                <div className="form-grid form-grid-3">
                  <label className="form-field">
                    <span>Runtime Version</span>
                    <input
                      className="input"
                      value={runtimeVersion}
                      disabled={createMutation.isPending}
                      onChange={(event) =>
                        setRuntimeVersion(event.target.value)
                      }
                    />
                  </label>
                  <label className="form-field">
                    <span>发布模式</span>
                    <input
                      className="input"
                      value="校验通过后全量发布"
                      disabled
                    />
                  </label>
                </div>
              </details>
            </div>
            {createMutation.isError && (
              <div className="error-banner" style={{ marginTop: 15 }}>
                创建失败：{createMutation.error.message}
              </div>
            )}
          </div>
        </div>
      )}
      {pendingAction && (
        <Card className="action-confirmation">
          <div className="card-header">
            <div>
              <h2>
                确认
                {actionLabels[pendingAction.action] ?? pendingAction.action}
              </h2>
              <p>请填写可审计的操作原因，提交后不能从审计记录中删除。</p>
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                setPendingAction(null);
                setActionConfirmOpen(false);
                setActionReason("");
              }}
            >
              取消
            </Button>
          </div>
          <div className="card-body">
            <textarea
              className="input textarea"
              aria-label="操作原因"
              placeholder="至少 3 个字符，例如：已完成测试环境安装验证"
              value={actionReason}
              onChange={(event) => setActionReason(event.target.value)}
            />
            <div className="toolbar action-confirmation-footer">
              <span className="muted">原因会与操作者、请求 ID 一起记录</span>
              <Button
                variant={
                  pendingAction.action === "rollback" ? "danger" : "primary"
                }
                disabled={actionReason.trim().length < 3 || mutation.isPending}
                onClick={requestActionConfirmation}
              >
                继续确认
              </Button>
            </div>
            {mutation.isError && (
              <div className="error-banner">
                操作失败：{mutation.error.message}
              </div>
            )}
          </div>
        </Card>
      )}
      <ConfirmDialog
        open={actionConfirmOpen && pendingAction !== null}
        title={`确认${pendingAction ? (actionLabels[pendingAction.action] ?? pendingAction.action) : "操作"}？`}
        description="操作原因将与操作者、请求 ID 一起写入追加式审计日志。"
        confirmLabel={
          pendingAction
            ? `确认${actionLabels[pendingAction.action] ?? pendingAction.action}`
            : "确认操作"
        }
        tone={pendingAction?.action === "rollback" ? "danger" : "default"}
        loading={mutation.isPending}
        onCancel={() => setActionConfirmOpen(false)}
        onConfirm={confirmAction}
      >
        <div className="dialog-detail-list">
          <span>操作原因：{actionReason.trim() || "未填写"}</span>
          <span>该动作由服务端状态机最终校验</span>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={uploadConfirmOpen}
        title="上传并发布到官网？"
        description="服务端将校验文件、版本、平台信息和安装包身份，校验通过后直接生成官网安装链接。"
        confirmLabel="确认发布"
        loading={createMutation.isPending}
        onCancel={() => setUploadConfirmOpen(false)}
        onConfirm={confirmUpload}
      >
        <div className="dialog-detail-list">
          <span>平台：{platform}</span>
          <span>
            版本：{version || "未填写"} · build {buildNumber || "-"}
          </span>
          <span>文件：{file?.name || "未选择"}</span>
        </div>
      </ConfirmDialog>
      <Card className="table-wrap">
        <div className="card-header">
          <div>
            <h2>发布记录</h2>
            <p style={{ fontSize: 12, marginTop: 4 }}>
              查看官网当前版本与历史发布结果
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
                      <a
                        className="table-link"
                        href={publicApiUrl(
                          `/v1/public/releases/${release.id}/download`,
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={14} />
                        获取链接
                      </a>
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
                            onClick={() => runAction(release.id, "pause")}
                          >
                            <CirclePause size={14} />
                            暂停
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => runAction(release.id, "rollback")}
                          >
                            <RotateCcw size={14} />
                            回滚
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
