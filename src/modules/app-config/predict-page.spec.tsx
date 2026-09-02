// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig, ManagedAppConfig } from "../../core/api";

const apiMocks = vi.hoisted(() => ({
  config: vi.fn(),
  saveConfig: vi.fn(),
  probePredict: vi.fn(),
}));

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, adminApi: apiMocks };
});

import { PredictPlatformPage } from "./predict-page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SCOPE =
  "0xfb05e4134e5b30db022b94b822e7d19b1e5cd1c244468eada63789fd3514454a";

const palette = {
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

function configView(
  overrides: Partial<Pick<ManagedAppConfig, "modules" | "services">> = {},
): AppConfig {
  return {
    summary: {
      configVersion: "2026.09.02.1",
      localization: { supportedLocales: ["zh-CN"], messagesVersion: "1" },
      theme: { paletteVersion: "ocean-1", modes: ["light", "dark"] },
      featureFlags: [],
      updatePolicy: { source: "mysql", approvalRequired: false },
      wallet: { chains: ["eth", "op-sepolia"], walletConnectConfigured: true },
    },
    config: {
      configVersion: "2026.09.02.1",
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
        light: palette,
        dark: palette,
      },
      modules: { predict: false, dex: true },
      features: {
        updateCenter: true,
        otaEnabled: true,
        directUpdateEnabled: true,
        diagnosticsEnabled: true,
      },
      updatePolicy: {
        minSupportedVersion: "1.0.0",
        latestVersion: "1.2.7",
        otaChannel: "production",
      },
      support: { statusPageUrl: "https://status.anyfun.win" },
      wallet: {
        walletConnectProjectId: "3f8a2c1d9e4b6a70f2c5d8e1b4a70932",
        onchainSends: true,
        chains: ["eth", "op-sepolia"],
        networks: [],
      },
      services: {},
      ...overrides,
    },
    metadata: {
      databaseVersion: 7,
      updatedBy: "admin",
      updatedAt: "2026-09-02T00:00:00Z",
      walletCatalog: [
        {
          id: "eth",
          name: "Ethereum",
          chainId: 1,
          defaultRpcUrls: [],
          defaultExplorerUrl: "",
          testnet: false,
          nativeSymbol: "ETH",
          nativeDecimals: 18,
        },
        {
          id: "op-sepolia",
          name: "OP Sepolia",
          chainId: 11155420,
          defaultRpcUrls: [],
          defaultExplorerUrl: "",
          testnet: true,
          nativeSymbol: "ETH",
          nativeDecimals: 18,
        },
      ],
    },
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PredictPlatformPage
        tenantId="100000001"
        tenantName="anyfun"
        onNavigate={() => undefined}
      />
    </QueryClientProvider>,
  );
}

describe("PredictPlatformPage", () => {
  it("shows the stored link and warns when the module is on without one", async () => {
    apiMocks.config.mockResolvedValue(
      configView({ modules: { predict: true, dex: true } }),
    );
    renderPage();
    const overview = await screen.findByTestId("predict-overview");
    expect(overview.textContent).toContain("已开启");
    expect(overview.textContent).toContain("未配置");
    // 开着却没关联：服务端不会下发 bootstrap，必须说出来
    expect(overview.textContent).toContain("503");
  });

  it("refuses to save before a successful probe and then saves module plus link", async () => {
    apiMocks.config.mockResolvedValue(configView());
    apiMocks.probePredict.mockResolvedValue({
      ok: true,
      brand: "prax1s.xyz",
      chainId: 11155420,
      chainName: "OP Sepolia",
      scopeId: SCOPE,
      problems: [],
    });
    apiMocks.saveConfig.mockImplementation(async (_tenant, config) => ({
      ...configView({ modules: config.modules, services: config.services }),
      status: "active",
      savedAt: "2026-09-02T00:00:00Z",
      actorId: "admin",
      requestId: "req",
    }));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "编辑配置" }));
    await user.click(screen.getByLabelText(/开启预测市场模块/));
    await user.type(
      screen.getByLabelText(/平台接口域名/),
      "Predict.Prax1s.xyz",
    );
    await user.type(screen.getByLabelText(/平台 scopeId/), SCOPE);
    await user.selectOptions(screen.getByLabelText(/^链/), "op-sepolia");

    // 没测连接就保存：拦下，提示先测
    await user.click(screen.getByRole("button", { name: "保存并激活" }));
    expect(screen.getByText(/先点「测试连接」/)).toBeTruthy();
    expect(apiMocks.saveConfig).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "测试连接" }));
    await waitFor(() =>
      expect(screen.getByTestId("predict-probe-result").textContent).toContain(
        "连接正常",
      ),
    );
    // 域名归一化成小写再发给服务端
    expect(apiMocks.probePredict).toHaveBeenCalledWith({
      domain: "predict.prax1s.xyz",
      scopeId: SCOPE,
      chain: "op-sepolia",
    });

    await user.click(screen.getByRole("button", { name: "保存并激活" }));
    await user.type(screen.getByLabelText(/修改原因/), "接入 dev 平台");
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "确认激活" }));

    await waitFor(() => expect(apiMocks.saveConfig).toHaveBeenCalledTimes(1));
    const [, saved, version, reason] = apiMocks.saveConfig.mock.calls[0]!;
    expect(saved.modules).toEqual({ predict: true, dex: true });
    expect(saved.services.predict).toEqual({
      domain: "predict.prax1s.xyz",
      scopeId: SCOPE,
      chain: "op-sepolia",
    });
    // 钱包段由钱包页维护：这里不能带回去
    expect(saved.wallet).toBeUndefined();
    expect(version).toBe(7);
    expect(reason).toBe("接入 dev 平台");
  });

  it("invalidates the probe when a field changes afterwards", async () => {
    apiMocks.config.mockResolvedValue(
      configView({
        modules: { predict: true, dex: true },
        services: {
          predict: {
            domain: "predict.prax1s.xyz",
            scopeId: SCOPE,
            chain: "op-sepolia",
          },
        },
      }),
    );
    apiMocks.probePredict.mockResolvedValue({
      ok: false,
      brand: "other",
      chainId: 11155420,
      chainName: "OP Sepolia",
      scopeId: "0x" + "ab".repeat(32),
      problems: ["平台返回的 scopeId 与所填不一致"],
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "编辑配置" }));
    await user.click(screen.getByRole("button", { name: "测试连接" }));
    await waitFor(() =>
      expect(screen.getByTestId("predict-probe-result").textContent).toContain(
        "不一致",
      ),
    );
    // 平台说 scope 对不上：不能保存
    await user.click(screen.getByRole("button", { name: "保存并激活" }));
    expect(apiMocks.saveConfig).not.toHaveBeenCalled();
    expect(screen.getByText(/先点「测试连接」/)).toBeTruthy();
  });
});
