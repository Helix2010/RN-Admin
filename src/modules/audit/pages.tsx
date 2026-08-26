import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { adminApi } from "../../core/api";
import { Card, EmptyState, StatusPill } from "../../design-system/components";
import type { AdminPageProps } from "../../plugin-system/types";

export function AuditPage({ tenantId }: AdminPageProps) {
  const query = useQuery({
    queryKey: ["audits", tenantId],
    queryFn: () => adminApi.audits(tenantId),
  });
  if (query.isLoading) return <EmptyState title="正在加载审计日志" />;
  if (query.isError)
    return (
      <div className="error-banner">
        无法连接 RN-Server：{query.error.message}
      </div>
    );
  const items = query.data?.items ?? [];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Audit trail</div>
          <h1>审计日志</h1>
          <p>发布、暂停等高风险动作的不可变记录。</p>
        </div>
        <ScrollText color="#74a7ff" />
      </div>
      <Card className="table-wrap">
        {items.length === 0 ? (
          <EmptyState
            title="暂无审计事件"
            detail="执行一次发布状态动作后会显示在这里"
          />
        ) : (
          <div className="audit-list" style={{ padding: "6px 22px" }}>
            {items.map((item) => (
              <div className="audit-item" key={item.id}>
                <div className="audit-dot" />
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                    }}
                  >
                    <strong>
                      {item.action} · {item.targetId}
                    </strong>
                    <span className="muted">
                      {new Date(item.createdAt).toLocaleString("zh-CN")}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, marginTop: 5 }}>
                    {item.reason} · actor {item.actorId} · request{" "}
                    {item.requestId}
                  </p>
                </div>
                <StatusPill status="recorded" />
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
