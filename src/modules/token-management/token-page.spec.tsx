// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  type AppConfig,
  type Token,
  type TokenCreateInput,
  type TokenList,
  type TokenPreview,
  type TokenUpdateInput,
} from "../../core/api";

const apiMocks = vi.hoisted(() => ({
  config: vi.fn(),
  listTokens: vi.fn(),
  previewToken: vi.fn(),
  createToken: vi.fn(),
  updateToken: vi.fn(),
  resyncToken: vi.fn(),
  deleteToken: vi.fn(),
}));

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, adminApi: apiMocks };
});

import { TokenPage } from "./token-page";

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
    testnet: false,
    nativeSymbol: "BNB",
    nativeDecimals: 18,
  },
  {
    id: "eth",
    name: "Ethereum",
    chainId: 1,
    defaultRpcUrls: ["https://eth.llamarpc.com"],
    defaultExplorerUrl: "https://etherscan.io",
    testnet: false,
    nativeSymbol: "ETH",
    nativeDecimals: 18,
  },
  {
    id: "op-sepolia",
    name: "OP Sepolia",
    chainId: 11155420,
    defaultRpcUrls: ["https://sepolia.optimism.io"],
    defaultExplorerUrl: "https://sepolia-optimism.etherscan.io",
    testnet: true,
    nativeSymbol: "ETH",
    nativeDecimals: 18,
  },
];

function configView(): AppConfig {
  return {
    summary: {
      configVersion: "2026.09.01.1",
      localization: { supportedLocales: ["zh-CN"], messagesVersion: "1" },
      theme: { paletteVersion: "ocean-1", modes: ["light", "dark"] },
      featureFlags: [],
      updatePolicy: { source: "mysql", approvalRequired: false },
      wallet: { chains: ["bsc"], walletConnectConfigured: true },
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
      wallet: {
        walletConnectProjectId: "3f8a2c1d9e4b6a70f2c5d8e1b4a70932",
        onchainSends: false,
        chains: ["bsc"],
        networks: [
          {
            id: "bsc",
            chainId: 56,
            rpcUrls: [],
            explorerUrl: "",
          },
        ],
      },
    },
    metadata: {
      databaseVersion: 12,
      updatedBy: "admin",
      updatedAt: "2026-09-01T00:00:00Z",
      walletCatalog: catalog,
    },
  };
}

const updatedAt = "2026-09-02T01:00:00.000Z";
const usdtAddress = "0x55d398326f99059fF775485246999027B3197955";
const cakeAddress = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82";

function tokenList(): TokenList {
  const tokens: Token[] = [
    {
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
      updatedAt,
    },
    {
      id: 12,
      scope: "global",
      chain: "bsc",
      address: usdtAddress,
      symbol: "USDT",
      name: "Tether USD",
      decimals: 18,
      displayDecimals: 2,
      logoColor: "#26A17B",
      sortWeight: 100,
      enabled: true,
      allowlisted: true,
      metadataSyncedAt: updatedAt,
      updatedAt,
    },
    {
      id: 40,
      scope: "tenant",
      chain: "bsc",
      address: cakeAddress,
      symbol: "CAKE",
      name: "PancakeSwap Token",
      decimals: 18,
      displayDecimals: 4,
      logoColor: "#D1884F",
      sortWeight: 10,
      enabled: false,
      allowlisted: false,
      metadataSyncedAt: updatedAt,
      updatedAt,
    },
    {
      id: 7,
      scope: "global",
      chain: "op-sepolia",
      address: "native",
      symbol: "ETH",
      name: "Ether",
      decimals: 18,
      displayDecimals: 4,
      logoColor: "#627EEA",
      sortWeight: 1000,
      enabled: true,
      allowlisted: true,
      metadataSyncedAt: null,
      updatedAt,
    },
  ];
  return { tokens, metadata: { databaseVersion: 12 } };
}

function preview(overrides: Partial<TokenPreview> = {}): TokenPreview {
  return {
    chain: "eth",
    contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    allowlisted: true,
    exists: null,
    ...overrides,
  };
}

function renderPage() {
  apiMocks.config.mockResolvedValue(configView());
  apiMocks.listTokens.mockResolvedValue(tokenList());
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <TokenPage
        tenantId="tenant-a"
        tenantName="Tenant A"
        onNavigate={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

async function openCreatePanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "添加代币" }));
  return screen.getByRole("dialog", { name: "添加代币" });
}

async function readOnchain(
  user: ReturnType<typeof userEvent.setup>,
  address: string,
) {
  await user.type(screen.getByRole("textbox", { name: /合约地址/ }), address);
  await user.click(screen.getByRole("button", { name: "读取链上信息" }));
}

describe("TokenPage list", () => {
  it("groups tokens by chain and marks scope, test chains and allowlist gaps", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: /BNB Smart Chain/ }),
    ).toBeTruthy();
    // 链目录里的链都要列出来，没有代币的也列，运营才知道哪条链还没配
    expect(screen.getByRole("heading", { name: /Ethereum/ })).toBeTruthy();
    expect(screen.getByText("这条链还没有代币")).toBeTruthy();
    const sepolia = screen.getByRole("heading", { name: /OP Sepolia/ });
    expect(within(sepolia).getByText("测试网")).toBeTruthy();

    const usdt = screen.getByTestId("token-row-12");
    expect(within(usdt).getByText("18 位 · 展示 2 位")).toBeTruthy();
    expect(within(usdt).getByText("全局")).toBeTruthy();
    expect(within(usdt).getByText("已启用")).toBeTruthy();
    expect(within(usdt).queryByText(/不在 App 客户端白名单内/)).toBeNull();

    const cake = screen.getByTestId("token-row-40");
    expect(within(cake).getByText("本租户")).toBeTruthy();
    expect(within(cake).getByText("已停用")).toBeTruthy();
    expect(
      within(cake).getByText(
        "不在 App 客户端白名单内，用户转出时会看到未验证警示",
      ),
    ).toBeTruthy();

    // 全局行不能删除，只能停用；租户行可以删
    const deleteGlobal = within(usdt).getByRole("button", {
      name: "删除 USDT",
    }) as HTMLButtonElement;
    expect(deleteGlobal.disabled).toBe(true);
    expect(screen.getAllByTitle("平台全局代币不能删除，可停用").length).toBe(3);
    expect(
      (
        within(cake).getByRole("button", {
          name: "删除 CAKE",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    // 原生币排最前（sortWeight 最大）
    const rows = screen.getAllByTestId(/token-row-/);
    expect(rows[0]?.getAttribute("data-testid")).toBe("token-row-1");
  });

  it("toggles a token with a reason and the list's database version", async () => {
    apiMocks.updateToken.mockResolvedValue({
      token: { ...tokenList().tokens[1]!, enabled: false, scope: "tenant" },
      metadata: { databaseVersion: 13 },
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "停用 USDT" }));
    const dialog = screen.getByRole("dialog", { name: "停用 USDT？" });
    // 不填原因不能提交
    await user.click(within(dialog).getByRole("button", { name: "确认停用" }));
    expect(within(dialog).getByText(/至少 3 个字符/)).toBeTruthy();
    expect(apiMocks.updateToken).not.toHaveBeenCalled();

    await user.type(
      within(dialog).getByRole("textbox", { name: /修改原因/ }),
      "暂停 USDT 展示",
    );
    await user.click(within(dialog).getByRole("button", { name: "确认停用" }));

    await waitFor(() => expect(apiMocks.updateToken).toHaveBeenCalledTimes(1));
    expect(apiMocks.updateToken).toHaveBeenCalledWith(12, {
      enabled: false,
      reason: "暂停 USDT 展示",
      expectedVersion: 12,
    });
    expect((await screen.findByRole("status")).textContent).toContain(
      "已停用 USDT",
    );
  });

  it("deletes a tenant row with reason and expectedVersion in the body", async () => {
    apiMocks.deleteToken.mockResolvedValue({
      metadata: { databaseVersion: 13 },
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "删除 CAKE" }));
    const dialog = screen.getByRole("dialog", { name: "删除 CAKE？" });
    await user.type(
      within(dialog).getByRole("textbox", { name: /修改原因/ }),
      "租户不再支持 CAKE",
    );
    await user.click(within(dialog).getByRole("button", { name: "确认删除" }));

    await waitFor(() => expect(apiMocks.deleteToken).toHaveBeenCalledTimes(1));
    expect(apiMocks.deleteToken).toHaveBeenCalledWith(40, {
      reason: "租户不再支持 CAKE",
      expectedVersion: 12,
    });
  });

  it("shows the server message and reloads the list after a version conflict", async () => {
    apiMocks.updateToken.mockRejectedValue(
      new ApiError("version mismatch", 409, "CONFIG_VERSION_CONFLICT"),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "停用 USDT" }));
    const dialog = screen.getByRole("dialog", { name: "停用 USDT？" });
    await user.type(
      within(dialog).getByRole("textbox", { name: /修改原因/ }),
      "暂停 USDT 展示",
    );
    await user.click(within(dialog).getByRole("button", { name: "确认停用" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "配置刚被其他人修改过",
    );
    // 乐观锁冲突后本地版本号已经过期：列表与配置都要重新拉
    await waitFor(() => expect(apiMocks.listTokens).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(apiMocks.config).toHaveBeenCalledTimes(2));
  });
});

describe("TokenPage add token", () => {
  it("validates the address locally and never reaches step three when the chain read fails", async () => {
    apiMocks.previewToken.mockRejectedValue(
      new ApiError("no code at address", 400, "TOKEN_NOT_A_CONTRACT"),
    );
    const user = userEvent.setup();
    renderPage();

    await openCreatePanel(user);
    await readOnchain(user, "0x1234");
    expect(screen.getByText(/40 位十六进制/)).toBeTruthy();
    expect(apiMocks.previewToken).not.toHaveBeenCalled();

    await user.clear(screen.getByRole("textbox", { name: /合约地址/ }));
    await readOnchain(user, "0x0000000000000000000000000000000000000001");

    expect((await screen.findByRole("alert")).textContent).toContain(
      "不是合约",
    );
    expect(apiMocks.previewToken).toHaveBeenCalledWith({
      chain: "bsc",
      contractAddress: "0x0000000000000000000000000000000000000001",
    });
    // 没有链上数据就没有这条记录：既没有第二步的只读字段，也没有第三步
    expect(screen.queryByLabelText("Symbol")).toBeNull();
    expect(screen.queryByRole("button", { name: "下一步" })).toBeNull();
    expect(screen.queryByRole("spinbutton", { name: /展示精度/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "添加到目录" })).toBeNull();
    // 地址还在，改一下就能重试
    expect(
      (screen.getByRole("textbox", { name: /合约地址/ }) as HTMLInputElement)
        .value,
    ).toBe("0x0000000000000000000000000000000000000001");
  });

  it("explains each chain error code in plain words", async () => {
    const cases: Array<[string, RegExp]> = [
      ["TOKEN_CHAIN_MISMATCH", /链与平台节点不匹配/],
      ["TOKEN_CHAIN_UNAVAILABLE", /节点暂时不可用/],
      ["TOKEN_METADATA_INVALID", /symbol 或 decimals 不合法/],
    ];
    const user = userEvent.setup();
    renderPage();
    await openCreatePanel(user);
    await user.type(
      screen.getByRole("textbox", { name: /合约地址/ }),
      "0x0000000000000000000000000000000000000001",
    );

    for (const [code, expected] of cases) {
      apiMocks.previewToken.mockRejectedValueOnce(
        new ApiError("server detail", 400, code),
      );
      await user.click(screen.getByRole("button", { name: "读取链上信息" }));
      await waitFor(() =>
        expect(screen.getByRole("alert").textContent).toMatch(expected),
      );
    }
  });

  it("blocks a token that is already in the catalogue", async () => {
    apiMocks.previewToken.mockResolvedValue(
      preview({ exists: { id: 12, scope: "global" } }),
    );
    const user = userEvent.setup();
    renderPage();

    await openCreatePanel(user);
    await readOnchain(user, usdtAddress);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "该代币已在目录中（全局）",
    );
    expect(
      (screen.getByRole("button", { name: "下一步" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("keeps the colour picker available before a hex value is entered and syncs the text field", async () => {
    apiMocks.previewToken.mockResolvedValue(preview());
    const user = userEvent.setup();
    renderPage();

    await openCreatePanel(user);
    await readOnchain(user, usdtAddress);
    await user.click(screen.getByRole("button", { name: "下一步" }));

    const picker = screen.getByLabelText("图标颜色选择器") as HTMLInputElement;
    expect(picker.type).toBe("color");
    fireEvent.change(picker, { target: { value: "#2775ca" } });
    expect(
      (screen.getByRole("textbox", { name: "图标颜色" }) as HTMLInputElement)
        .value,
    ).toBe("#2775CA");
  });

  it("shows a visible validation summary and focuses the invalid reason instead of appearing unresponsive", async () => {
    apiMocks.previewToken.mockResolvedValue(preview());
    const user = userEvent.setup();
    renderPage();

    await openCreatePanel(user);
    await readOnchain(user, usdtAddress);
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.type(
      screen.getByRole("textbox", { name: "图标颜色" }),
      "#26A17B",
    );
    const reason = screen.getByRole("textbox", { name: /修改原因/ });
    await user.type(reason, "上币");
    await user.click(screen.getByRole("button", { name: "添加到目录" }));

    expect(screen.getByRole("alert").textContent).toContain(
      "请修正表单中的错误后再添加",
    );
    expect(screen.getByText("请填写至少 3 个字符的修改原因。")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(reason));
    expect(apiMocks.createToken).not.toHaveBeenCalled();
  });

  it("reads symbol and decimals from the chain, caps display decimals and sends the create payload", async () => {
    apiMocks.previewToken.mockResolvedValue(preview());
    apiMocks.createToken.mockResolvedValue({
      token: {
        ...tokenList().tokens[1]!,
        id: 55,
        scope: "tenant",
        chain: "eth",
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
        displayDecimals: 2,
      },
      metadata: { databaseVersion: 13 },
    });
    const user = userEvent.setup();
    renderPage();

    await openCreatePanel(user);
    await user.selectOptions(screen.getByRole("combobox", { name: /^链/ }), [
      "eth",
    ]);
    await readOnchain(user, "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");

    // 第二步：symbol / decimals 只读灰显，name 可改
    const symbol = (await screen.findByLabelText("Symbol")) as HTMLInputElement;
    expect(symbol.value).toBe("USDC");
    expect(symbol.readOnly).toBe(true);
    const decimals = screen.getByLabelText("Decimals") as HTMLInputElement;
    expect(decimals.value).toBe("6");
    expect(decimals.readOnly).toBe(true);
    expect(screen.getByText(/^在 App 客户端白名单内/)).toBeTruthy();
    const name = screen.getByRole("textbox", { name: /^名称/ });
    expect((name as HTMLInputElement).disabled).toBe(false);
    await user.clear(name);
    await user.type(name, "USD Coin (Ethereum)");
    expect(apiMocks.previewToken).toHaveBeenCalledWith({
      chain: "eth",
      contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    });

    await user.click(screen.getByRole("button", { name: "下一步" }));

    // 第三步：展示精度默认 min(6, decimals)，上限 = decimals，界面写明只影响显示
    const display = screen.getByRole("spinbutton", {
      name: /展示精度/,
    }) as HTMLInputElement;
    expect(display.value).toBe("6");
    expect(display.max).toBe("6");
    expect(screen.getByText(/只影响显示，不参与金额换算/)).toBeTruthy();
    await user.clear(display);
    await user.type(display, "8");
    // 图标颜色是必填项
    await user.type(
      screen.getByRole("textbox", { name: "图标颜色" }),
      "#2775CA",
    );
    await user.type(
      screen.getByRole("textbox", { name: /修改原因/ }),
      "上线 USDC 交易对",
    );
    await user.click(screen.getByRole("button", { name: "添加到目录" }));
    expect(screen.getByText("展示精度不能超过代币精度 6 位。")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "添加代币？" })).toBeNull();
    expect(apiMocks.createToken).not.toHaveBeenCalled();

    await user.clear(display);
    await user.type(display, "2");
    await user.click(screen.getByRole("button", { name: "添加到目录" }));
    const confirm = await screen.findByRole("dialog", { name: "添加代币？" });
    await user.click(within(confirm).getByRole("button", { name: "确认添加" }));

    await waitFor(() => expect(apiMocks.createToken).toHaveBeenCalledTimes(1));
    const sent = apiMocks.createToken.mock.calls[0]?.[0] as TokenCreateInput;
    // 请求体里没有 symbol / decimals：服务端自己读链回填
    expect(sent).toEqual({
      chain: "eth",
      contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      displayDecimals: 2,
      logoColor: "#2775CA",
      name: "USD Coin (Ethereum)",
      enabled: true,
      sortWeight: 0,
      reason: "上线 USDC 交易对",
      expectedVersion: 12,
    });
    expect(sent).not.toHaveProperty("symbol");
    expect(sent).not.toHaveProperty("decimals");
    expect((await screen.findByRole("status")).textContent).toContain(
      "已添加 USDC",
    );
    await waitFor(() => expect(apiMocks.listTokens).toHaveBeenCalledTimes(2));
  });
});

describe("TokenPage edit token", () => {
  it("keeps chain, address, symbol and decimals read-only and sends only the changed fields", async () => {
    apiMocks.updateToken.mockResolvedValue({
      token: {
        ...tokenList().tokens[1]!,
        id: 61,
        scope: "tenant",
        displayDecimals: 4,
      },
      metadata: { databaseVersion: 13 },
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "编辑 USDT" }));
    const panel = screen.getByRole("dialog", { name: "编辑 USDT" });
    for (const [label, value] of [
      ["链", "BNB Smart Chain（bsc）"],
      ["合约地址", usdtAddress],
      ["Symbol", "USDT"],
      ["Decimals", "18"],
    ] as const) {
      const input = within(panel).getByLabelText(label) as HTMLInputElement;
      expect(input.value).toBe(value);
      expect(input.readOnly).toBe(true);
    }
    expect(
      within(panel).getByRole("button", { name: "重新从链上读取" }),
    ).toBeTruthy();

    const display = within(panel).getByRole("spinbutton", {
      name: /展示精度/,
    }) as HTMLInputElement;
    expect(display.disabled).toBe(false);
    expect(display.max).toBe("18");
    await user.clear(display);
    await user.type(display, "19");
    await user.type(
      within(panel).getByRole("textbox", { name: /修改原因/ }),
      "调整 USDT 展示精度",
    );
    await user.click(within(panel).getByRole("button", { name: "保存修改" }));
    expect(
      within(panel).getByText("展示精度不能超过代币精度 18 位。"),
    ).toBeTruthy();
    expect(apiMocks.updateToken).not.toHaveBeenCalled();

    await user.clear(display);
    await user.type(display, "4");
    await user.click(within(panel).getByRole("button", { name: "保存修改" }));
    const confirm = await screen.findByRole("dialog", {
      name: "保存 USDT 的修改？",
    });
    await user.click(within(confirm).getByRole("button", { name: "确认保存" }));

    await waitFor(() => expect(apiMocks.updateToken).toHaveBeenCalledTimes(1));
    const [id, sent] = apiMocks.updateToken.mock.calls[0] as [
      number,
      TokenUpdateInput,
    ];
    expect(id).toBe(12);
    // 只发改过的字段；symbol / decimals / chain / address 永远不在请求体里
    expect(sent).toEqual({
      displayDecimals: 4,
      reason: "调整 USDT 展示精度",
      expectedVersion: 12,
    });
    expect((await screen.findByRole("status")).textContent).toContain(
      "本租户对 USDT 的覆盖行",
    );
  });

  it("hides the chain re-read for native coins", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "编辑 BNB" }));
    const panel = screen.getByRole("dialog", { name: "编辑 BNB" });
    expect(
      (within(panel).getByLabelText("合约地址") as HTMLInputElement).value,
    ).toContain("原生币");
    expect(
      within(panel).queryByRole("button", { name: "重新从链上读取" }),
    ).toBeNull();
  });

  it("disables the chain re-read for platform-global rows and says why", async () => {
    // 服务端对全局行（及其租户覆盖行）的 resync 一律 403：按钮提前禁用，不给一个必然失败的确认框
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "编辑 USDT" }));
    const panel = screen.getByRole("dialog", { name: "编辑 USDT" });

    expect(
      (
        within(panel).getByRole("button", {
          name: "重新从链上读取",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(within(panel).getByText(/链上元数据由平台维护/)).toBeTruthy();
    expect(apiMocks.resyncToken).not.toHaveBeenCalled();
  });

  it("confirms with old and new values before writing a chain re-read", async () => {
    apiMocks.resyncToken
      .mockResolvedValueOnce({
        changed: true,
        current: { symbol: "CAKE", decimals: 18 },
        onchain: { symbol: "CAKE", decimals: 6 },
      })
      .mockResolvedValueOnce({
        changed: true,
        token: { ...tokenList().tokens[2]!, decimals: 6, displayDecimals: 2 },
        metadata: { databaseVersion: 13 },
      });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "编辑 CAKE" }));
    const panel = screen.getByRole("dialog", { name: "编辑 CAKE" });
    // 重新读取也写审计，所以先要原因
    await user.click(
      within(panel).getByRole("button", { name: "重新从链上读取" }),
    );
    expect(within(panel).getByText(/至少 3 个字符/)).toBeTruthy();
    expect(apiMocks.resyncToken).not.toHaveBeenCalled();

    await user.type(
      within(panel).getByRole("textbox", { name: /修改原因/ }),
      "核对链上精度",
    );
    await user.click(
      within(panel).getByRole("button", { name: "重新从链上读取" }),
    );

    const diff = await screen.findByRole("dialog", {
      name: "链上数据与目录不一致",
    });
    expect(apiMocks.resyncToken).toHaveBeenCalledTimes(1);
    expect(apiMocks.resyncToken).toHaveBeenCalledWith(40, {
      reason: "核对链上精度",
      expectedVersion: 12,
      confirm: false,
    });
    expect(
      within(diff).getByTestId("resync-onchain-decimals").textContent,
    ).toBe("6");
    expect(within(diff).getByText("18")).toBeTruthy();

    await user.click(
      within(diff).getByRole("button", { name: "按链上数据更新" }),
    );

    await waitFor(() => expect(apiMocks.resyncToken).toHaveBeenCalledTimes(2));
    expect(apiMocks.resyncToken).toHaveBeenLastCalledWith(40, {
      reason: "核对链上精度",
      expectedVersion: 12,
      confirm: true,
    });
    // 只读字段跟着链上值走
    await waitFor(() =>
      expect(
        (within(panel).getByLabelText("Decimals") as HTMLInputElement).value,
      ).toBe("6"),
    );
    expect(within(panel).getByText(/已按链上数据更新/)).toBeTruthy();
  });

  it("tells the operator when the chain matches the catalogue", async () => {
    apiMocks.resyncToken.mockResolvedValue({
      changed: false,
      token: tokenList().tokens[2]!,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "编辑 CAKE" }));
    const panel = screen.getByRole("dialog", { name: "编辑 CAKE" });
    await user.type(
      within(panel).getByRole("textbox", { name: /修改原因/ }),
      "核对链上精度",
    );
    await user.click(
      within(panel).getByRole("button", { name: "重新从链上读取" }),
    );

    expect(
      (await within(panel).findByText(/链上数据与目录一致/)).textContent,
    ).toBeTruthy();
    expect(
      screen.queryByRole("dialog", { name: "链上数据与目录不一致" }),
    ).toBeNull();
    expect(apiMocks.resyncToken).toHaveBeenCalledTimes(1);
  });
});
