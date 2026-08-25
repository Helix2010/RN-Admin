import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import {
  Activity,
  ArrowUpRight,
  CirclePause,
  CloudUpload,
  FileArchive,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { adminApi, uploadArtifactFile } from "../../core/api";
import {
  Button,
  Card,
  EmptyState,
  StatusPill,
} from "../../design-system/components";
import type { AdminPageProps } from "../../plugin-system/types";

function useAdminQuery<T>(key: string[], queryFn: () => Promise<T>) {
  return useQuery({ queryKey: key, queryFn, staleTime: 15_000 });
}

const actionLabels: Record<string, string> = {
  verify: "校验",
  stage: "预发布",
  activate: "激活",
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
          <p>关注当前线上版本、灰度进度和需要人工处理的发布动作。</p>
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
          <div className="metric-caption">iOS / Android</div>
        </Card>
        <Card className="metric">
          <div className="metric-label">平均灰度比例</div>
          <div className="metric-value">{data.rollout}%</div>
          <div className="metric-caption">基于活跃渠道</div>
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
            {(["android", "ios"] as const).map((platform) => {
              const release = data.current[platform];
              return (
                <div className="version-row" key={platform}>
                  <div className="platform">
                    <div className="platform-icon">
                      {platform === "android" ? "A" : "i"}
                    </div>
                    <div>
                      <strong>
                        {platform === "android" ? "Android" : "iOS"}
                      </strong>
                      {release ? (
                        <div className="version-meta">
                          v{release.version} · build {release.buildNumber} ·{" "}
                          {release.channel}
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
                        <span
                          style={{ width: `${release.rollout.percentage}%` }}
                        />
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

export function ReleasesPage({ tenantId, onNavigate }: AdminPageProps) {
  const queryClient = useQueryClient();
  const query = useAdminQuery(["releases", tenantId], () =>
    adminApi.releases(tenantId),
  );
  const [showCreate, setShowCreate] = React.useState(false);
  const applicationsQuery = useAdminQuery(["applications", tenantId], () =>
    adminApi.applications(tenantId),
  );
  const storageQuery = useAdminQuery(["storage-config", tenantId], () =>
    adminApi.storageConfig(tenantId),
  );
  const [applicationId, setApplicationId] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [runtimeVersion, setRuntimeVersion] = React.useState("expo:57.0.15");
  const [releaseNotes, setReleaseNotes] =
    React.useState("修复已知问题并优化体验");
  const [percentage, setPercentage] = React.useState("10");
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [uploadStage, setUploadStage] = React.useState("");
  const [pendingAction, setPendingAction] = React.useState<{
    id: string;
    action: string;
  } | null>(null);
  const [actionReason, setActionReason] = React.useState("");
  React.useEffect(() => {
    if (!applicationId && applicationsQuery.data?.items[0]) {
      setApplicationId(applicationsQuery.data.items[0].id);
    }
  }, [applicationId, applicationsQuery.data]);
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("请选择 APK 文件");
      if (!applicationId) throw new Error("请先配置 Android 应用");
      setUploadStage("正在申请安全上传地址");
      setUploadProgress(0);
      const ticket = await adminApi.createArtifactUpload(tenantId, {
        applicationId,
        fileName: file.name,
        contentType: file.type || "application/vnd.android.package-archive",
        size: file.size,
      });
      setUploadStage("正在直传对象存储");
      await uploadArtifactFile(ticket.upload, file, setUploadProgress);
      setUploadStage("服务端正在校验包身份与签名");
      const finalized = await adminApi.finalizeArtifact(
        tenantId,
        ticket.artifact.id,
      );
      const artifact = finalized.artifact;
      if (!artifact.versionName || !artifact.versionCode) {
        throw new Error("服务端未返回完整 APK 版本信息");
      }
      setUploadStage("正在创建发布记录");
      return adminApi.createRelease(tenantId, {
        applicationId,
        platform: "android",
        version: artifact.versionName,
        buildNumber: artifact.versionCode,
        runtimeVersion,
        channel: "direct",
        releaseNotes: releaseNotes
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        artifactId: artifact.id,
        rollout: {
          percentage: Number(percentage),
          audience: "internal",
          startsAt: null,
          stopRule: null,
        },
      });
    },
    onSuccess: () => {
      setShowCreate(false);
      setFile(null);
      setUploadProgress(0);
      setUploadStage("");
      void queryClient.invalidateQueries({ queryKey: ["releases", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["overview", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["artifacts", tenantId] });
    },
  });
  const mutation = useMutation({
    mutationFn: ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: string;
      reason: string;
    }) => adminApi.action(tenantId, id, action, reason),
    onSuccess: () => {
      setPendingAction(null);
      setActionReason("");
      void queryClient.invalidateQueries({ queryKey: ["releases", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["overview", tenantId] });
    },
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
  const confirmAction = () => {
    if (!pendingAction) return;
    const reason = actionReason.trim();
    const label = actionLabels[pendingAction.action] ?? pendingAction.action;
    if (reason.length < 3) return;
    if (!window.confirm(`确认${label}？操作原因将写入审计日志。`)) return;
    mutation.mutate({ ...pendingAction, reason });
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Release management</div>
          <h1>发布管理</h1>
          <p>同一份已校验 artifact 通过状态机进入灰度、全量或回滚。</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <CloudUpload size={16} />
          创建发布
        </Button>
      </div>
      {showCreate && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-header">
            <h2>创建 Android Direct 发布</h2>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              取消
            </Button>
          </div>
          <div className="card-body">
            {!storageQuery.data?.configured ||
            (applicationsQuery.data?.items.length ?? 0) === 0 ? (
              <div className="prerequisite-panel">
                <ShieldCheck size={20} />
                <div>
                  <strong>发布前还需要完成租户分发配置</strong>
                  <p>
                    {!storageQuery.data?.configured
                      ? "请先配置并测试 S3 兼容对象存储。"
                      : "请先登记 Android packageName 与签名证书 SHA-256。"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => onNavigate("distribution")}
                >
                  前往配置
                </Button>
              </div>
            ) : (
              <div className="release-upload-grid">
                <label className="form-field">
                  <span>Android 应用</span>
                  <select
                    className="select"
                    value={applicationId}
                    onChange={(event) => setApplicationId(event.target.value)}
                    disabled={createMutation.isPending}
                  >
                    {applicationsQuery.data?.items.map((application) => (
                      <option value={application.id} key={application.id}>
                        {application.name} · {application.packageName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>APK 安装包</span>
                  <input
                    className="input file-input"
                    type="file"
                    accept=".apk,application/vnd.android.package-archive"
                    disabled={createMutation.isPending}
                    onChange={(event) =>
                      setFile(event.target.files?.[0] ?? null)
                    }
                  />
                  <small>最大尺寸由服务端控制；版本号与签名均从 APK 读取</small>
                </label>
                <label className="form-field">
                  <span>Runtime Version</span>
                  <input
                    className="input"
                    value={runtimeVersion}
                    disabled={createMutation.isPending}
                    onChange={(event) => setRuntimeVersion(event.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span>首批灰度比例</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={100}
                    value={percentage}
                    disabled={createMutation.isPending}
                    onChange={(event) => setPercentage(event.target.value)}
                  />
                </label>
                <label className="form-field release-notes-field">
                  <span>发布说明（每行一条）</span>
                  <textarea
                    className="input textarea"
                    value={releaseNotes}
                    disabled={createMutation.isPending}
                    onChange={(event) => setReleaseNotes(event.target.value)}
                  />
                </label>
                <div className="upload-summary">
                  <FileArchive size={22} />
                  <div>
                    <strong>{file?.name ?? "尚未选择 APK"}</strong>
                    <p>
                      {file
                        ? formatBytes(file.size)
                        : "文件将直接上传到租户对象存储"}
                    </p>
                  </div>
                  <Button
                    disabled={
                      createMutation.isPending ||
                      !file ||
                      !applicationId ||
                      Number(percentage) < 1 ||
                      Number(percentage) > 100
                    }
                    onClick={() => createMutation.mutate()}
                  >
                    <CloudUpload size={16} />
                    上传、校验并创建发布
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
              </div>
            )}
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
                onClick={confirmAction}
              >
                确认
                {actionLabels[pendingAction.action] ?? pendingAction.action}
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
      <Card className="table-wrap">
        <div className="card-header">
          <div>
            <h2>全部发布</h2>
            <p style={{ fontSize: 12, marginTop: 4 }}>
              数据来源：MySQL 持久化仓储
            </p>
          </div>
          <div className="toolbar">
            <select className="select" aria-label="平台">
              <option>全部平台</option>
            </select>
            <select className="select" aria-label="状态">
              <option>全部状态</option>
            </select>
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
                <th>Runtime</th>
                <th>状态</th>
                <th>灰度</th>
                <th>更新时间</th>
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
                    <div className="muted">{release.channel}</div>
                  </td>
                  <td className="mono muted">{release.runtimeVersion}</td>
                  <td>
                    <StatusPill status={release.status} />
                  </td>
                  <td style={{ minWidth: 130 }}>
                    <div className="mono" style={{ marginBottom: 5 }}>
                      {release.rollout.percentage}%
                    </div>
                    <div className="progress">
                      <span
                        style={{ width: `${release.rollout.percentage}%` }}
                      />
                    </div>
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
                      {release.status === "uploaded" && (
                        <span className="muted">需重新上传真实 APK</span>
                      )}
                      {release.status === "verified" && (
                        <Button
                          variant="ghost"
                          onClick={() => runAction(release.id, "stage")}
                        >
                          <ShieldCheck size={14} />
                          预发布
                        </Button>
                      )}
                      {release.status === "staged" && (
                        <Button
                          onClick={() => runAction(release.id, "activate")}
                        >
                          <ArrowUpRight size={14} />
                          激活
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

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
