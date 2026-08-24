import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import {
  Activity,
  ArrowUpRight,
  Check,
  CirclePause,
  CloudUpload,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { adminApi } from "../../core/api";
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

export function DashboardPage({ onNavigate }: AdminPageProps) {
  const query = useAdminQuery(["overview"], adminApi.overview);
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
              当前管理 API 使用开发密钥适配器，发布数据已持久化到 MySQL； RBAC
              与双人审批暂不进入当前流程。
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}

export function ReleasesPage() {
  const queryClient = useQueryClient();
  const query = useAdminQuery(["releases"], adminApi.releases);
  const [busy, setBusy] = useStateAction();
  const [showCreate, setShowCreate] = React.useState(false);
  const [version, setVersion] = React.useState("1.2.0");
  const [buildNumber, setBuildNumber] = React.useState("120");
  const [percentage, setPercentage] = React.useState("10");
  const createMutation = useMutation({
    mutationFn: () =>
      adminApi.createRelease({
        applicationId: "dex-mobile",
        platform: "android",
        version,
        buildNumber: Number(buildNumber),
        runtimeVersion: "expo:57.0.15",
        channel: "direct",
        releaseNotes: ["通过管理端创建"],
        artifact: {
          id: `artifact-${buildNumber}`,
          fileName: `dex-mobile-${version}-${buildNumber}.apk`,
          downloadUrl: "https://downloads.example.com/pending.apk",
          size: 0,
          sha256: "pending-sha256",
          signingFingerprint: null,
          minOsVersion: "8.0",
        },
        rollout: {
          percentage: Number(percentage),
          audience: "internal",
          startsAt: null,
          stopRule: null,
        },
      }),
    onSuccess: () => {
      setShowCreate(false);
      void queryClient.invalidateQueries({ queryKey: ["releases"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });
  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      adminApi.action(id, action, `${action} from release console`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["releases"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
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
    if (!window.confirm(`确认执行 ${action}？该动作会写入审计日志。`)) return;
    setBusy(`${id}:${action}`);
    mutation.mutate({ id, action }, { onSettled: () => setBusy(null) });
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
            <div className="toolbar">
              <label>
                版本{" "}
                <input
                  className="input"
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                />
              </label>
              <label>
                Build{" "}
                <input
                  className="input"
                  value={buildNumber}
                  onChange={(event) => setBuildNumber(event.target.value)}
                />
              </label>
              <label>
                灰度 %{" "}
                <input
                  className="input"
                  value={percentage}
                  onChange={(event) => setPercentage(event.target.value)}
                />
              </label>
              <Button
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                提交草稿
              </Button>
            </div>
            {createMutation.isError && (
              <div className="error-banner" style={{ marginTop: 15 }}>
                创建失败：{createMutation.error.message}
              </div>
            )}
          </div>
        </div>
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
                        <Button
                          variant="ghost"
                          disabled={busy !== null}
                          onClick={() => runAction(release.id, "verify")}
                        >
                          <Check size={14} />
                          校验
                        </Button>
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

function useStateAction(): [string | null, (value: string | null) => void] {
  const [value, setValue] = React.useState<string | null>(null);
  return [value, setValue];
}
