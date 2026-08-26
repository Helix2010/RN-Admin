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
});
