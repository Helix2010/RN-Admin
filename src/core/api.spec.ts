import { afterEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("adminApi.releases", () => {
  it("accepts legacy releases whose file metadata is null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "release-rejected",
                platform: "android",
                version: "1.0.0",
                buildNumber: 1,
                runtimeVersion: "expo:57.0.15",
                status: "rejected",
                releaseNotes: { "zh-CN": ["首次测试包"] },
                fileMetadata: null,
                createdAt: "2026-08-25T00:00:00Z",
                updatedAt: "2026-08-25T00:00:00Z",
                lastAction: null,
              },
            ],
            nextCursor: null,
            hasMore: false,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    const result = await adminApi.releases("tenant-a");

    expect(result.items[0]?.fileMetadata).toBeUndefined();
  });

  it("accepts OTA upload tickets from older servers without upload expiry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            artifact: {
              id: "ota-artifact",
              token: "ota-token",
              fileName: "ota.zip",
              contentType: "application/zip",
              size: 1024,
              objectKey: "tenants/tenant-a/ota-uploads/ota.zip",
              expiresAt: "2026-08-28T01:00:00Z",
            },
            upload: {
              method: "PUT",
              url: "https://storage.example/ota",
              headers: { "content-type": "application/zip" },
              requiresCredentials: true,
            },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const result = await adminApi.createOtaArtifactUpload("tenant-a", {
      fileName: "ota.zip",
      contentType: "application/zip",
      size: 1024,
      baseReleaseId: "release-base",
      channel: "production",
    });

    expect(result.upload.expiresAt).toBeUndefined();
  });
});
