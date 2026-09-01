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
  // 老服务端不返回这个字段，默认按"非强制"处理
  mandatory: z.boolean().default(false),
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
  applyStrategy: z.enum(["next_launch", "immediate"]).default("next_launch"),
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
const otaManifestIdentitySchema = z.object({
  apiBaseUrl: z.string().optional(),
  distributionChannel: z.string().optional(),
  otaChannel: z.string().optional(),
  applicationId: z.string().optional(),
  appVersion: z.string().optional(),
  buildNumber: z.union([z.string(), z.number()]).optional(),
  expoClientVersion: z.string().optional(),
  expoClientAndroidVersionCode: z.number().optional(),
  expoClientIOSBuildNumber: z.string().optional(),
  runtimeVersion: z.string().optional(),
  platform: z.string().optional(),
  channel: z.string().optional(),
});
const otaReleaseDetailSchema = z.object({
  release: otaReleaseSchema.extend({
    baseVersion: z.string().optional(),
    baseBuildNumber: z.number().optional(),
    manifestKey: z.string().nullable().optional(),
    manifestSha256: z.string().nullable().optional(),
    createdBy: z.string().optional(),
  }),
  identity: otaManifestIdentitySchema.nullable(),
  baseMetadata: z.record(z.string(), z.unknown()),
  manifest: z.record(z.string(), z.unknown()).nullable(),
});
export type OtaReleaseDetail = z.infer<typeof otaReleaseDetailSchema>;
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
const installationOverviewSchema = z.object({
  generatedAt: z.string(),
  total: z.number(),
  active: z.object({
    oneDay: z.number(),
    sevenDays: z.number(),
    thirtyDays: z.number(),
  }),
  versions: z.array(
    z.object({
      platform: z.enum(["android", "ios"]),
      version: z.string(),
      buildNumber: z.string(),
      count: z.number(),
    }),
  ),
});
const installationListSchema = z.object({
  items: z.array(
    z.object({
      installationId: z.string(),
      applicationId: z.string(),
      packageId: z.string(),
      platform: z.enum(["android", "ios"]),
      appVersion: z.string(),
      buildNumber: z.string(),
      runtimeVersion: z.string(),
      otaRevision: z.number().nullable(),
      localizationVersion: z.string().nullable(),
      brandingVersion: z.number().nullable(),
      locale: z.string(),
      theme: z.string(),
      osVersion: z.string(),
      deviceClass: z.string(),
      lastActiveAt: z.string(),
      status: z.string(),
    }),
  ),
  total: z.number(),
});
const pushOutboxSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      eventType: z.string(),
      status: z.string(),
      attempts: z.number(),
      lastError: z.string().nullable(),
      createdAt: z.string(),
      sentAt: z.string().nullable(),
      sent: z.number(),
      failed: z.number(),
    }),
  ),
  total: z.number(),
});
const pushDeliveriesSchema = z.object({
  items: z.array(
    z.object({
      eventId: z.string(),
      installationId: z.string(),
      provider: z.string(),
      providerMessageId: z.string().nullable(),
      status: z.string(),
      failureCode: z.string().nullable(),
      sentAt: z.string().nullable(),
      deliveredAt: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
  total: z.number(),
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

const walletSectionSchema = z.object({
  walletConnectProjectId: z.string().default(""),
  chains: z.array(z.string()).default([]),
  networks: z
    .array(
      z.object({
        id: z.string(),
        chainId: z.number().int(),
        rpcUrls: z.array(z.string()).default([]),
        explorerUrl: z.string().default(""),
      }),
    )
    .default([]),
});

/** 平台支持的链目录，由服务端下发；管理端不再自己抄一份链表。 */
const walletCatalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  chainId: z.number().int(),
  defaultRpcUrls: z.array(z.string()).default([]),
  defaultExplorerUrl: z.string().default(""),
  // 老服务端不下发这个标记时按主网处理
  testnet: z.boolean().default(false),
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
  modules: z
    .object({
      predict: z.boolean(),
      dex: z.boolean(),
    })
    .default({ predict: true, dex: true }),
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
  /**
   * 钱包与链参数：App 启动时随 bootstrap 下发，改完不需要重新打包。
   *
   * 这一段必须留在 schema 里。配置中心是"整份配置 PATCH 回去"，schema 没声明
   * 的字段会被 zod 剥掉——漏掉它就意味着改一次主题色会把租户的 projectId
   * 和链端点一起清空。
   */
  wallet: walletSectionSchema.default({
    walletConnectProjectId: "",
    chains: [],
    networks: [],
  }),
});
export type ManagedAppConfig = z.infer<typeof managedAppConfigSchema>;
export type WalletSection = z.infer<typeof walletSectionSchema>;
export type WalletCatalogEntry = z.infer<typeof walletCatalogEntrySchema>;

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
  wallet: z
    .object({
      chains: z.array(z.string()).default([]),
      walletConnectConfigured: z.boolean().default(false),
    })
    .default({ chains: [], walletConnectConfigured: false }),
});
const configViewSchema = z.object({
  summary: configSummarySchema,
  config: managedAppConfigSchema,
  metadata: z.object({
    databaseVersion: z.number().int().positive(),
    updatedBy: z.string(),
    updatedAt: z.string(),
    walletCatalog: z.array(walletCatalogEntrySchema).default([]),
  }),
});

const brandingUploadSchema = z.object({
  asset: z.object({
    id: z.string(),
    token: z.string(),
    objectKey: z.string(),
    fileName: z.string(),
    contentType: z.string(),
    size: z.number(),
  }),
  upload: z.object({
    method: z.literal("PUT"),
    url: z.string(),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.string().optional(),
    requiresCredentials: z.boolean().default(false),
  }),
});
const brandingViewSchema = z.object({
  config: z.record(z.string(), z.unknown()),
  metadata: z.object({
    sourceTenant: z.string(),
    version: z.number(),
    updatedBy: z.string(),
    updatedAt: z.string(),
  }),
});
export type BrandingView = z.infer<typeof brandingViewSchema>;
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
  expiresAt: z.string().optional(),
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

const uploadPartSchema = z.object({
  partNumber: z.number().int().positive(),
  etag: z.string(),
  size: z.number().positive(),
});
const uploadSessionSchema = z
  .object({
    id: z.string(),
    token: z.string().optional(),
    uploadType: z.enum(["apk", "ota"]),
    fileName: z.string(),
    contentType: z.string(),
    size: z.number(),
    partSize: z.number().int().positive(),
    totalParts: z.number().int().positive(),
    status: z
      .enum(["active", "completed", "aborted", "expired"])
      .default("active"),
    expiresAt: z.string(),
    uploadedParts: z.array(uploadPartSchema).optional().default([]),
    parts: z.array(uploadPartSchema).optional(),
  })
  .transform((value) => ({
    ...value,
    uploadedParts:
      value.uploadedParts.length > 0
        ? value.uploadedParts
        : (value.parts ?? []),
  }));
const uploadSessionResponseSchema = z
  .union([
    z.object({ session: uploadSessionSchema, token: z.string().optional() }),
    uploadSessionSchema,
  ])
  .transform((value) =>
    "session" in value
      ? {
          session: value.token
            ? { ...value.session, token: value.token }
            : value.session,
        }
      : { session: value },
  );
const uploadSessionCompleteSchema = z.object({
  artifact: z.object({
    id: z.string(),
    token: z.string(),
    fileName: z.string(),
    contentType: z.string(),
    size: z.number(),
    objectKey: z.string(),
    expiresAt: z.string(),
  }),
});
export type UploadSession = z.infer<typeof uploadSessionSchema>;
export type UploadSessionPart = z.infer<typeof uploadPartSchema>;

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
  installationOverview: (tenantId: string) => {
    void tenantId;
    return request(
      "/v1/admin/installations/overview",
      installationOverviewSchema,
    );
  },
  installations: (tenantId: string) => {
    void tenantId;
    return request("/v1/admin/installations", installationListSchema);
  },
  revokeInstallation: (
    tenantId: string,
    installationId: string,
    reason: string,
  ) => {
    void tenantId;
    return request(
      `/v1/admin/installations/${encodeURIComponent(installationId)}/revoke`,
      z.object({
        revoked: z.literal(true),
        installationId: z.string(),
        revokedAt: z.string(),
      }),
      { method: "POST", body: JSON.stringify({ reason, confirm: true }) },
    );
  },
  pushOutbox: (tenantId: string) => {
    void tenantId;
    return request("/v1/admin/push/outbox", pushOutboxSchema);
  },
  pushDeliveries: (tenantId: string, status = "") => {
    void tenantId;
    const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
    return request(`/v1/admin/push/deliveries${suffix}`, pushDeliveriesSchema);
  },
  releases: (tenantId: string) => {
    void tenantId;
    return request("/v1/admin/releases", listSchema);
  },
  otaReleases: (tenantId: string) => {
    void tenantId;
    return request("/v1/admin/ota/releases", otaListSchema);
  },
  otaReleaseDetail: (tenantId: string, id: string) => {
    void tenantId;
    return request(
      `/v1/admin/ota/releases/${encodeURIComponent(id)}`,
      otaReleaseDetailSchema,
    );
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
  createUploadSession: (tenantId: string, payload: unknown) => {
    void tenantId;
    return request("/v1/admin/upload-sessions", uploadSessionResponseSchema, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getUploadSession: (tenantId: string, id: string, token?: string) => {
    void tenantId;
    return request(
      `/v1/admin/upload-sessions/${encodeURIComponent(id)}`,
      uploadSessionResponseSchema,
      token ? { headers: { "x-upload-session-token": token } } : undefined,
    );
  },
  completeUploadSession: (
    tenantId: string,
    id: string,
    parts: UploadSessionPart[],
    token?: string,
  ) => {
    void tenantId;
    return request(
      `/v1/admin/upload-sessions/${encodeURIComponent(id)}/complete`,
      uploadSessionCompleteSchema,
      {
        method: "POST",
        body: JSON.stringify({ parts }),
        headers: token ? { "x-upload-session-token": token } : undefined,
      },
    );
  },
  deleteUploadSession: (tenantId: string, id: string, token?: string) => {
    void tenantId;
    return request(
      `/v1/admin/upload-sessions/${encodeURIComponent(id)}`,
      z.union([
        z.object({ deleted: z.literal(true) }),
        z.object({ cancelled: z.literal(true) }),
      ]),
      {
        method: "DELETE",
        headers: token ? { "x-upload-session-token": token } : undefined,
      },
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
  branding: () => request("/v1/admin/branding", brandingViewSchema),
  saveBranding: (
    config: Record<string, unknown>,
    expectedVersion: number,
    reason: string,
  ) =>
    request("/v1/admin/branding", brandingViewSchema, {
      method: "PATCH",
      body: JSON.stringify({
        config,
        expectedVersion,
        reason,
        confirm: true,
      }),
    }),
  createBrandingAssetUpload: (payload: {
    fileName: string;
    contentType: string;
    size: number;
    assetType: "launch_logo" | "launch_background";
    locale?: string;
    theme?: "light" | "dark";
  }) =>
    request("/v1/admin/branding/assets/uploads", brandingUploadSchema, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteBrandingAsset: (token: string) =>
    request(
      "/v1/admin/branding/assets/upload",
      z.object({ deleted: z.literal(true) }),
      { method: "DELETE", headers: { "x-branding-asset-token": token } },
    ),
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

export function uploadUploadSessionPart(
  session: UploadSession,
  partNumber: number,
  file: Blob,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<UploadSessionPart> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError("上传已取消", 0));
      return;
    }
    const xhr = new XMLHttpRequest();
    const abortUpload = () => xhr.abort();
    signal?.addEventListener("abort", abortUpload, { once: true });
    xhr.open(
      "PUT",
      `${baseUrl}/v1/admin/upload-sessions/${encodeURIComponent(session.id)}/parts/${partNumber}`,
    );
    xhr.withCredentials = true;
    xhr.setRequestHeader(
      "content-type",
      session.contentType || "application/octet-stream",
    );
    if (session.token)
      xhr.setRequestHeader("x-upload-session-token", session.token);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    });
    const cleanup = () => signal?.removeEventListener("abort", abortUpload);
    xhr.addEventListener("load", () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        let parsed: unknown;
        try {
          parsed = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
        } catch {
          parsed = undefined;
        }
        const result = uploadPartSchema.safeParse(
          (parsed as { part?: unknown } | undefined)?.part ?? parsed,
        );
        if (result.success) resolve(result.data);
        else reject(new ApiError("上传服务返回的分片信息无效", 502));
      } else {
        reject(new ApiError(`分片上传失败 (${xhr.status})`, xhr.status));
      }
    });
    xhr.addEventListener("error", () => {
      cleanup();
      reject(new ApiError("无法连接上传服务", 0));
    });
    xhr.addEventListener("abort", () => {
      cleanup();
      reject(new ApiError("上传已取消", 0));
    });
    xhr.send(file);
  });
}
