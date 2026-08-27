// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReleasesPage } from "./pages";

const apiMocks = vi.hoisted(() => ({
  releases: vi.fn(),
  action: vi.fn(),
  createReleaseArtifactUpload: vi.fn(),
  createReleaseFromArtifact: vi.fn(),
  deleteReleaseArtifact: vi.fn(),
  uploadArtifactFile: vi.fn(),
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

describe("ReleasesPage actions", () => {
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
        }),
      ),
    );
    expect(apiMocks.action).not.toHaveBeenCalled();
  });
});
