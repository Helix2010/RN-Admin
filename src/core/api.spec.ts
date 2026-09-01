import { afterEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("adminApi.releases", () => {
  it("accepts legacy releases whose file metadata is null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "release-rejected",
                platform: "android",
                version: "1.0.0",
                buildNumber: 1,
                runtimeVersion: "expo:57.0.15",
                status: "rejected",
                releaseNotes: { "zh-CN": ["首次测试包"] },
                fileMetadata: null,
                createdAt: "2026-08-25T00:00:00Z",
                updatedAt: "2026-08-25T00:00:00Z",
                lastAction: null,
              },
            ],
            nextCursor: null,
            hasMore: false,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    const result = await adminApi.releases("tenant-a");

    expect(result.items[0]?.fileMetadata).toBeUndefined();
  });

  it("accepts OTA upload tickets from older servers without upload expiry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            artifact: {
              id: "ota-artifact",
              token: "ota-token",
              fileName: "ota.zip",
              contentType: "application/zip",
              size: 1024,
              objectKey: "tenants/tenant-a/ota-uploads/ota.zip",
              expiresAt: "2026-08-28T01:00:00Z",
            },
            upload: {
              method: "PUT",
              url: "https://storage.example/ota",
              headers: { "content-type": "application/zip" },
              requiresCredentials: true,
            },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const result = await adminApi.createOtaArtifactUpload("tenant-a", {
      fileName: "ota.zip",
      contentType: "application/zip",
      size: 1024,
      baseReleaseId: "release-base",
      channel: "production",
    });

    expect(result.upload.expiresAt).toBeUndefined();
  });
});

describe("adminApi.config", () => {
  const serverConfig = {
    configVersion: "2026.09.01.1",
    ttlSeconds: 300,
    localization: {
      fallbackLocale: "zh-CN",
      supportedLocales: ["zh-CN"],
      messagesVersion: "1",
      messages: { "zh-CN": { "app.name": "AnyFun" }, "en-US": {} },
    },
    theme: {
      defaultMode: "system",
      allowUserOverride: true,
      paletteVersion: "ocean-1",
      light: palette(),
      dark: palette(),
    },
    modules: { predict: true, dex: true },
    features: {
      updateCenter: true,
      otaEnabled: true,
      directUpdateEnabled: true,
      diagnosticsEnabled: true,
    },
    updatePolicy: {
      minSupportedVersion: "1.0.0",
      latestVersion: "1.2.4",
      otaChannel: "production",
    },
    support: { statusPageUrl: "https://status.anyfun.win" },
    wallet: {
      walletConnectProjectId: "3f8a2c1d9e4b6a70f2c5d8e1b4a70932",
      chains: ["bsc"],
      networks: [
        {
          id: "bsc",
          chainId: 56,
          rpcUrls: ["https://rpc.tenant.example/bsc"],
          explorerUrl: "https://bscscan.com",
        },
      ],
    },
  };

  function stubConfigResponse(body: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  }

  it("keeps the wallet section and the chain catalog", async () => {
    // 回归：schema 没声明 wallet 时 zod 会把它剥掉，而配置中心是整份 PATCH 回去，
    // 于是改一次主题色就清空了租户的 projectId 与链端点
    stubConfigResponse({
      summary: summary(),
      config: serverConfig,
      metadata: {
        databaseVersion: 7,
        updatedBy: "admin",
        updatedAt: "2026-09-01T00:00:00Z",
        walletCatalog: [
          {
            id: "bsc",
            name: "BNB Smart Chain",
            chainId: 56,
            defaultRpcUrls: ["https://bsc-dataseed.bnbchain.org"],
            defaultExplorerUrl: "https://bscscan.com",
          },
        ],
      },
    });

    const view = await adminApi.config("tenant-a");

    expect(view.config.wallet.walletConnectProjectId).toBe(
      "3f8a2c1d9e4b6a70f2c5d8e1b4a70932",
    );
    expect(view.config.wallet.networks[0]?.rpcUrls).toEqual([
      "https://rpc.tenant.example/bsc",
    ]);
    expect(view.metadata.walletCatalog[0]?.chainId).toBe(56);
    expect(view.summary.wallet.walletConnectConfigured).toBe(true);
  });

  it("still loads from a server that does not deliver wallet parameters yet", async () => {
    const { wallet, ...withoutWallet } = serverConfig;
    void wallet;
    stubConfigResponse({
      summary: { ...summary(), wallet: undefined },
      config: withoutWallet,
      metadata: {
        databaseVersion: 7,
        updatedBy: "admin",
        updatedAt: "2026-09-01T00:00:00Z",
      },
    });

    const view = await adminApi.config("tenant-a");

    expect(view.config.wallet.chains).toEqual([]);
    expect(view.metadata.walletCatalog).toEqual([]);
    expect(view.summary.wallet.walletConnectConfigured).toBe(false);
  });
});

function palette() {
  return {
    primary: "#3157D5",
    onPrimary: "#FFFFFF",
    background: "#F4F7FB",
    surface: "#FFFFFF",
    surfaceVariant: "#EAF0F8",
    text: "#101828",
    textMuted: "#5A687C",
    border: "#D5DDE9",
    success: "#147A50",
    warning: "#9A5C00",
    danger: "#B42318",
    info: "#2962A3",
    pricePositive: "#0E8A5F",
    priceNegative: "#D03C45",
    risk: "#7A4D00",
    focus: "#7293FF",
    backdrop: "rgba(11, 18, 32, 0.56)",
  };
}

function summary() {
  return {
    configVersion: "2026.09.01.1",
    localization: { supportedLocales: ["zh-CN"], messagesVersion: "1" },
    theme: { paletteVersion: "ocean-1", modes: ["light", "dark"] },
    featureFlags: ["otaEnabled"],
    updatePolicy: { source: "mysql", approvalRequired: false },
    wallet: { chains: ["bsc"], walletConnectConfigured: true },
  };
}
