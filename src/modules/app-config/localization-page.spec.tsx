// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalizationView } from "../../core/api";

const apiMocks = vi.hoisted(() => ({
  localization: vi.fn(),
  saveLocalizationLanguages: vi.fn(),
  saveLocalizationDocuments: vi.fn(),
  publishLocalization: vi.fn(),
}));

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, adminApi: apiMocks };
});

import { documentPayload } from "./localization-draft";
import { LocalizationPage } from "./localization-page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function localizationView(): LocalizationView {
  return {
    settings: {
      schemaVersion: 2,
      fallbackLanguage: "en-US",
      refreshIntervalSeconds: 21600,
      languages: {
        "en-US": {
          label: "English",
          nativeName: "English",
          enabled: true,
          direction: "ltr",
          sort: 1,
          source: "global",
          publishStatus: "published",
          resource: {
            version: "260827090000",
            objectKey: "localization/0/en-US/package.json",
            fileUrl: "/v1/mobile/languages/en-US/document?v=260827090000",
            sha256: "abc123",
            size: 1024,
            publishedAt: "2026-08-27T09:00:00Z",
          },
        },
        "zh-CN": {
          label: "简体中文",
          nativeName: "简体中文",
          enabled: true,
          direction: "ltr",
          sort: 2,
          source: "global",
          publishStatus: "published",
          resource: null,
        },
      },
    },
    documents: {
      total: 1,
      items: [
        {
          key: "common.confirm",
          meta: "common",
          enabled: true,
          values: {
            "en-US": {
              content: "Confirm",
              source: "global",
              missing: false,
            },
            "zh-CN": {
              content: "确认",
              source: "tenant",
              missing: false,
            },
          },
        },
      ],
    },
    metadata: {
      globalVersion: 2,
      tenantVersion: 3,
      inherited: false,
      updatedBy: "admin",
      updatedAt: "2026-08-26T00:00:00Z",
    },
  };
}

describe("documentPayload", () => {
  it("does not submit unchanged tenant documents again", () => {
    const original = localizationView();
    const draft = structuredClone(original);

    expect(documentPayload(draft, original)).toEqual([]);
  });

  it("submits only the language value that changed", () => {
    const original = localizationView();
    const draft = structuredClone(original);
    draft.documents.items[0]!.values["en-US"]!.content = "Continue";

    expect(documentPayload(draft, original)).toEqual([
      {
        key: "common.confirm",
        meta: "common",
        values: { "en-US": "Continue" },
      },
    ]);
  });

  it("submits null when a tenant override is cleared", () => {
    const original = localizationView();
    const draft = structuredClone(original);
    draft.documents.items[0]!.values["zh-CN"]!.content = "";

    expect(documentPayload(draft, original)[0]?.values).toEqual({
      "zh-CN": null,
    });
  });

  it("ignores an empty new language but submits its entered content", () => {
    const original = localizationView();
    const draft = structuredClone(original);
    draft.documents.items[0]!.values["ja-JP"] = {
      content: "",
      source: "missing",
      missing: true,
    };

    expect(documentPayload(draft, original)).toEqual([]);

    draft.documents.items[0]!.values["ja-JP"]!.content = "確認";
    expect(documentPayload(draft, original)[0]?.values).toEqual({
      "ja-JP": "確認",
    });
  });

  it("normalizes a new key and includes create and enabled changes", () => {
    const original = localizationView();
    const draft = structuredClone(original);
    draft.documents.items.push({
      key: "Wallet.Connect",
      meta: "wallet",
      enabled: true,
      values: {
        "en-US": { content: "Connect", source: "tenant", missing: false },
        "zh-CN": { content: "连接", source: "tenant", missing: false },
      },
    });
    draft.documents.items[0]!.enabled = false;

    expect(documentPayload(draft, original)).toEqual([
      {
        key: "common.confirm",
        meta: "common",
        enabled: false,
        values: {},
      },
      {
        key: "wallet.connect",
        meta: "wallet",
        create: true,
        values: { "en-US": "Connect", "zh-CN": "连接" },
      },
    ]);
  });
});

describe("LocalizationPage draft workflow", () => {
  it("shows stable language indexes and exposes published resource actions", async () => {
    apiMocks.localization.mockResolvedValue(localizationView());
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    render(
      <QueryClientProvider client={queryClient}>
        <LocalizationPage
          tenantId="tenant-a"
          tenantName="Tenant A"
          onNavigate={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const resourceLink = await screen.findByRole("link", { name: "en-US" });
    expect(resourceLink.getAttribute("href")).toBe(
      "http://localhost:3000/v1/mobile/languages/en-US/document?v=260827090000",
    );
    expect(resourceLink.getAttribute("target")).toBe("_blank");
    expect(
      resourceLink.closest("tr")?.querySelector(".message-index-column")
        ?.textContent,
    ).toBe("1");
    await user.click(
      screen.getByRole("button", { name: "复制 en-US 语言包链接" }),
    );
    expect(writeText).toHaveBeenCalledWith(
      "http://localhost:3000/v1/mobile/languages/en-US/document?v=260827090000",
    );
    expect(screen.getByText("已复制 en-US 语言包链接。")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "复制 zh-CN 语言包链接",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("keeps manual edits local until the administrator saves the draft", async () => {
    const initial = localizationView();
    const saved = structuredClone(initial);
    saved.documents.items[0]!.values["en-US"] = {
      content: "Continue",
      source: "tenant",
      missing: false,
    };
    saved.settings.languages["en-US"]!.publishStatus = "draft";
    apiMocks.localization.mockResolvedValue(initial);
    apiMocks.saveLocalizationDocuments.mockResolvedValue(saved);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <LocalizationPage
          tenantId="tenant-a"
          tenantName="Tenant A"
          onNavigate={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.queryByText("修改原因")).toBeNull();
    await user.click(await screen.findByRole("button", { name: "编辑多语言" }));
    expect(
      screen.getByText(/手动输入或导入 Excel：只修改当前浏览器草稿/),
    ).toBeTruthy();

    const englishInput = screen.getByDisplayValue("Confirm");
    await user.clear(englishInput);
    await user.type(englishInput, "Continue");
    expect(
      screen.getByText("修改仍在当前浏览器草稿中，尚未写入数据库。"),
    ).toBeTruthy();
    expect(apiMocks.saveLocalizationDocuments).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "保存草稿" }));
    expect(screen.getByText("保存多语言草稿")).toBeTruthy();
    await user.type(
      screen.getByPlaceholderText("例如：新增日语并修正文案"),
      "修正英文按钮文案",
    );
    await user.click(screen.getByRole("button", { name: "继续确认" }));
    await user.click(screen.getByRole("button", { name: "确认保存" }));

    await waitFor(() =>
      expect(apiMocks.saveLocalizationDocuments).toHaveBeenCalledWith(
        [
          {
            key: "common.confirm",
            meta: "common",
            values: { "en-US": "Continue" },
          },
        ],
        "修正英文按钮文案",
      ),
    );
    expect(apiMocks.saveLocalizationLanguages).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        "已保存为租户草稿，尚未生成 App 使用的发布资源。",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "发布当前草稿" })).toBeTruthy();
    expect(screen.queryByText("修改原因")).toBeNull();
  });

  it("shows the full reason form only after choosing a publish action", async () => {
    apiMocks.localization.mockResolvedValue(localizationView());
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <LocalizationPage
          tenantId="tenant-a"
          tenantName="Tenant A"
          onNavigate={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.queryByRole("button", { name: "重新发布资源" })).toBeNull();
    expect(screen.queryByText("修改原因")).toBeNull();
    await user.click(await screen.findByRole("button", { name: "编辑多语言" }));
    expect(screen.getByRole("button", { name: "重新发布资源" })).toBeTruthy();
    expect(screen.queryByText("修改原因")).toBeNull();

    await user.click(screen.getByRole("button", { name: "重新发布资源" }));
    expect(screen.getByText("重新发布语言资源")).toBeTruthy();
    expect(screen.getByText("修改原因")).toBeTruthy();
    expect(screen.getByRole("button", { name: "继续确认" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "继续确认" }));
    const reasonInput = screen.getByPlaceholderText("例如：新增日语并修正文案");
    expect(reasonInput.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("请填写至少 3 个字符的修改原因。")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "收起" }));
    expect(screen.queryByText("修改原因")).toBeNull();
  });

  it("adds a lowercase unique key in the side panel without saving immediately", async () => {
    apiMocks.localization.mockResolvedValue(localizationView());
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <LocalizationPage
          tenantId="tenant-a"
          tenantName="Tenant A"
          onNavigate={vi.fn()}
        />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "编辑多语言" }));
    await user.click(screen.getByRole("button", { name: "添加文案" }));
    const keyInput = screen.getByPlaceholderText("例如 wallet.connect");
    await user.type(keyInput, "Wallet.Connect");
    expect((keyInput as HTMLInputElement).value).toBe("wallet.connect");
    await user.type(
      screen.getByPlaceholderText("填写 English 文案"),
      "Connect",
    );
    await user.click(screen.getByRole("button", { name: "加入草稿" }));

    expect(screen.getByText("wallet.connect")).toBeTruthy();
    expect(screen.getByRole("button", { name: "移除" })).toBeTruthy();
    expect(apiMocks.saveLocalizationDocuments).not.toHaveBeenCalled();
  });

  it("searches by key and any language value", async () => {
    const initial = localizationView();
    initial.documents.items.push({
      key: "wallet.connect",
      meta: "wallet",
      enabled: true,
      values: {
        "en-US": {
          content: "Connect wallet",
          source: "global",
          missing: false,
        },
        "zh-CN": { content: "连接钱包", source: "global", missing: false },
      },
    });
    initial.documents.total = 2;
    apiMocks.localization.mockResolvedValue(initial);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <LocalizationPage
          tenantId="tenant-a"
          tenantName="Tenant A"
          onNavigate={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const search =
      await screen.findByPlaceholderText("搜索 Key 或任意语言文案");
    await user.type(search, "不存在");
    expect(screen.getByText("没有匹配的多语言文案")).toBeTruthy();
    await user.clear(search);
    await user.type(search, "连接钱包");
    const keyCell = screen.getByText("wallet.connect");
    expect(keyCell).toBeTruthy();
    expect(
      keyCell.closest("tr")?.querySelector(".message-index-column")
        ?.textContent,
    ).toBe("2");
  });
});
