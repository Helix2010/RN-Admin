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
          resource: null,
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
});

describe("LocalizationPage draft workflow", () => {
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

    await user.type(
      screen.getByPlaceholderText("例如：新增日语并修正文案"),
      "修正英文按钮文案",
    );
    await user.click(screen.getByRole("button", { name: "保存草稿" }));
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
  });
});
