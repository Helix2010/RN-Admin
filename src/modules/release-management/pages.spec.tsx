// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReleasesPage } from "./pages";

const apiMocks = vi.hoisted(() => ({
  releases: vi.fn(),
  action: vi.fn(),
  createReleaseUpload: vi.fn(),
  finalizeReleaseUpload: vi.fn(),
  uploadArtifactFile: vi.fn(),
}));

vi.mock("../../core/api", () => ({
  adminApi: apiMocks,
  publicApiUrl: (path: string) => `https://api.example.com${path}`,
  uploadArtifactFile: apiMocks.uploadArtifactFile,
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

  it("uploads, verifies and publishes a release in one flow", async () => {
    apiMocks.releases.mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
    apiMocks.createReleaseUpload.mockResolvedValue({
      release: {
        id: "release-1",
        tenantId: "tenant-a",
        platform: "android",
        version: "1.3.0",
        buildNumber: 130,
        status: "uploaded",
        releaseNotes: { "zh-CN": ["修复已知问题并优化体验"] },
        objectKey: "tenants/tenant-a/releases/release-1/application.apk",
      },
      upload: {
        method: "PUT",
        url: "https://storage.example/upload",
        headers: { "content-type": "application/vnd.android.package-archive" },
        expiresAt: "2026-08-25T00:15:00Z",
      },
    });
    apiMocks.uploadArtifactFile.mockResolvedValue(undefined);
    apiMocks.finalizeReleaseUpload.mockResolvedValue({
      release: {
        id: "release-1",
        platform: "android",
        status: "verified",
        fileName: "dex-1.3.0.apk",
        fileSize: 10,
        sha256: "a".repeat(64),
        metadata: { versionName: "1.3.0", versionCode: 130 },
      },
    });
    apiMocks.action.mockResolvedValue({
      release: {
        id: "release-1",
        version: "1.3.0",
        buildNumber: 130,
        status: "active",
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
    await user.upload(screen.getByLabelText("APK 安装包"), apk);
    await user.click(screen.getByRole("button", { name: "校验并发布到官网" }));
    await user.click(screen.getByRole("button", { name: "确认发布" }));

    await waitFor(() => {
      expect(apiMocks.createReleaseUpload).toHaveBeenCalledWith(
        "tenant-a",
        expect.objectContaining({
          platform: "android",
          version: "1.3.0",
          buildNumber: 130,
        }),
      );
    });
    expect(apiMocks.uploadArtifactFile).toHaveBeenCalledWith(
      expect.objectContaining({ method: "PUT" }),
      apk,
      expect.any(Function),
    );
    expect(apiMocks.finalizeReleaseUpload).toHaveBeenCalledWith(
      "tenant-a",
      "release-1",
    );
    expect(apiMocks.action).toHaveBeenCalledWith(
      "tenant-a",
      "release-1",
      "publish",
      expect.stringContaining("修复已知问题"),
    );
  });
});
