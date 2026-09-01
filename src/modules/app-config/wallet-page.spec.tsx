// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig, ManagedAppConfig } from "../../core/api";

const apiMocks = vi.hoisted(() => ({
  config: vi.fn(),
  saveConfig: vi.fn(),
}));

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, adminApi: apiMocks };
});

import { WalletChainsPage } from "./wallet-page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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

const catalog = [
  {
    id: "bsc",
    name: "BNB Smart Chain",
    chainId: 56,
    defaultRpcUrls: ["https://bsc-dataseed.bnbchain.org"],
    defaultExplorerUrl: "https://bscscan.com",
  },
  {
    id: "base",
    name: "Base",
    chainId: 8453,
    defaultRpcUrls: ["https://mainnet.base.org"],
    defaultExplorerUrl: "https://basescan.org",
  },
];

function configView(wallet?: Partial<ManagedAppConfig["wallet"]>): AppConfig {
  const walletSection: ManagedAppConfig["wallet"] = {
    walletConnectProjectId: "3f8a2c1d9e4b6a70f2c5d8e1b4a70932",
    chains: ["bsc"],
    networks: [
      {
        id: "bsc",
        chainId: 56,
        rpcUrls: ["https://bsc-dataseed.bnbchain.org"],
        explorerUrl: "https://bscscan.com",
      },
    ],
    ...wallet,
  };
  return {
    summary: {
      configVersion: "2026.09.01.1",
      localization: { supportedLocales: ["zh-CN"], messagesVersion: "1" },
      theme: { paletteVersion: "ocean-1", modes: ["light", "dark"] },
      featureFlags: [],
      updatePolicy: { source: "mysql", approvalRequired: false },
      wallet: {
        chains: walletSection.chains,
        walletConnectConfigured:
          walletSection.walletConnectProjectId.trim() !== "",
      },
    },
    config: {
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
        light: palette,
        dark: palette,
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
      wallet: walletSection,
    },
    metadata: {
      databaseVersion: 7,
      updatedBy: "admin",
      updatedAt: "2026-09-01T00:00:00Z",
      walletCatalog: catalog,
    },
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <WalletChainsPage
        tenantId="tenant-a"
        tenantName="Tenant A"
        onNavigate={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("WalletChainsPage", () => {
  it("tells the operator when no project id is configured", async () => {
    apiMocks.config.mockResolvedValue(
      configView({ walletConnectProjectId: "" }),
    );
    renderPage();

    expect(
      (await screen.findByTestId("wallet-project-id")).textContent,
    ).toContain("未配置");
    expect(screen.getAllByText("待配置").length).toBeGreaterThan(0);
    // 内置钱包不受影响这句必须说清，否则运营会以为整个钱包功能坏了
    expect(screen.getByText(/内置钱包不受影响/)).toBeTruthy();
  });

  it("marks a chain that still uses the platform default endpoints", async () => {
    apiMocks.config.mockResolvedValue(configView());
    renderPage();

    expect(await screen.findByText("平台默认 RPC")).toBeTruthy();
    expect(screen.getByText(/chainId 56/)).toBeTruthy();
  });

  it("blocks a save with a pasted project link or a cleartext rpc endpoint", async () => {
    apiMocks.config.mockResolvedValue(configView());
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "编辑配置" }));
    const projectId = screen.getByRole("textbox", { name: /Project ID/ });
    await user.clear(projectId);
    await user.type(projectId, "https://cloud.reown.com/app/abc");
    expect(screen.getByText(/不要填入完整链接/)).toBeTruthy();

    const rpc = screen.getByRole("textbox", {
      name: /BNB Smart Chain RPC 端点/,
    });
    await user.clear(rpc);
    await user.type(rpc, "http://rpc.tenant.example");

    await user.click(screen.getByRole("button", { name: "保存配置" }));

    expect(screen.getByText(/还有 2 处需要修正/)).toBeTruthy();
    // 明文 RPC 的风险要写在拦截提示里，字段下的说明不算
    expect(screen.getByRole("alert").textContent).toContain(
      "会泄露用户查询的每个地址和余额",
    );
    expect(apiMocks.saveConfig).not.toHaveBeenCalled();
  });

  it("saves an enabled chain with the tenant's own endpoint", async () => {
    apiMocks.config.mockResolvedValue(configView());
    apiMocks.saveConfig.mockResolvedValue(configView());
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "编辑配置" }));
    await user.click(screen.getByRole("checkbox", { name: /Base/ }));
    await user.type(
      screen.getByRole("textbox", { name: /Base RPC 端点/ }),
      "https://rpc.tenant.example/base",
    );
    await user.click(screen.getByRole("button", { name: "保存配置" }));
    await user.type(
      screen.getByPlaceholderText("例如：接入租户自有 BSC 节点并启用 Base"),
      "启用 Base 并接自有节点",
    );
    await user.click(screen.getByRole("button", { name: "继续确认" }));
    await user.click(await screen.findByRole("button", { name: "确认激活" }));

    const [, sent, expectedVersion, reason] = apiMocks.saveConfig.mock
      .calls[0] as [string, ManagedAppConfig, number, string];
    expect(sent.wallet.chains).toEqual(["bsc", "base"]);
    const base = sent.wallet.networks.find((item) => item.id === "base");
    expect(base?.rpcUrls).toEqual(["https://rpc.tenant.example/base"]);
    // chainId 来自平台目录，界面上没有输入框
    expect(base?.chainId).toBe(8453);
    // 没动过的链存空数组，继续跟随平台默认；抄一份当前默认值会把它固化成快照
    expect(
      sent.wallet.networks.find((item) => item.id === "bsc")?.rpcUrls,
    ).toEqual([]);
    expect(expectedVersion).toBe(7);
    expect(reason).toBe("启用 Base 并接自有节点");
  });

  it("keeps at least one chain enabled and restores platform defaults", async () => {
    apiMocks.config.mockResolvedValue(
      configView({
        chains: ["bsc"],
        networks: [
          {
            id: "bsc",
            chainId: 56,
            rpcUrls: ["https://rpc.tenant.example/bsc"],
            explorerUrl: "https://explorer.tenant.example",
          },
        ],
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "编辑配置" }));
    // 唯一启用的链不能被关掉，否则 App 里的钱包无链可用
    expect(
      (
        screen.getByRole("checkbox", {
          name: /BNB Smart Chain/,
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);

    const rpc = screen.getByRole("textbox", {
      name: /BNB Smart Chain RPC 端点/,
    }) as HTMLTextAreaElement;
    expect(rpc.value).toBe("https://rpc.tenant.example/bsc");
    await user.click(
      screen.getByRole("button", { name: /恢复 BNB Smart Chain 平台默认/ }),
    );
    expect(rpc.value).toBe("");
    expect(rpc.placeholder).toBe("https://bsc-dataseed.bnbchain.org");
  });
});
