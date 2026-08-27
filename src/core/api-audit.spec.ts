import { describe, expect, it } from "vitest";
import { parseAuditEvent } from "./api";

describe("audit API schema", () => {
  it("accepts localization audit summaries with arrays and nested JSON", () => {
    const event = parseAuditEvent({
      id: "audit-1",
      actorId: "admin@example.com",
      action: "localization_publish",
      targetType: "localization",
      targetId: "260827063218",
      reason: "发布正式多语言资源",
      requestId: "req-1",
      createdAt: "2026-08-27T06:32:18Z",
      tenantId: "100000001",
      summary: {
        languages: ["en-US", "zh-CN"],
        version: "260827063218",
        published: true,
        storage: { provider: "s3", size: 3624 },
      },
    });

    expect(event.summary.languages).toEqual(["en-US", "zh-CN"]);
    expect(event.summary.published).toBe(true);
  });
});
