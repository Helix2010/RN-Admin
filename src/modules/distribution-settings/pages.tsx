import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Box,
  CheckCircle2,
  CloudCog,
  DatabaseZap,
  KeyRound,
  Plus,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import { adminApi, type StorageConfig } from "../../core/api";
import {
  Button,
  Card,
  EmptyState,
  StatusPill,
} from "../../design-system/components";
import type { AdminPageProps } from "../../plugin-system/types";

type StorageDraft = {
  provider: "s3" | "r2" | "minio";
  endpoint: string;
  region: string;
  bucket: string;
  objectPrefix: string;
  forcePathStyle: boolean;
  publicBaseUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  reason: string;
};

const emptyStorage: StorageDraft = {
  provider: "s3",
  endpoint: "",
  region: "us-east-1",
  bucket: "",
  objectPrefix: "rn-releases",
  forcePathStyle: false,
  publicBaseUrl: "",
  accessKeyId: "",
  secretAccessKey: "",
  sessionToken: "",
  reason: "",
};

export function DistributionSettingsPage({
  tenantId,
  tenantName,
}: AdminPageProps) {
  const queryClient = useQueryClient();
  const storageQuery = useQuery({
    queryKey: ["storage-config", tenantId],
    queryFn: () => adminApi.storageConfig(tenantId),
  });
  const applicationsQuery = useQuery({
    queryKey: ["applications", tenantId],
    queryFn: () => adminApi.applications(tenantId),
  });
  const artifactsQuery = useQuery({
    queryKey: ["artifacts", tenantId],
    queryFn: () => adminApi.artifacts(tenantId),
  });
  const [storage, setStorage] = useState<StorageDraft>(emptyStorage);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!storageQuery.data) return;
    setStorage(fromStorageConfig(storageQuery.data));
  }, [tenantId, storageQuery.data]);

  const saveStorage = useMutation({
    mutationFn: () => {
      if (storage.reason.trim().length < 3) {
        throw new Error("请填写至少 3 个字符的修改原因");
      }
      if (
        !window.confirm("确认保存新的对象存储配置版本？密钥不会返回浏览器。")
      ) {
        throw new Error("已取消保存");
      }
      return adminApi.saveStorageConfig(tenantId, {
        ...storage,
        expectedVersion: storageQuery.data?.version ?? 0,
        confirm: true,
      });
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["storage-config", tenantId], saved);
      setStorage(fromStorageConfig(saved));
      setFeedback(`对象存储配置 v${saved.version} 已加密保存。`);
      void queryClient.invalidateQueries({ queryKey: ["audits", tenantId] });
    },
  });
  const testStorage = useMutation({
    mutationFn: () => adminApi.testStorageConfig(tenantId),
    onSuccess: (result) =>
      setFeedback(`连接成功：${result.provider} / ${result.bucket}`),
  });

  if (storageQuery.isLoading || applicationsQuery.isLoading) {
    return <EmptyState title="正在加载租户分发配置" />;
  }
  if (storageQuery.isError || applicationsQuery.isError) {
    const error = storageQuery.error ?? applicationsQuery.error;
    return <div className="error-banner">加载失败：{error?.message}</div>;
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Advanced settings</div>
          <h1>高级设置</h1>
          <p>
            当前项目：{tenantName}
            。日常发布无需操作这些配置；首次接入或更换存储时再维护。
          </p>
        </div>
        <StatusPill
          status={storageQuery.data?.configured ? "configured" : "required"}
        />
      </div>

      {(feedback || saveStorage.isError || testStorage.isError) && (
        <div
          className={
            saveStorage.isError || testStorage.isError
              ? "error-banner"
              : "success-banner"
          }
        >
          {saveStorage.error?.message ?? testStorage.error?.message ?? feedback}
        </div>
      )}

      <div className="distribution-grid">
        <Card>
          <div className="card-header">
            <div>
              <h2>S3 兼容对象存储</h2>
              <p className="section-caption">
                AWS S3、Cloudflare R2 与 MinIO；每次保存产生不可变配置版本
              </p>
            </div>
            <CloudCog size={20} />
          </div>
          <div className="card-body storage-form">
            <div className="form-grid form-grid-3">
              <Field label="服务商">
                <select
                  className="select"
                  value={storage.provider}
                  onChange={(event) =>
                    setStorage({
                      ...storage,
                      provider: event.target.value as StorageDraft["provider"],
                    })
                  }
                >
                  <option value="s3">AWS S3</option>
                  <option value="r2">Cloudflare R2</option>
                  <option value="minio">MinIO / S3 compatible</option>
                </select>
              </Field>
              <Field label="Region">
                <input
                  className="input"
                  value={storage.region}
                  onChange={(event) =>
                    setStorage({ ...storage, region: event.target.value })
                  }
                />
              </Field>
              <Field label="Bucket">
                <input
                  className="input"
                  value={storage.bucket}
                  onChange={(event) =>
                    setStorage({ ...storage, bucket: event.target.value })
                  }
                />
              </Field>
            </div>
            <div className="form-grid form-grid-2">
              <Field
                label="Endpoint"
                hint="R2/MinIO 必填；AWS S3 可留空使用默认 endpoint"
              >
                <input
                  className="input"
                  type="url"
                  placeholder="https://<account>.r2.cloudflarestorage.com"
                  value={storage.endpoint}
                  onChange={(event) =>
                    setStorage({ ...storage, endpoint: event.target.value })
                  }
                />
              </Field>
              <Field label="对象前缀" hint="最终 key 仍会自动加入 tenants/<id>">
                <input
                  className="input"
                  value={storage.objectPrefix}
                  onChange={(event) =>
                    setStorage({ ...storage, objectPrefix: event.target.value })
                  }
                />
              </Field>
            </div>
            <Field
              label="公开 CDN Base URL"
              hint="可留空；留空时下载接口签发短时 S3 URL"
            >
              <input
                className="input"
                type="url"
                placeholder="https://downloads.example.com"
                value={storage.publicBaseUrl}
                onChange={(event) =>
                  setStorage({ ...storage, publicBaseUrl: event.target.value })
                }
              />
            </Field>
            <div className="credential-panel">
              <div className="credential-title">
                <KeyRound size={17} />
                <strong>访问凭证</strong>
                {storageQuery.data?.credentialsConfigured && (
                  <span>
                    已配置 {storageQuery.data.accessKeyHint ?? "加密密钥"}
                  </span>
                )}
              </div>
              <p>
                留空表示保留已有凭证；Access Key 与 Secret Key
                必须同时替换。保存后不会回显。
              </p>
              <div className="form-grid form-grid-3">
                <Field label="Access Key ID">
                  <input
                    className="input"
                    autoComplete="off"
                    value={storage.accessKeyId}
                    onChange={(event) =>
                      setStorage({
                        ...storage,
                        accessKeyId: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Secret Access Key">
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={storage.secretAccessKey}
                    onChange={(event) =>
                      setStorage({
                        ...storage,
                        secretAccessKey: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Session Token（可选）">
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={storage.sessionToken}
                    onChange={(event) =>
                      setStorage({
                        ...storage,
                        sessionToken: event.target.value,
                      })
                    }
                  />
                </Field>
              </div>
            </div>
            <label className="switch-row compact-switch">
              <input
                type="checkbox"
                checked={storage.forcePathStyle}
                onChange={(event) =>
                  setStorage({
                    ...storage,
                    forcePathStyle: event.target.checked,
                  })
                }
              />
              <span>使用 path-style URL（MinIO 常用）</span>
            </label>
            <Field label="修改原因">
              <textarea
                className="input textarea"
                placeholder="例如：为当前租户接入 Cloudflare R2 生产 Bucket"
                value={storage.reason}
                onChange={(event) =>
                  setStorage({ ...storage, reason: event.target.value })
                }
              />
            </Field>
            <div className="heading-actions">
              <Button
                variant="ghost"
                disabled={
                  !storageQuery.data?.configured || testStorage.isPending
                }
                onClick={() => testStorage.mutate()}
              >
                <DatabaseZap size={16} />
                {testStorage.isPending ? "正在测试…" : "测试连接"}
              </Button>
              <Button
                disabled={saveStorage.isPending}
                onClick={() => saveStorage.mutate()}
              >
                <ShieldCheck size={16} />
                {saveStorage.isPending ? "正在加密保存…" : "保存新配置版本"}
              </Button>
            </div>
          </div>
        </Card>

        <details className="advanced-settings-section">
          <summary>应用身份与项目管理</summary>
          <div className="distribution-side">
            <ApplicationPanel
              tenantId={tenantId}
              items={applicationsQuery.data?.items ?? []}
            />
            <TenantCreatePanel />
          </div>
        </details>
      </div>

      <details className="advanced-settings-section">
        <summary>安装包校验记录</summary>
        <Card className="table-wrap artifact-table">
          <div className="card-header">
            <div>
              <h2>安装包校验记录</h2>
              <p className="section-caption">
                服务端自动计算 SHA-256，并验证 package、版本、minSdk 与签名证书
              </p>
            </div>
            <Box size={19} />
          </div>
          {(artifactsQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              title="还没有安装包记录"
              detail="可从发布管理上传首个 APK"
            />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>文件</th>
                  <th>应用身份</th>
                  <th>版本</th>
                  <th>SHA-256 / 签名</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {artifactsQuery.data?.items.map((artifact) => (
                  <tr key={artifact.id}>
                    <td>
                      <strong>{artifact.fileName}</strong>
                      <div className="muted mono">
                        {formatBytes(artifact.size ?? artifact.expectedSize)}
                      </div>
                    </td>
                    <td>
                      {artifact.packageName ?? artifact.applicationId}
                      <div className="muted">
                        minSdk {artifact.minSdk ?? "-"}
                      </div>
                    </td>
                    <td>
                      {artifact.versionName ?? "-"}
                      <div className="muted mono">
                        build {artifact.versionCode ?? "-"}
                      </div>
                    </td>
                    <td className="mono artifact-digest">
                      {shortDigest(artifact.sha256)}
                      <div className="muted">
                        cert {shortDigest(artifact.signerSha256)}
                      </div>
                    </td>
                    <td>
                      <StatusPill status={artifact.status} />
                      {artifact.rejectionReason && (
                        <div className="error-text">
                          {artifact.rejectionReason}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </details>
    </>
  );
}

function ApplicationPanel({
  tenantId,
  items,
}: {
  tenantId: string;
  items: Awaited<ReturnType<typeof adminApi.applications>>["items"];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    id: "dex-mobile",
    name: "DEX Mobile",
    packageName: "com.example.rnfoundation",
    expectedSignerSha256: "",
    reason: "",
  });
  const mutation = useMutation({
    mutationFn: () => {
      const { id, ...editable } = form;
      return items.some((item) => item.id === id)
        ? adminApi.updateApplication(tenantId, id, {
            ...editable,
            confirm: true,
          })
        : adminApi.createApplication(tenantId, {
            id,
            ...editable,
            confirm: true,
          });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["applications", tenantId],
      });
      setForm({ ...form, expectedSignerSha256: "", reason: "" });
    },
  });
  return (
    <Card>
      <div className="card-header">
        <div>
          <h2>Android 应用身份</h2>
          <p className="section-caption">
            通常只需配置一次，用于阻止错误或伪造 APK
          </p>
        </div>
        <ServerCog size={19} />
      </div>
      <div className="card-body compact-form">
        {items.map((application) => (
          <div className="application-row" key={application.id}>
            <CheckCircle2 size={17} />
            <div>
              <strong>{application.name}</strong>
              <p>{application.packageName}</p>
              <span className="mono">
                cert {shortDigest(application.expectedSignerSha256)}
              </span>
            </div>
          </div>
        ))}
        <div className="form-grid form-grid-2">
          <Field label="应用 ID">
            <input
              className="input"
              value={form.id}
              onChange={(event) => setForm({ ...form, id: event.target.value })}
            />
          </Field>
          <Field label="显示名称">
            <input
              className="input"
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </Field>
        </div>
        <Field label="Android packageName">
          <input
            className="input"
            value={form.packageName}
            onChange={(event) =>
              setForm({ ...form, packageName: event.target.value })
            }
          />
        </Field>
        <Field
          label="签名证书 SHA-256"
          hint="64 位十六进制，可从 apksigner verify --print-certs 获取"
        >
          <input
            className="input mono"
            value={form.expectedSignerSha256}
            onChange={(event) =>
              setForm({ ...form, expectedSignerSha256: event.target.value })
            }
          />
        </Field>
        <Field label="创建原因">
          <input
            className="input"
            value={form.reason}
            onChange={(event) =>
              setForm({ ...form, reason: event.target.value })
            }
          />
        </Field>
        <Button
          disabled={mutation.isPending || form.reason.trim().length < 3}
          onClick={() => mutation.mutate()}
        >
          <Plus size={16} />
          {items.some((item) => item.id === form.id)
            ? "更新应用身份"
            : "创建应用身份"}
        </Button>
        {mutation.isError && (
          <div className="error-text">{mutation.error.message}</div>
        )}
      </div>
    </Card>
  );
}

function TenantCreatePanel() {
  const [form, setForm] = useState({ slug: "", name: "", reason: "" });
  const mutation = useMutation({
    mutationFn: () => adminApi.createTenant({ ...form, confirm: true }),
    onSuccess: () => {
      window.dispatchEvent(new Event("rn-admin:tenants-changed"));
      setForm({ slug: "", name: "", reason: "" });
    },
  });
  return (
    <Card>
      <div className="card-header">
        <div>
          <h2>新增独立项目</h2>
          <p className="section-caption">仅在管理第二个品牌或客户项目时使用</p>
        </div>
        <Plus size={19} />
      </div>
      <div className="card-body compact-form">
        <div className="form-grid form-grid-2">
          <Field label="Slug">
            <input
              className="input"
              placeholder="project-a"
              value={form.slug}
              onChange={(event) =>
                setForm({ ...form, slug: event.target.value })
              }
            />
          </Field>
          <Field label="项目名称">
            <input
              className="input"
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </Field>
        </div>
        <Field label="创建原因">
          <input
            className="input"
            value={form.reason}
            onChange={(event) =>
              setForm({ ...form, reason: event.target.value })
            }
          />
        </Field>
        <Button
          variant="ghost"
          disabled={mutation.isPending || form.reason.trim().length < 3}
          onClick={() => mutation.mutate()}
        >
          创建独立项目
        </Button>
        {mutation.isError && (
          <div className="error-text">{mutation.error.message}</div>
        )}
      </div>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function fromStorageConfig(config: StorageConfig): StorageDraft {
  return {
    provider: config.provider ?? "s3",
    endpoint: config.endpoint ?? "",
    region: config.region ?? "us-east-1",
    bucket: config.bucket ?? "",
    objectPrefix: config.objectPrefix ?? "rn-releases",
    forcePathStyle: config.forcePathStyle ?? false,
    publicBaseUrl: config.publicBaseUrl ?? "",
    accessKeyId: "",
    secretAccessKey: "",
    sessionToken: "",
    reason: "",
  };
}

function shortDigest(value: string | null): string {
  if (!value) return "-";
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function formatBytes(value: number): string {
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
