import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CloudCog, Save, Wifi } from "lucide-react";
import { adminApi, type ReleaseStorage } from "../../core/api";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  SelectField,
  StatusPill,
} from "../../design-system/components";
import type { AdminPageProps } from "../../plugin-system/types";

type Draft = ReleaseStorage & {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  reason: string;
};

export function DistributionSettingsPage({ tenantId }: AdminPageProps) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["release-storage", tenantId],
    queryFn: () => adminApi.releaseStorage(tenantId),
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: (value: Draft) =>
      adminApi.saveReleaseStorage(tenantId, {
        provider: value.provider,
        endpoint: value.endpoint ?? "",
        region: value.region,
        bucket: value.bucket,
        objectPrefix: value.objectPrefix,
        publicBaseUrl: value.publicBaseUrl ?? "",
        forcePathStyle: value.forcePathStyle,
        accessKeyId: value.accessKeyId,
        secretAccessKey: value.secretAccessKey,
        sessionToken: value.sessionToken,
        expectedVersion: value.version,
        reason: value.reason,
        confirm: true,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["release-storage", tenantId], saved);
      setDraft(null);
      setConfirmOpen(false);
    },
    onError: () => setConfirmOpen(false),
  });
  const testMutation = useMutation({
    mutationFn: () => adminApi.testReleaseStorage(tenantId),
  });
  if (query.isLoading) return <EmptyState title="正在加载对象存储配置" />;
  if (query.isError)
    return (
      <div className="error-banner">
        无法连接 RN-Server：{query.error.message}
      </div>
    );
  const data = query.data;
  if (!data) return <EmptyState title="没有对象存储配置" />;
  const current: Draft = draft ?? {
    ...data,
    provider: data.provider ?? "s3",
    accessKeyId: "",
    secretAccessKey: "",
    sessionToken: "",
    reason: "",
  };
  const editing = draft !== null;
  const update = (next: Partial<Draft>) => setDraft({ ...current, ...next });
  const save = () => {
    if (
      !current.bucket.trim() ||
      !current.region.trim() ||
      current.reason.trim().length < 3
    )
      return;
    setConfirmOpen(true);
  };
  const confirmSave = () => mutation.mutate(current);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Release storage</div>
          <h1>发布存储</h1>
          <p>每个租户独立维护 APK/iOS/HarmonyOS 安装包的对象存储配置。</p>
        </div>
        <div className="heading-actions">
          <StatusPill status={data.configured ? "configured" : "required"} />
          {editing ? (
            <>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                取消
              </Button>
              <Button onClick={save} disabled={mutation.isPending}>
                <Save size={16} />
                保存配置
              </Button>
            </>
          ) : (
            <Button onClick={() => setDraft({ ...current })}>
              <CloudCog size={16} />
              编辑配置
            </Button>
          )}
        </div>
      </div>
      {mutation.isError && (
        <div className="error-banner">保存失败：{mutation.error.message}</div>
      )}
      {testMutation.isSuccess && (
        <div className="success-banner">
          <CheckCircle2 size={16} />
          连接测试成功：{testMutation.data.bucket}
        </div>
      )}
      <Card>
        <div className="card-header">
          <div>
            <h2>对象存储连接</h2>
            <p className="section-caption">
              上传链接由服务端生成，客户端不会接触存储密钥。
            </p>
          </div>
          {!editing && (
            <Button
              variant="ghost"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
            >
              <Wifi size={15} />
              测试连接
            </Button>
          )}
        </div>
        <div className="card-body form-grid form-grid-3">
          <Field label="提供商">
            <SelectField
              disabled={!editing}
              value={current.provider ?? "s3"}
              onChange={(e) =>
                update({ provider: e.target.value as Draft["provider"] })
              }
            >
              <option value="s3">Amazon S3</option>
              <option value="r2">Cloudflare R2</option>
              <option value="minio">MinIO</option>
            </SelectField>
          </Field>
          <Field label="区域">
            <input
              className="input"
              disabled={!editing}
              value={current.region}
              onChange={(e) => update({ region: e.target.value })}
            />
          </Field>
          <Field label="Bucket">
            <input
              className="input"
              disabled={!editing}
              value={current.bucket}
              onChange={(e) => update({ bucket: e.target.value })}
            />
          </Field>
          <Field label="Endpoint（可选）">
            <input
              className="input"
              disabled={!editing}
              placeholder="https://..."
              value={current.endpoint ?? ""}
              onChange={(e) => update({ endpoint: e.target.value || null })}
            />
          </Field>
          <Field label="对象前缀">
            <input
              className="input"
              disabled={!editing}
              value={current.objectPrefix}
              onChange={(e) => update({ objectPrefix: e.target.value })}
            />
          </Field>
          <Field label="官网公共地址（可选）">
            <input
              className="input"
              disabled={!editing}
              placeholder="https://download.example.com"
              value={current.publicBaseUrl ?? ""}
              onChange={(e) =>
                update({ publicBaseUrl: e.target.value || null })
              }
            />
          </Field>
          <label className="switch-row">
            <input
              type="checkbox"
              disabled={!editing}
              checked={current.forcePathStyle}
              onChange={(e) => update({ forcePathStyle: e.target.checked })}
            />
            <span>使用 Path Style（MinIO 常用）</span>
          </label>
        </div>
      </Card>
      {editing && (
        <Card>
          <div className="card-header">
            <div>
              <h2>访问凭证</h2>
              <p className="section-caption">
                留空表示沿用已有密钥；输入后服务端加密写入 MySQL。
              </p>
            </div>
          </div>
          <div className="card-body form-grid form-grid-3">
            <Field label="Access Key ID">
              <input
                className="input"
                value={current.accessKeyId}
                onChange={(e) => update({ accessKeyId: e.target.value })}
              />
            </Field>
            <Field label="Secret Access Key">
              <input
                className="input"
                type="password"
                value={current.secretAccessKey}
                onChange={(e) => update({ secretAccessKey: e.target.value })}
              />
            </Field>
            <Field label="Session Token（可选）">
              <input
                className="input"
                type="password"
                value={current.sessionToken}
                onChange={(e) => update({ sessionToken: e.target.value })}
              />
            </Field>
            <Field label="变更原因">
              <input
                className="input"
                value={current.reason}
                onChange={(e) => update({ reason: e.target.value })}
                placeholder="例如：切换到租户专属 R2 bucket"
              />
            </Field>
          </div>
        </Card>
      )}
      <Card>
        <div className="card-body config-meta">
          <span>
            凭证状态：
            {data.credentialsConfigured
              ? `已配置（${data.accessKeyHint ?? "已加密"}）`
              : "未配置，使用运行环境身份"}
          </span>
          <span>数据库版本：v{data.version}</span>
          <span>最近修改：{data.updatedBy || "-"}</span>
        </div>
      </Card>
      <ConfirmDialog
        open={confirmOpen}
        title="保存发布存储配置？"
        description="正在修改当前租户的对象存储连接。保存后服务端会加密凭证，并建议重新测试连接。"
        confirmLabel="确认保存"
        tone="danger"
        loading={mutation.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmSave}
      >
        <div className="dialog-detail-list">
          <span>Bucket：{current.bucket || "未填写"}</span>
          <span>区域：{current.region || "未填写"}</span>
          <span>凭证不会在管理端回显</span>
        </div>
      </ConfirmDialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
