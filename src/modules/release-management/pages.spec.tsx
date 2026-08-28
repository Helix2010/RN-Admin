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
  uploadUploadSessionPart: vi.fn(),
  uploadArtifactFile: vi.fn(),
  createUploadSession: vi.fn(),
  getUploadSession: vi.fn(),
  completeUploadSession: vi.fn(),
  deleteUploadSession: vi.fn(),
  otaReleases: vi.fn(),
  otaReleaseDetail: vi.fn(),
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
  uploadUploadSessionPart: apiMocks.uploadUploadSessionPart,
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,qr") },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
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
  it("sorts releases by descending build and shows stable row numbers", async () => {
    apiMocks.releases.mockResolvedValue({
      items: [
        {
          id: "release-old",
          platform: "android",
          version: "1.1.0",
          buildNumber: 4,
          runtimeVersion: "runtime-old",
          status: "verified",
          releaseNotes: { "zh-CN": ["旧版本"] },
          createdAt: "2026-08-28T00:00:00Z",
          updatedAt: "2026-08-28T01:00:00Z",
          lastAction: null,
        },
        {
          id: "release-new",
          platform: "android",
          version: "1.1.2",
          buildNumber: 6,
          runtimeVersion: "runtime-new",
          status: "active",
          releaseNotes: { "zh-CN": ["新版本"] },
          createdAt: "2026-08-28T00:00:00Z",
          updatedAt: "2026-08-28T00:30:00Z",
          lastAction: "publish",
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
    renderPage();

    const rows = await screen.findAllByRole("row");
    expect(rows[0]?.textContent).toContain("序号");
    expect(rows[1]?.textContent).toContain("1v1.1.2");
    expect(rows[2]?.textContent).toContain("2v1.1.0");
  });

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
    apiMocks.createUploadSession.mockResolvedValue({
      session: {
        id: "upload-1",
        uploadType: "apk",
        fileName: "dex-1.3.0.apk",
        contentType: "application/vnd.android.package-archive",
        size: 10,
        partSize: 16 * 1024 * 1024,
        totalParts: 1,
        status: "active",
        expiresAt: "2026-08-25T02:00:00Z",
        uploadedParts: [],
      },
    });
    apiMocks.uploadUploadSessionPart.mockImplementation(
      async (_session, partNumber, blob, onProgress) => {
        onProgress(blob.size, blob.size);
        return { partNumber, etag: "etag-1", size: blob.size };
      },
    );
    apiMocks.completeUploadSession.mockResolvedValue({
      artifact: {
        id: "artifact-1",
        token: "artifact-token",
        fileName: "dex-1.3.0.apk",
        contentType: "application/vnd.android.package-archive",
        size: 10,
        objectKey:
          "tenants/tenant-a/release-uploads/artifact-1/application.apk",
        expiresAt: "2026-08-25T02:00:00Z",
      },
    });
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
      expect(apiMocks.createUploadSession).toHaveBeenCalledWith(
        "tenant-a",
        expect.objectContaining({
          uploadType: "apk",
          fileName: "dex-1.3.0.apk",
          size: 10,
          partSize: 16 * 1024 * 1024,
        }),
      );
    });
    expect(apiMocks.createUploadSession.mock.calls[0]?.[1]).not.toHaveProperty(
      "fingerprint",
    );
    expect(apiMocks.uploadUploadSessionPart).toHaveBeenCalledWith(
      expect.objectContaining({ id: "upload-1" }),
      1,
      expect.any(Blob),
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(apiMocks.completeUploadSession).toHaveBeenCalledWith(
      "tenant-a",
      "upload-1",
      [expect.objectContaining({ partNumber: 1, etag: "etag-1" })],
      undefined,
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

  it("resumes a persisted multipart session and skips completed parts", async () => {
    apiMocks.releases.mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
    apiMocks.getUploadSession.mockResolvedValue({
      session: {
        id: "upload-resume",
        token: "session-token",
        uploadType: "apk",
        fileName: "resume.apk",
        contentType: "application/vnd.android.package-archive",
        size: 10,
        partSize: 5,
        totalParts: 2,
        status: "active",
        expiresAt: "2026-08-25T02:00:00Z",
        uploadedParts: [{ partNumber: 1, etag: "etag-1", size: 5 }],
      },
    });
    apiMocks.uploadUploadSessionPart.mockResolvedValue({
      partNumber: 2,
      etag: "etag-2",
      size: 5,
    });
    apiMocks.completeUploadSession.mockResolvedValue({
      artifact: {
        id: "artifact-resume",
        token: "artifact-token",
        fileName: "resume.apk",
        contentType: "application/vnd.android.package-archive",
        size: 10,
        objectKey: "tenants/tenant-a/upload-sessions/upload-resume/payload.apk",
        expiresAt: "2026-08-25T02:00:00Z",
      },
    });
    const apk = new File(["0123456789"], "resume.apk", {
      type: "application/vnd.android.package-archive",
      lastModified: 1,
    });
    window.localStorage.setItem(
      "rn-admin:apk-upload:tenant-a:resume.apk:10:1",
      JSON.stringify({ id: "upload-resume", token: "session-token" }),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "上传 APK" }));
    await user.upload(screen.getByLabelText("APK 安装包文件选择"), apk);

    await waitFor(() =>
      expect(apiMocks.getUploadSession).toHaveBeenCalledWith(
        "tenant-a",
        "upload-resume",
        "session-token",
      ),
    );
    expect(apiMocks.createUploadSession).not.toHaveBeenCalled();
    expect(apiMocks.uploadUploadSessionPart).toHaveBeenCalledTimes(1);
    expect(apiMocks.uploadUploadSessionPart).toHaveBeenCalledWith(
      expect.objectContaining({ id: "upload-resume" }),
      2,
      expect.any(Blob),
      expect.any(Function),
      expect.any(AbortSignal),
    );
    await waitFor(() =>
      expect(apiMocks.completeUploadSession).toHaveBeenCalledWith(
        "tenant-a",
        "upload-resume",
        [
          { partNumber: 1, etag: "etag-1", size: 5 },
          { partNumber: 2, etag: "etag-2", size: 5 },
        ],
        "session-token",
      ),
    );
  });
});

describe("OtaPage", () => {
  it("sorts OTA records by descending revision", async () => {
    apiMocks.otaBaseReleases.mockResolvedValue({ items: [] });
    const record = (id: string, revision: number) => ({
      id,
      baseReleaseId: "release-base",
      platform: "android" as const,
      channel: "production",
      runtimeVersion: "fingerprint-a",
      revision,
      updateId: `update-${revision}`,
      status: "active" as const,
      releaseNotes: { "zh-CN": [`版本 ${revision}`] },
      createdAt: `2026-08-28T00:0${revision}:00Z`,
      updatedAt: `2026-08-28T00:0${revision}:00Z`,
    });
    apiMocks.otaReleases.mockResolvedValue({
      items: [record("ota-1", 1), record("ota-3", 3), record("ota-2", 2)],
      nextCursor: null,
      hasMore: false,
    });
    renderOtaPage();

    const rows = await screen.findAllByRole("row");
    expect(rows[1]?.textContent).toContain("revision 3");
    expect(rows[2]?.textContent).toContain("revision 2");
    expect(rows[3]?.textContent).toContain("revision 1");
  });

  it("opens OTA detail and shows final manifest identity fields", async () => {
    apiMocks.otaBaseReleases.mockResolvedValue({ items: [] });
    apiMocks.otaReleases.mockResolvedValue({
      items: [
        {
          id: "ota-detail",
          baseReleaseId: "release-base",
          baseVersion: "1.1.2",
          baseBuildNumber: 6,
          platform: "android",
          channel: "production",
          applyStrategy: "immediate",
          runtimeVersion: "runtime-a",
          revision: 2,
          updateId: "update-detail",
          status: "active",
          releaseNotes: { "zh-CN": ["更新"] },
          createdAt: "2026-08-28T00:00:00Z",
          updatedAt: "2026-08-28T00:00:00Z",
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
    apiMocks.otaReleaseDetail.mockResolvedValue({
      release: {
        id: "ota-detail",
        baseReleaseId: "release-base",
        baseVersion: "1.1.2",
        baseBuildNumber: 6,
        platform: "android",
        channel: "production",
        applyStrategy: "immediate",
        runtimeVersion: "runtime-a",
        revision: 2,
        updateId: "update-detail",
        status: "active",
        releaseNotes: { "zh-CN": ["更新"] },
        manifestKey: "tenants/100000001/ota/manifest.json",
        manifestSha256: "sha256-detail",
        createdAt: "2026-08-28T00:00:00Z",
        updatedAt: "2026-08-28T00:00:00Z",
      },
      identity: {
        apiBaseUrl: "https://api.anyfun.win",
        distributionChannel: "direct",
        otaChannel: "production",
        applicationId: "com.anyfun.foundation",
        appVersion: "1.1.2",
        buildNumber: "6",
        runtimeVersion: "runtime-a",
        expoClientVersion: "1.1.2",
        expoClientAndroidVersionCode: 6,
      },
      baseMetadata: { packageName: "com.anyfun.foundation", versionCode: 6 },
      manifest: {
        runtimeVersion: "runtime-a",
        metadata: { applyStrategy: "immediate" },
      },
    });
    const user = userEvent.setup();
    renderOtaPage();

    await user.click(await screen.findByRole("button", { name: "详情" }));

    expect(await screen.findByText("https://api.anyfun.win")).toBeTruthy();
    expect(screen.getByText("com.anyfun.foundation")).toBeTruthy();
    expect(screen.getByText("查看最终 Manifest JSON")).toBeTruthy();
    expect(apiMocks.otaReleaseDetail).toHaveBeenCalledWith(
      "tenant-a",
      "ota-detail",
    );
  });

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
