import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { adminApi } from "../../core/api";
import {
  Button,
  Card,
  EmptyState,
  StatusPill,
} from "../../design-system/components";
import type { AdminPageProps } from "../../plugin-system/types";

function compactIdentifier(value: string): string {
  if (value.length <= 26) return value;
  return `${value.slice(0, 15)}…${value.slice(-8)}`;
}

function statusLabel(value: string): string {
  if (value === "sent") return "已发送";
  if (value === "failed") return "失败";
  if (value === "cancelled") return "已取消";
  if (value === "pending") return "待发送";
  return value;
}

export function PushEventsPage({ tenantId }: AdminPageProps) {
  const [status, setStatus] = useState("");
  const outbox = useQuery({
    queryKey: ["push-outbox", tenantId],
    queryFn: () => adminApi.pushOutbox(tenantId),
  });
  const deliveries = useQuery({
    queryKey: ["push-deliveries", tenantId, status],
    queryFn: () => adminApi.pushDeliveries(tenantId, status),
  });
  if (outbox.isLoading || deliveries.isLoading)
    return <EmptyState title="正在加载通知记录" />;
  if (outbox.isError || deliveries.isError)
    return <div className="error-banner">无法加载通知记录，请刷新后重试。</div>;
  const failedCount =
    deliveries.data?.items.filter((item) => item.status === "failed").length ??
    0;
  return (
    <div className="push-events-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Push operations</div>
          <h1>通知记录</h1>
          <p>查看当前租户的 Outbox 事件和推送投递结果，不展示原始 Token。</p>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            void outbox.refetch();
            void deliveries.refetch();
          }}
        >
          <RefreshCw size={16} />
          刷新
        </Button>
      </div>
      <div className="metric-grid metric-grid-compact">
        <Card className="metric">
          <div className="metric-label">事件数</div>
          <div className="metric-value">{outbox.data?.total ?? 0}</div>
          <div className="metric-caption">最近 200 条通知事件</div>
        </Card>
        <Card className="metric">
          <div className="metric-label">投递失败</div>
          <div className="metric-value">{failedCount}</div>
          <div className="metric-caption">当前筛选中的失败记录</div>
        </Card>
      </div>
      <Card>
        <div className="card-header">
          <div>
            <h2>Outbox 事件</h2>
            <p className="section-caption">
              发布事务提交后由 Go Worker 异步发送
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table push-outbox-table">
            <thead>
              <tr>
                <th>事件</th>
                <th>状态</th>
                <th>尝试</th>
                <th>成功/失败</th>
                <th>最近错误</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              {(outbox.data?.items ?? []).map((item) => (
                <tr key={item.id}>
                  <td className="push-event-identity-cell">
                    <strong className="mono event-type-value">
                      {item.eventType}
                    </strong>
                    <small className="mono secondary-value" title={item.id}>
                      {compactIdentifier(item.id)}
                    </small>
                  </td>
                  <td>
                    <StatusPill status={item.status} />
                  </td>
                  <td>{item.attempts}</td>
                  <td>
                    {item.sent} / {item.failed}
                  </td>
                  <td className="push-error-cell">
                    {item.lastError ? (
                      <span className="field-error push-error-value">
                        <AlertTriangle size={14} />
                        {item.lastError}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <div className="card-header">
          <div>
            <h2>投递明细</h2>
            <p className="section-caption">
              安装实例、供应商、状态与脱敏失败原因
            </p>
          </div>
          <div className="release-management-tabs">
            <button
              type="button"
              className={status === "" ? "is-active" : ""}
              onClick={() => setStatus("")}
            >
              全部
            </button>
            <button
              type="button"
              className={status === "failed" ? "is-active" : ""}
              onClick={() => setStatus("failed")}
            >
              失败
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table push-deliveries-table">
            <thead>
              <tr>
                <th>安装实例</th>
                <th>供应商</th>
                <th>状态</th>
                <th>失败原因</th>
                <th>发送时间</th>
              </tr>
            </thead>
            <tbody>
              {(deliveries.data?.items ?? []).map((item) => (
                <tr
                  key={`${item.eventId}-${item.installationId}-${item.provider}`}
                >
                  <td
                    className="mono identifier-value"
                    title={item.installationId}
                  >
                    {compactIdentifier(item.installationId)}
                  </td>
                  <td>
                    <strong>{item.provider.toUpperCase()}</strong>
                  </td>
                  <td>
                    {item.status === "sent" ? (
                      <span className="inline-success">
                        <CheckCircle2 size={14} />
                        {statusLabel(item.status)}
                      </span>
                    ) : item.status === "failed" ? (
                      <span className="field-error">
                        <AlertTriangle size={14} />
                        {statusLabel(item.status)}
                      </span>
                    ) : (
                      <StatusPill status={item.status} />
                    )}
                  </td>
                  <td
                    className={item.failureCode ? "push-error-cell" : "muted"}
                  >
                    {item.failureCode ?? "-"}
                  </td>
                  <td>
                    {item.sentAt
                      ? new Date(item.sentAt).toLocaleString("zh-CN")
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
