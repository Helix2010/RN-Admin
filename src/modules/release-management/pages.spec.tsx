// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OtaPage, ReleaseManagementPage, ReleasesPage } from "./pages";

const apiMocks = vi.hoisted(() => ({
  releases: vi.fn(),
  localization: vi.fn(),
  action: vi.fn(),
  createReleaseArtifactUpload: vi.fn(),
  createReleaseFromArtifact: vi.fn(),
  deleteReleaseArtifact: vi.fn(),
  uploadArtifactFile: vi.fn(),
  otaReleases: vi.fn(),
  otaBaseReleases: vi.fn(),
  createOtaArtifactUpload: vi.fn(),
  deleteOtaArtifact: vi.fn(),
  createOtaRelease: vi.fn(),
  otaAction: vi.fn(),
}));

vi.mock("../../core/api", () => ({
  adminApi: apiMocks,
  publicApiUrl: (path: string) => `https://api.example.com${path}`,
  uploadArtifactFile: apiMocks.uploadArtifactFile,
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,qr") },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  apiMocks.localization.mockResolvedValue({
    settings: {
      schemaVersion: 2,
      fallbackLanguage: "zh-CN",
      refreshIntervalSeconds: 21600,
      languages: {
        "zh-CN": {
          label: "简体中文",
          nativeName: "简体中文",
          enabled: true,
          direction: "ltr",
          sort: 1,
          source: "global",
          publishStatus: "published",
        },
        "en-US": {
          label: "English",
          nativeName: "English",
          enabled: true,
          direction: "ltr",
          sort: 2,
          source: "global",
          publishStatus: "published",
        },
        "ja-JP": {
          label: "Japanese",
          nativeName: "日本語",
          enabled: true,
          direction: "ltr",
          sort: 3,
          source: "tenant",
          publishStatus: "published",
        },
      },
    },
    documents: { items: [], total: 0 },
    tenantVersion: 1,
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReleasesPage
        tenantId="tenant-a"
        tenantName="Tenant A"
        onNavigate={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

function renderOtaPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OtaPage tenantId="tenant-a" tenantName="Tenant A" onNavigate={vi.fn()} />
    </QueryClientProvider>,
  );
}

function renderReleaseManagementPage() {
  apiMocks.localization.mockResolvedValue({
    settings: {
      schemaVersion: 2,
      fallbackLanguage: "zh-CN",
      refreshIntervalSeconds: 21600,
      languages: {},
    },
    documents: { items: [], total: 0 },
    tenantVersion: 1,
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReleaseManagementPage
        tenantId="tenant-a"
        tenantName="Tenant A"
        onNavigate={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("ReleasesPage actions", () => {
  it("opens the OTA tab with the selected APK as context", async () => {
    apiMocks.releases.mockResolvedValue({
      items: [
        {
          id: "release-base",
          platform: "android",
          version: "1.2.0",
          buildNumber: 10,
          runtimeVersion: "fingerprint-a",
          status: "active",
          releaseNotes: { "zh-CN": ["稳定版本"] },
          createdAt: "2026-08-28T00:00:00Z",
          updatedAt: "2026-08-28T00:00:00Z",
          lastAction: "publish",
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
    apiMocks.otaReleases.mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
    apiMocks.otaBaseReleases.mockResolvedValue({ items: [] });
    const user = userEvent.setup();
    renderReleaseManagementPage();

    await user.click(await screen.findByRole("button", { name: "查看 OTA" }));

    expect(window.location.pathname).toBe("/releases");
    expect(window.location.search).toBe(
      "?tab=ota&baseReleaseId=release-base&platform=android",
    );
    expect(
      await screen.findByRole("heading", { name: "OTA 热更新" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("tab", { name: "OTA 热更新" })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("opens a QR code share dialog for an active release", async () => {
    apiMocks.releases.mockResolvedValue({
      items: [
        {
          id: "release-active",
          platform: "android",
          version: "1.0.1",
          buildNumber: 2,
          runtimeVersion: "expo:57.0.15",
          status: "active",
          releaseNotes: { "zh-CN": ["可扫码测试"] },
          fileName: "AnyFun-Foundation-1.0.1-build2.apk",
          createdAt: "2026-08-25T00:00:00Z",
          updatedAt: "2026-08-25T00:00:00Z",
          lastAction: "publish",
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "二维码" }));

    expect(
      await screen.findByRole("dialog", { name: "扫码安装" }),
    ).toBeTruthy();
    expect(
      screen.getByDisplayValue(
        "https://api.example.com/v1/public/releases/release-active/download",
      ),
    ).toBeTruthy();
    expect(screen.getByAltText("1.0.1 build 2 安装二维码")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "回滚" })).toBeNull();
  });

  it("submits the administrator reason for a verified release", async () => {
    apiMocks.releases.mockResolvedValue({
      items: [
        {
          id: "release-1",
          platform: "android",
          version: "1.2.0",
          buildNumber: 120,
          runtimeVersion: "expo:57.0.15",
          status: "verified",
          releaseNotes: { "zh-CN": ["修复问题"] },
          createdAt: "2026-08-25T00:00:00Z",
          updatedAt: "2026-08-25T00:00:00Z",
          lastAction: null,
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
    apiMocks.action.mockResolvedValue({
      release: { id: "release-1", status: "active" },
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "发布到官网" }));
    await user.type(
      screen.getByRole("textbox", { name: "操作原因" }),
      "确认安装包签名和安装测试完成",
    );
    await user.click(screen.getByRole("button", { name: "继续确认" }));
    await user.click(screen.getByRole("button", { name: "确认发布到官网" }));

    expect(apiMocks.action).toHaveBeenCalledWith(
      "tenant-a",
      "release-1",
      "publish",
      "确认安装包签名和安装测试完成",
    );
  });

  it("uploads immediately, then saves a verified release without publishing it", async () => {
    apiMocks.releases.mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
    apiMocks.createReleaseArtifactUpload.mockResolvedValue({
      artifact: {
        id: "artifact-1",
        token: "artifact-token",
        fileName: "dex-1.3.0.apk",
        contentType: "application/vnd.android.package-archive",
        size: 10,
        objectKey:
          "tenants/tenant-a/release-uploads/artifact-1/application.apk",
        expiresAt: "2026-08-25T00:15:00Z",
      },
      upload: {
        method: "PUT",
        url: "https://storage.example/upload",
        headers: { "content-type": "application/vnd.android.package-archive" },
        expiresAt: "2026-08-25T00:15:00Z",
        requiresCredentials: true,
      },
    });
    apiMocks.uploadArtifactFile.mockResolvedValue(undefined);
    apiMocks.createReleaseFromArtifact.mockResolvedValue({
      release: {
        id: "release-1",
        version: "1.3.0",
        buildNumber: 130,
        status: "verified",
      },
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "上传 APK" }));
    await user.type(screen.getByPlaceholderText("1.2.0"), "1.3.0");
    await user.type(screen.getByPlaceholderText("120"), "130");
    const apk = new File(["signed-apk"], "dex-1.3.0.apk", {
      type: "application/vnd.android.package-archive",
    });
    await user.upload(screen.getByLabelText("APK 安装包文件选择"), apk);
    await user.click(await screen.findByRole("tab", { name: "English" }));
    await user.type(
      screen.getByLabelText("en-US 发布说明"),
      "Improve stability",
    );
    await user.click(screen.getByRole("tab", { name: "日本語" }));
    await user.type(screen.getByLabelText("ja-JP 发布说明"), "安定性を改善");

    await waitFor(() => {
      expect(apiMocks.createReleaseArtifactUpload).toHaveBeenCalledWith(
        "tenant-a",
        expect.objectContaining({
          fileName: "dex-1.3.0.apk",
          size: 10,
        }),
      );
    });
    expect(apiMocks.uploadArtifactFile).toHaveBeenCalledWith(
      expect.objectContaining({ method: "PUT" }),
      apk,
      expect.any(Function),
      expect.any(AbortSignal),
    );
    await user.click(
      await screen.findByRole("button", { name: "保存发布记录" }),
    );
    await waitFor(() =>
      expect(apiMocks.createReleaseFromArtifact).toHaveBeenCalledWith(
        "tenant-a",
        expect.objectContaining({
          artifactToken: "artifact-token",
          platform: "android",
          version: "1.3.0",
          buildNumber: 130,
          releaseNotes: {
            "zh-CN": ["修复已知问题并优化体验"],
            "en-US": ["Improve stability"],
            "ja-JP": ["安定性を改善"],
          },
        }),
      ),
    );
    expect(apiMocks.action).not.toHaveBeenCalled();
  });
});

describe("OtaPage", () => {
  it("uploads after a base APK is selected and saves a verified draft", async () => {
    apiMocks.otaReleases.mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
    apiMocks.otaBaseReleases.mockResolvedValue({
      items: [
        {
          id: "release-base",
          platform: "android",
          version: "1.1.1",
          buildNumber: 5,
          runtimeVersion: "fingerprint-a",
          status: "active",
        },
      ],
    });
    apiMocks.createOtaArtifactUpload.mockResolvedValue({
      artifact: {
        id: "ota-artifact",
        token: "ota-token",
        fileName: "ota.zip",
        contentType: "application/zip",
        size: 10,
        objectKey: "tenants/tenant-a/ota-uploads/ota-artifact.zip",
        expiresAt: "2026-08-28T01:00:00Z",
      },
      upload: {
        method: "PUT",
        url: "https://storage.example/ota",
        headers: { "content-type": "application/zip" },
        expiresAt: "2026-08-28T01:00:00Z",
        requiresCredentials: true,
      },
    });
    apiMocks.uploadArtifactFile.mockResolvedValue(undefined);
    apiMocks.createOtaRelease.mockResolvedValue({
      release: { id: "ota-1", status: "verified" },
    });
    const user = userEvent.setup();
    renderOtaPage();

    await user.click(await screen.findByRole("button", { name: "上传 OTA" }));
    await user.selectOptions(
      await screen.findByLabelText("基线 APK"),
      "release-base",
    );
    await user.click(screen.getByRole("radio", { name: /立即重启生效/ }));
    const otaFile = new File(["ota-package"], "ota.zip", {
      type: "application/zip",
    });
    await user.upload(screen.getByLabelText("OTA 资源包文件选择"), otaFile);

    await waitFor(() =>
      expect(apiMocks.createOtaArtifactUpload).toHaveBeenCalledWith(
        "tenant-a",
        expect.objectContaining({
          baseReleaseId: "release-base",
          channel: "production",
          fileName: "ota.zip",
        }),
      ),
    );
    await user.click(
      await screen.findByRole("button", { name: "保存为待发布" }),
    );
    await waitFor(() =>
      expect(apiMocks.createOtaRelease).toHaveBeenCalledWith(
        "tenant-a",
        expect.objectContaining({
          artifactToken: "ota-token",
          baseReleaseId: "release-base",
          channel: "production",
          applyStrategy: "immediate",
        }),
      ),
    );
    expect(apiMocks.otaAction).not.toHaveBeenCalled();
  });

  it("publishes from the list only after reason and custom confirmation", async () => {
    apiMocks.otaBaseReleases.mockResolvedValue({ items: [] });
    apiMocks.otaReleases.mockResolvedValue({
      items: [
        {
          id: "ota-1",
          baseReleaseId: "release-base",
          baseRelease: {
            id: "release-base",
            platform: "android",
            version: "1.1.1",
            buildNumber: 5,
            runtimeVersion: "fingerprint-a",
            status: "active",
          },
          platform: "android",
          channel: "production",
          runtimeVersion: "fingerprint-a",
          revision: 1,
          updateId: "update-1",
          status: "verified",
          releaseNotes: { "zh-CN": ["修复问题"] },
          createdAt: "2026-08-28T00:00:00Z",
          updatedAt: "2026-08-28T00:00:00Z",
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
    apiMocks.otaAction.mockResolvedValue({
      release: { id: "ota-1", status: "active" },
    });
    const user = userEvent.setup();
    renderOtaPage();

    await user.click(await screen.findByRole("button", { name: "发布 OTA" }));
    await user.type(screen.getByLabelText("操作原因"), "真机验证已经完成");
    await user.click(screen.getByRole("button", { name: "继续确认" }));
    await user.click(screen.getByRole("button", { name: "确认操作" }));

    expect(apiMocks.otaAction).toHaveBeenCalledWith(
      "tenant-a",
      "ota-1",
      "publish",
      "真机验证已经完成",
    );
  });
});
