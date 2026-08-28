import { z } from "zod";

const releaseSchema = z.object({
  id: z.string(),
  platform: z.enum(["android", "ios", "harmony"]),
  version: z.string(),
  buildNumber: z.number(),
  runtimeVersion: z.string(),
  status: z.string(),
  releaseNotes: z.record(z.string(), z.array(z.string())),
  fileName: z.string().nullable().optional(),
  contentType: z.string().nullable().optional(),
  expectedSize: z.number().nullable().optional(),
  fileSize: z.number().nullable().optional(),
  sha256: z.string().nullable().optional(),
  // Older rejected/uploaded rows may have a SQL NULL metadata value. Treat it
  // as absent at the API boundary so one legacy row cannot invalidate the list.
  fileMetadata: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((value) => value ?? undefined),
  rejectionReason: z.string().nullable().optional(),
  verifiedAt: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastAction: z.string().nullable(),
});
export type Release = z.infer<typeof releaseSchema>;
const otaBaseReleaseSchema = z.object({
  id: z.string(),
  version: z.string(),
  buildNumber: z.number(),
  platform: z.enum(["android", "ios", "harmony"]),
  runtimeVersion: z.string(),
  status: z.string(),
});
const otaReleaseSchema = z.object({
  id: z.string(),
  baseReleaseId: z.string(),
  baseVersion: z.string().optional(),
  baseBuildNumber: z.number().optional(),
  baseRelease: otaBaseReleaseSchema.optional(),
  platform: z.enum(["android", "ios"]),
  channel: z.string(),
  runtimeVersion: z.string(),
  revision: z.number().int().positive(),
  updateId: z.string(),
  releaseKind: z.enum(["update", "rollback"]).optional(),
  status: z.enum([
    "draft",
    "verified",
    "active",
    "paused",
    "superseded",
    "rejected",
  ]),
  releaseNotes: z.record(z.string(), z.array(z.string())),
  sourceCommitSha: z.string().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  verifiedAt: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OtaRelease = z.infer<typeof otaReleaseSchema>;
const otaListSchema = z.object({
  items: z.array(otaReleaseSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
const listSchema = z.object({
  items: z.array(releaseSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
const overviewSchema = z.object({
  generatedAt: z.string(),
  current: z.object({
    android: releaseSchema.nullable(),
    ios: releaseSchema.nullable(),
    harmony: releaseSchema.nullable(),
  }),
  counts: z.record(z.string(), z.number()),
  signals: z.object({
    crashFreeSessions: z.number().nullable(),
    updateSuccessRate: z.number().nullable(),
    note: z.string(),
  }),
});
export type Overview = z.infer<typeof overviewSchema>;
const paletteSchema = z.object({
  primary: z.string().min(1),
  onPrimary: z.string().min(1),
  background: z.string().min(1),
  surface: z.string().min(1),
  surfaceVariant: z.string().min(1),
  text: z.string().min(1),
  textMuted: z.string().min(1),
  border: z.string().min(1),
  success: z.string().min(1),
  warning: z.string().min(1),
  danger: z.string().min(1),
  info: z.string().min(1),
  pricePositive: z.string().min(1),
  priceNegative: z.string().min(1),
  risk: z.string().min(1),
  focus: z.string().min(1),
  backdrop: z.string().min(1),
});

export const managedAppConfigSchema = z.object({
  configVersion: z.string().trim().min(1),
  ttlSeconds: z.number().int().min(30).max(86400),
  localization: z.object({
    fallbackLocale: z.enum(["zh-CN", "en-US"]),
    supportedLocales: z.array(z.enum(["zh-CN", "en-US"])),
    messagesVersion: z.string().trim().min(1),
    messages: z.object({
      "zh-CN": z.record(z.string().min(1), z.string().min(1)),
      "en-US": z.record(z.string().min(1), z.string().min(1)),
    }),
  }),
  theme: z.object({
    defaultMode: z.literal("system"),
    allowUserOverride: z.boolean(),
    paletteVersion: z.string().trim().min(1),
    light: paletteSchema,
    dark: paletteSchema,
  }),
  features: z.object({
    updateCenter: z.boolean(),
    otaEnabled: z.boolean(),
    directUpdateEnabled: z.boolean(),
    diagnosticsEnabled: z.boolean(),
  }),
  updatePolicy: z.object({
    minSupportedVersion: z.string().trim().min(1),
    latestVersion: z.string().trim().min(1),
    otaChannel: z.string().trim().min(1),
  }),
  support: z.object({ statusPageUrl: z.url() }),
});
export type ManagedAppConfig = z.infer<typeof managedAppConfigSchema>;

const languageResourceSchema = z.object({
  version: z.string(),
  objectKey: z.string(),
  fileUrl: z.string(),
  sha256: z.string(),
  size: z.number(),
  publishedAt: z.string(),
});
const languageSettingsSchema = z.object({
  schemaVersion: z.number(),
  fallbackLanguage: z.string(),
  refreshIntervalSeconds: z.number(),
  languages: z.record(
    z.string(),
    z.object({
      label: z.string(),
      nativeName: z.string(),
      enabled: z.boolean(),
      direction: z.enum(["ltr", "rtl"]),
      sort: z.number(),
      source: z.enum(["global", "tenant"]),
      publishStatus: z.string(),
      resource: languageResourceSchema.nullable().optional(),
    }),
  ),
});
const localizationDocumentSchema = z.object({
  key: z.string(),
  meta: z.string(),
  enabled: z.boolean().default(true),
  values: z.record(
    z.string(),
    z.object({
      content: z.string(),
      source: z.string(),
      missing: z.boolean(),
    }),
  ),
});
const localizationViewSchema = z.object({
  settings: languageSettingsSchema,
  documents: z.object({
    items: z.array(localizationDocumentSchema),
    total: z.number(),
  }),
  metadata: z.object({
    globalVersion: z.number(),
    tenantVersion: z.number(),
    inherited: z.boolean(),
    updatedBy: z.string(),
    updatedAt: z.string().nullable(),
  }),
});
export type LocalizationView = z.infer<typeof localizationViewSchema>;

const configSummarySchema = z.object({
  configVersion: z.string(),
  localization: z.object({
    supportedLocales: z.array(z.string()),
    messagesVersion: z.string(),
  }),
  theme: z.object({ paletteVersion: z.string(), modes: z.array(z.string()) }),
  featureFlags: z.array(z.string()),
  updatePolicy: z.object({ source: z.string(), approvalRequired: z.boolean() }),
});
const configViewSchema = z.object({
  summary: configSummarySchema,
  config: managedAppConfigSchema,
  metadata: z.object({
    databaseVersion: z.number().int().positive(),
    updatedBy: z.string(),
    updatedAt: z.string(),
  }),
});
export type AppConfig = z.infer<typeof configViewSchema>;
const configSaveSchema = configViewSchema.extend({
  status: z.literal("active"),
  savedAt: z.string(),
  actorId: z.string(),
  requestId: z.string(),
});
const jsonValueSchema: z.ZodType<
  string | number | boolean | null | Record<string, unknown> | unknown[]
> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);
const auditSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  reason: z.string(),
  requestId: z.string(),
  createdAt: z.string(),
  summary: z.record(z.string(), jsonValueSchema),
  tenantId: z.string(),
});
export type AuditEvent = z.infer<typeof auditSchema>;

export function parseAuditEvent(value: unknown): AuditEvent {
  return auditSchema.parse(value);
}

const env = import.meta.env as Record<string, string | undefined>;
const baseUrl = (env.VITE_API_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const sessionSchema = z.object({
  authenticated: z.literal(true),
  actorId: z.string(),
  expiresAt: z.string().nullable(),
  method: z.enum(["session", "api-key"]),
});
export type AdminSession = z.infer<typeof sessionSchema>;

const tenantSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: z.enum(["active", "disabled"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Tenant = z.infer<typeof tenantSchema>;

export const releaseStorageSchema = z.object({
  configured: z.boolean(),
  version: z.number().int().nonnegative(),
  provider: z.enum(["s3", "r2", "minio"]).nullable(),
  endpoint: z.string().nullable(),
  region: z.string(),
  bucket: z.string(),
  objectPrefix: z.string(),
  publicBaseUrl: z.string().nullable(),
  forcePathStyle: z.boolean(),
  accessKeyHint: z.string().nullable(),
  credentialsConfigured: z.boolean(),
  sessionTokenConfigured: z.boolean(),
  inherited: z.boolean(),
  updatedBy: z.string(),
  updatedAt: z.string().nullable(),
});
export type ReleaseStorage = z.infer<typeof releaseStorageSchema>;

const uploadSchema = z.object({
  method: z.literal("PUT"),
  url: z.string(),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.string(),
  requiresCredentials: z.boolean().default(false),
});

const releaseArtifactUploadSchema = z.object({
  artifact: z.object({
    id: z.string(),
    token: z.string(),
    fileName: z.string(),
    contentType: z.string(),
    size: z.number(),
    objectKey: z.string(),
    expiresAt: z.string(),
  }),
  upload: uploadSchema,
});

const otaArtifactUploadSchema = z.object({
  artifact: z.object({
    id: z.string(),
    token: z.string(),
    fileName: z.string(),
    contentType: z.string(),
    size: z.number(),
    objectKey: z.string(),
    expiresAt: z.string(),
  }),
  upload: uploadSchema,
});

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    if (response.status === 401 && path !== "/v1/admin/auth/login") {
      window.dispatchEvent(new Event("rn-admin:unauthorized"));
    }
    const problem = (await response.json().catch(() => null)) as {
      title?: string;
      detail?: string;
      message?: string;
    } | null;
    throw new ApiError(
      problem?.detail ??
        problem?.message ??
        problem?.title ??
        `管理接口请求失败 (${response.status})`,
      response.status,
    );
  }
  return schema.parse(await response.json());
}

export const authApi = {
  session: () => request("/v1/admin/auth/session", sessionSchema),
  login: (username: string, password: string) =>
    request("/v1/admin/auth/login", sessionSchema, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () =>
    request(
      "/v1/admin/auth/logout",
      z.object({ authenticated: z.literal(false) }),
      { method: "POST" },
    ),
};

export const adminApi = {
  currentTenant: () =>
    request("/v1/admin/tenant", z.object({ tenant: tenantSchema })),
  overview: (tenantId: string) => {
    void tenantId;
    return request("/v1/admin/overview", overviewSchema);
  },
  releases: (tenantId: string) => {
    void tenantId;
    return request("/v1/admin/releases", listSchema);
  },
  otaReleases: (tenantId: string) => {
    void tenantId;
    return request("/v1/admin/ota/releases", otaListSchema);
  },
  otaBaseReleases: (tenantId: string, platform: "android" | "ios") => {
    void tenantId;
    return request(
      `/v1/admin/ota/base-releases?platform=${encodeURIComponent(platform)}`,
      z.object({ items: z.array(otaBaseReleaseSchema) }),
    );
  },
  createOtaArtifactUpload: (tenantId: string, payload: unknown) => {
    void tenantId;
    return request("/v1/admin/ota/artifacts/uploads", otaArtifactUploadSchema, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  deleteOtaArtifact: (tenantId: string, token: string) => {
    void tenantId;
    return request(
      `/v1/admin/ota/artifacts/upload?token=${encodeURIComponent(token)}`,
      z.object({ deleted: z.literal(true) }),
      { method: "DELETE", headers: { "x-ota-artifact-token": token } },
    );
  },
  createOtaRelease: (tenantId: string, payload: unknown) => {
    void tenantId;
    return request(
      "/v1/admin/ota/releases",
      z.object({ release: otaReleaseSchema }),
      { method: "POST", body: JSON.stringify(payload) },
    );
  },
  otaAction: (
    tenantId: string,
    id: string,
    action: "publish" | "pause",
    reason: string,
  ) => {
    void tenantId;
    return request(
      `/v1/admin/ota/releases/${encodeURIComponent(id)}/${action}`,
      z.union([
        z.object({ release: otaReleaseSchema }),
        z.object({ id: z.string(), status: z.string() }),
      ]),
      { method: "POST", body: JSON.stringify({ reason, confirm: true }) },
    );
  },
  createReleaseArtifactUpload: (tenantId: string, payload: unknown) => {
    void tenantId;
    return request(
      "/v1/admin/release-artifacts/uploads",
      releaseArtifactUploadSchema,
      { method: "POST", body: JSON.stringify(payload) },
    );
  },
  createReleaseFromArtifact: (tenantId: string, payload: unknown) => {
    void tenantId;
    return request("/v1/admin/releases", z.object({ release: releaseSchema }), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  deleteReleaseArtifact: (tenantId: string, token: string) => {
    void tenantId;
    return request(
      `/v1/admin/release-artifacts/upload?token=${encodeURIComponent(token)}`,
      z.object({ deleted: z.literal(true) }),
      { method: "DELETE", headers: { "x-release-artifact-token": token } },
    );
  },
  config: (tenantId: string) => {
    void tenantId;
    return request("/v1/admin/app-config", configViewSchema);
  },
  saveConfig: (
    tenantId: string,
    config: ManagedAppConfig,
    expectedVersion: number,
    reason: string,
  ) => {
    void tenantId;
    return request("/v1/admin/app-config", configSaveSchema, {
      method: "PATCH",
      body: JSON.stringify({
        config,
        expectedVersion,
        reason,
        confirm: true,
      }),
    });
  },
  localization: () => request("/v1/admin/localization", localizationViewSchema),
  saveLocalizationLanguages: (
    settings: Pick<
      LocalizationView["settings"],
      "fallbackLanguage" | "refreshIntervalSeconds" | "languages"
    >,
    expectedVersion: number,
    reason: string,
  ) => {
    const languages = Object.fromEntries(
      Object.entries(settings.languages).map(([code, value]) => [
        code,
        {
          label: value.label,
          nativeName: value.nativeName,
          enabled: value.enabled,
          direction: value.direction,
          sort: value.sort,
        },
      ]),
    );
    return request("/v1/admin/localization/languages", localizationViewSchema, {
      method: "PUT",
      body: JSON.stringify({
        settings: { ...settings, languages },
        expectedVersion,
        reason,
      }),
    });
  },
  saveLocalizationDocuments: (
    documents: Array<{
      key: string;
      meta: string;
      enabled?: boolean;
      create?: boolean;
      values: Record<string, string | null>;
    }>,
    reason: string,
  ) =>
    request("/v1/admin/localization/documents", localizationViewSchema, {
      method: "PUT",
      body: JSON.stringify({ documents, reason }),
    }),
  publishLocalization: (languages: string[], reason: string) =>
    request(
      "/v1/admin/localization/publish",
      z.object({
        version: z.string(),
        languages: z.array(z.string()),
        localization: localizationViewSchema,
      }),
      { method: "POST", body: JSON.stringify({ languages, reason }) },
    ),
  audits: (tenantId: string) => {
    void tenantId;
    return request(
      "/v1/admin/audit-events",
      z.object({
        items: z.array(auditSchema),
        nextCursor: z.string().nullable(),
        hasMore: z.boolean(),
      }),
    );
  },
  action: (tenantId: string, id: string, action: string, reason: string) => {
    void tenantId;
    return request(
      `/v1/admin/releases/${encodeURIComponent(id)}/${action}`,
      z.object({ release: releaseSchema }),
      { method: "POST", body: JSON.stringify({ reason, confirm: true }) },
    );
  },
  releaseStorage: (tenantId: string) => {
    void tenantId;
    return request("/v1/admin/release-storage", releaseStorageSchema);
  },
  saveReleaseStorage: (tenantId: string, payload: unknown) => {
    void tenantId;
    return request("/v1/admin/release-storage", releaseStorageSchema, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  testReleaseStorage: (tenantId: string) => {
    void tenantId;
    return request(
      "/v1/admin/release-storage/test",
      z.object({
        ok: z.literal(true),
        provider: z.string(),
        bucket: z.string(),
        checkedAt: z.string(),
      }),
      { method: "POST", body: "{}" },
    );
  },
};

export function publicApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export function uploadArtifactFile(
  ticket: z.infer<typeof uploadSchema>,
  file: File,
  onProgress: (percentage: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError("上传已取消", 0));
      return;
    }
    const xhr = new XMLHttpRequest();
    const abortUpload = () => xhr.abort();
    signal?.addEventListener("abort", abortUpload, { once: true });
    xhr.open(ticket.method, ticket.url);
    xhr.withCredentials = ticket.requiresCredentials;
    for (const [key, value] of Object.entries(ticket.headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        signal?.removeEventListener("abort", abortUpload);
        resolve();
      } else {
        signal?.removeEventListener("abort", abortUpload);
        reject(new ApiError(`对象存储上传失败 (${xhr.status})`, xhr.status));
      }
    });
    xhr.addEventListener("error", () => {
      signal?.removeEventListener("abort", abortUpload);
      reject(new ApiError("无法连接对象存储", 0));
    });
    xhr.addEventListener("abort", () => {
      signal?.removeEventListener("abort", abortUpload);
      reject(new ApiError("上传已取消", 0));
    });
    xhr.send(file);
  });
}
