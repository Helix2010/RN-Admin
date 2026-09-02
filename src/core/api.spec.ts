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
    services: {},
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
      onchainSends: false,
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
            testnet: false,
            nativeSymbol: "BNB",
            nativeDecimals: 18,
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
});

describe("adminApi tokens", () => {
  const fetchMock = () => vi.mocked(globalThis.fetch);
  function stubJson(body: unknown, status = 200) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  }
  const usdt = {
    id: 12,
    scope: "global",
    chain: "bsc",
    address: "0x55d398326f99059fF775485246999027B3197955",
    symbol: "USDT",
    name: "Tether USD",
    decimals: 18,
    displayDecimals: 2,
    logoColor: "#26A17B",
    sortWeight: 100,
    enabled: true,
    allowlisted: true,
    metadataSyncedAt: "2026-09-02T01:00:00.000Z",
    updatedAt: "2026-09-02T01:00:00.000Z",
  };

  it("parses the merged token list and keeps the database version", async () => {
    stubJson({
      tokens: [
        usdt,
        {
          // native 行没有链上元数据；老字段缺省时也要能过 schema
          id: 1,
          scope: "global",
          chain: "bsc",
          address: "native",
          symbol: "BNB",
          name: "BNB",
          decimals: 18,
          displayDecimals: 4,
          logoColor: "#F0B90B",
          sortWeight: 1000,
          enabled: true,
          allowlisted: false,
          metadataSyncedAt: null,
          updatedAt: "2026-09-02T01:00:00.000Z",
          extra: "passes through",
        },
      ],
      metadata: { databaseVersion: 12 },
    });

    const result = await adminApi.listTokens("bsc");

    expect(fetchMock().mock.calls[0]?.[0]).toBe(
      "http://localhost:3000/v1/admin/tokens?chain=bsc",
    );
    expect(result.metadata.databaseVersion).toBe(12);
    expect(result.tokens[0]).toMatchObject({
      symbol: "USDT",
      decimals: 18,
      displayDecimals: 2,
      allowlisted: true,
      metadataSyncedAt: "2026-09-02T01:00:00.000Z",
    });
    const native = result.tokens[1];
    expect(native?.metadataSyncedAt).toBeNull();
    expect(native?.allowlisted).toBe(false);
    expect((native as Record<string, unknown> | undefined)?.extra).toBe(
      "passes through",
    );
  });

  it("rejects the whole list when a token is outside the protocol range", async () => {
    // 服务端写入时就拒绝这种值；列表里出现就是数据坏了，按 error 态呈现，不丢一行继续
    stubJson({
      tokens: [{ ...usdt, decimals: 40 }],
      metadata: { databaseVersion: 12 },
    });

    await expect(adminApi.listTokens()).rejects.toThrow();
  });

  it("returns preview data, with exists explicitly null for a new token", async () => {
    stubJson({
      chain: "bsc",
      contractAddress: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 18,
      allowlisted: true,
      exists: null,
    });

    const preview = await adminApi.previewToken({
      chain: "bsc",
      contractAddress: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    });

    expect(preview.exists).toBeNull();
    expect(preview.decimals).toBe(18);
    const [, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      chain: "bsc",
      contractAddress: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    });
  });

  it("sends reason and expectedVersion in the DELETE body", async () => {
    stubJson({ metadata: { databaseVersion: 13 } });

    const result = await adminApi.deleteToken(40, {
      reason: "租户不再支持",
      expectedVersion: 12,
    });

    expect(result.metadata.databaseVersion).toBe(13);
    const [url, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3000/v1/admin/tokens/40");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(String(init.body))).toEqual({
      reason: "租户不再支持",
      expectedVersion: 12,
    });
  });

  it("parses the three resync outcomes", async () => {
    stubJson({
      changed: true,
      current: { symbol: "USDT", decimals: 18 },
      onchain: { symbol: "USDT", decimals: 6 },
    });
    const diff = await adminApi.resyncToken(12, {
      reason: "核对链上精度",
      expectedVersion: 12,
      confirm: false,
    });
    expect(diff.changed).toBe(true);
    expect("onchain" in diff && diff.onchain.decimals).toBe(6);

    stubJson({ changed: false, token: usdt });
    const same = await adminApi.resyncToken(12, {
      reason: "核对链上精度",
      expectedVersion: 12,
    });
    expect(same.changed).toBe(false);

    stubJson({
      changed: true,
      token: { ...usdt, decimals: 6 },
      metadata: { databaseVersion: 13 },
    });
    const written = await adminApi.resyncToken(12, {
      reason: "核对链上精度",
      expectedVersion: 12,
      confirm: true,
    });
    expect("token" in written && written.token.decimals).toBe(6);
  });

  it("surfaces the problem code so pages can explain chain errors", async () => {
    stubJson(
      {
        type: "about:blank",
        title: "Bad Request",
        status: 400,
        code: "TOKEN_NOT_A_CONTRACT",
        detail: "no code at address",
      },
      400,
    );

    await expect(
      adminApi.previewToken({
        chain: "bsc",
        contractAddress: "0x0000000000000000000000000000000000000001",
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "TOKEN_NOT_A_CONTRACT",
      message: "no code at address",
    });
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

describe("token list strictness", () => {
  it("fails the whole list when one row cannot be parsed", async () => {
    // 不逐条丢弃：坏行要靠迁移修数据，页面按 error 态给出原因
    const good = {
      id: 1,
      scope: "global",
      chain: "bsc",
      address: "native",
      symbol: "BNB",
      name: "BNB",
      decimals: 18,
      displayDecimals: 4,
      logoColor: "#F0B90B",
      sortWeight: 1000,
      enabled: true,
      allowlisted: true,
      metadataSyncedAt: null,
      updatedAt: "2026-09-02T00:00:00.000Z",
    };
    const bad = {
      ...good,
      id: 2,
      address: "0x0000000000000000000000000000000000000001",
      decimals: 37,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            tokens: [good, bad],
            metadata: { databaseVersion: 3 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(adminApi.listTokens()).rejects.toThrow();
  });
});
