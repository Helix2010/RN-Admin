import { z } from "zod";

const releaseSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  platform: z.enum(["android", "ios"]),
  version: z.string(),
  buildNumber: z.number(),
  runtimeVersion: z.string(),
  channel: z.enum(["store", "direct", "mdm", "ota"]),
  status: z.string(),
  releaseNotes: z.array(z.string()),
  artifact: z
    .object({
      id: z.string(),
      fileName: z.string(),
      downloadUrl: z.string().nullable(),
      size: z.number(),
      sha256: z.string(),
      signingFingerprint: z.string().nullable(),
      minOsVersion: z.string(),
    })
    .nullable(),
  rollout: z.object({
    percentage: z.number(),
    audience: z.string(),
    startsAt: z.string().nullable(),
    stopRule: z.string().nullable(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
  activatedAt: z.string().nullable(),
  lastAction: z.string().nullable(),
});
export type Release = z.infer<typeof releaseSchema>;
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
  }),
  counts: z.record(z.string(), z.number()),
  rollout: z.number(),
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
const auditSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  reason: z.string(),
  requestId: z.string(),
  createdAt: z.string(),
  summary: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
});
export type AuditEvent = z.infer<typeof auditSchema>;

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
  overview: () => request("/v1/admin/overview", overviewSchema),
  releases: () => request("/v1/admin/releases", listSchema),
  createRelease: (payload: unknown) =>
    request("/v1/admin/releases", z.object({ release: releaseSchema }), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  config: () => request("/v1/admin/app-config", configViewSchema),
  saveConfig: (
    config: ManagedAppConfig,
    expectedVersion: number,
    reason: string,
  ) =>
    request("/v1/admin/app-config", configSaveSchema, {
      method: "PATCH",
      body: JSON.stringify({
        config,
        expectedVersion,
        reason,
        confirm: true,
      }),
    }),
  audits: () =>
    request(
      "/v1/admin/audit-events",
      z.object({
        items: z.array(auditSchema),
        nextCursor: z.string().nullable(),
        hasMore: z.boolean(),
      }),
    ),
  action: (id: string, action: string, reason: string) =>
    request(
      `/v1/admin/releases/${id}/${action}`,
      z.object({ release: releaseSchema }),
      { method: "POST", body: JSON.stringify({ reason, confirm: true }) },
    ),
};
