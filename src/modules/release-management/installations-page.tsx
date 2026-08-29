import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, RefreshCw } from "lucide-react";
import { useState } from "react";
import { adminApi } from "../../core/api";
import {
  Button,
  Card,
  EmptyState,
  FeedbackNotice,
  SidePanel,
} from "../../design-system/components";
import type { AdminPageProps } from "../../plugin-system/types";

export function InstallationsPage({ tenantId }: AdminPageProps) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["installations", tenantId],
    queryFn: () => adminApi.installations(tenantId),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const revoke = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("请选择安装实例");
      return adminApi.revokeInstallation(tenantId, selected, reason.trim());
    },
    onSuccess: () => {
      setSelected(null);
      setReason("");
      setFeedback("安装实例已撤销，相关推送 Token 已失效。");
      void queryClient.invalidateQueries({
        queryKey: ["installations", tenantId],
      });
    },
    onError: (error) =>
      setFeedback(error instanceof Error ? error.message : "撤销失败"),
  });
  if (query.isLoading) return <EmptyState title="正在加载设备" />;
  if (query.isError)
    return (
      <div className="error-banner">
        无法加载设备列表：{query.error.message}
      </div>
    );
  const items = query.data?.items ?? [];
  return (
    <div className="installations-page">
      <FeedbackNotice
        kind={feedback ? "success" : "success"}
        message={feedback}
        placement="viewport"
        onDismiss={() => setFeedback("")}
      />
      <div className="page-heading">
        <div>
          <div className="eyebrow">Device management</div>
          <h1>设备管理</h1>
          <p>
            仅展示当前租户安装实例；设备归并标识、Token
            和安装凭证不会对租户展示。
          </p>
        </div>
        <Button variant="ghost" onClick={() => void query.refetch()}>
          <RefreshCw size={16} />
          刷新
        </Button>
      </div>
      <Card>
        <div className="card-header">
          <div>
            <h2>安装实例</h2>
            <p className="section-caption">
              共 {query.data?.total ?? 0} 个已上报实例
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>安装实例</th>
                <th>平台/版本</th>
                <th>Runtime / OTA</th>
                <th>语言/主题</th>
                <th>最近活跃</th>
                <th>状态</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.installationId}>
                  <td>
                    <strong className="mono">{item.installationId}</strong>
                    <small>{item.packageId}</small>
                  </td>
                  <td>
                    {item.platform}
                    <small>
                      {item.appVersion} · build {item.buildNumber}
                    </small>
                  </td>
                  <td>
                    <small>{item.runtimeVersion}</small>
                    <small>OTA {item.otaRevision ?? "-"}</small>
                  </td>
                  <td>
                    {item.locale}
                    <small>{item.theme}</small>
                  </td>
                  <td>
                    {new Date(item.lastActiveAt).toLocaleString("zh-CN")}
                    <small>{item.osVersion}</small>
                  </td>
                  <td>{item.status}</td>
                  <td>
                    <button
                      className="icon-button danger-icon"
                      title="撤销安装实例"
                      aria-label="撤销安装实例"
                      onClick={() => setSelected(item.installationId)}
                      disabled={item.status === "revoked"}
                    >
                      <Ban size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <SidePanel
        open={selected !== null}
        title="撤销安装实例"
        description="撤销后该安装实例不能继续心跳或注册推送 Token。"
        onClose={() => setSelected(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              disabled={reason.trim().length < 3 || revoke.isPending}
              onClick={() => revoke.mutate()}
            >
              <Ban size={16} />
              确认撤销
            </Button>
          </>
        }
      >
        <div className="form-field">
          <span>安装实例</span>
          <strong className="mono">{selected}</strong>
        </div>
        <label className="form-field">
          <span>撤销原因</span>
          <textarea
            className="input textarea"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="例如：设备长期异常刷接口"
          />
          <small>至少填写 3 个字符。</small>
        </label>
      </SidePanel>
    </div>
  );
}
