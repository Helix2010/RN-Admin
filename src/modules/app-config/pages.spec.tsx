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

import { AppConfigPage } from "./pages";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const light = {
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

const dark: typeof light = {
  primary: "#AFC6FF",
  onPrimary: "#082B78",
  background: "#0B1220",
  surface: "#121C2D",
  surfaceVariant: "#1D2A3E",
  text: "#F0F4FA",
  textMuted: "#A9B7CA",
  border: "#35445A",
  success: "#61D6A3",
  warning: "#F4BD68",
  danger: "#FFB4AB",
  info: "#A8CAFF",
  pricePositive: "#5CDBA8",
  priceNegative: "#FF7B86",
  risk: "#F4BD68",
  focus: "#AFC6FF",
  backdrop: "rgba(0, 0, 0, 0.72)",
};

function managedConfig(): ManagedAppConfig {
  return {
    configVersion: "2026.08.27.1",
    ttlSeconds: 300,
    localization: {
      fallbackLocale: "zh-CN",
      supportedLocales: ["zh-CN", "en-US"],
      messagesVersion: "1",
      messages: {
        "zh-CN": { "app.name": "AnyFun" },
        "en-US": { "app.name": "AnyFun" },
      },
    },
    theme: {
      defaultMode: "system",
      allowUserOverride: true,
      paletteVersion: "ocean-1",
      light,
      dark,
    },
    features: {
      updateCenter: true,
      otaEnabled: true,
      directUpdateEnabled: true,
      diagnosticsEnabled: true,
    },
    updatePolicy: {
      minSupportedVersion: "1.0.0",
      latestVersion: "1.1.0",
      otaChannel: "production",
    },
    support: { statusPageUrl: "https://status.anyfun.win" },
  };
}

function configView(): AppConfig {
  const config = managedConfig();
  return {
    summary: {
      configVersion: config.configVersion,
      localization: {
        supportedLocales: config.localization.supportedLocales,
        messagesVersion: config.localization.messagesVersion,
      },
      theme: {
        paletteVersion: config.theme.paletteVersion,
        modes: ["light", "dark"],
      },
      featureFlags: [],
      updatePolicy: { source: "mysql", approvalRequired: false },
    },
    config,
    metadata: {
      databaseVersion: 3,
      updatedBy: "admin",
      updatedAt: "2026-08-27T00:00:00Z",
    },
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <AppConfigPage
        tenantId="tenant-a"
        tenantName="Tenant A"
        onNavigate={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("AppConfigPage theme workbench", () => {
  it("previews palette edits and uses the progressive save workflow", async () => {
    apiMocks.config.mockResolvedValue(configView());
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "编辑配置" }));
    expect(screen.getByText("App 首页预览")).toBeTruthy();
    expect(screen.queryByText("修改原因")).toBeNull();

    const primaryInput = screen.getByRole("textbox", { name: "浅色主品牌色" });
    await user.clear(primaryInput);
    await user.type(primaryInput, "#ff5500");
    expect(
      screen.getByTestId("app-theme-preview").getAttribute("style"),
    ).toContain("--preview-primary: #ff5500");

    await user.click(screen.getByRole("tab", { name: "深色主题" }));
    expect(
      (
        screen.getByRole("textbox", {
          name: "深色主品牌色",
        }) as HTMLInputElement
      ).value,
    ).toBe("#AFC6FF");

    await user.click(screen.getByRole("button", { name: "保存配置" }));
    expect(screen.getByText("保存并激活应用配置")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "继续确认" }));
    expect(screen.getByText("请填写至少 3 个字符的修改原因。")).toBeTruthy();
    await user.type(
      screen.getByPlaceholderText("例如：调整生产环境主题并更新 OTA 渠道"),
      "调整品牌主题色",
    );
    await user.click(screen.getByRole("button", { name: "继续确认" }));
    expect(
      await screen.findByRole("dialog", { name: "激活应用配置？" }),
    ).toBeTruthy();
  });
});
