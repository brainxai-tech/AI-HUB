import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { POST } from "../app/api/teaching-bundles/route.ts";

describe("teaching bundle API", () => {
  it("blocks generation instead of falling back when Hub is not configured", async () => {
    const originalFetch = globalThis.fetch;
    const originalConfigUrl = process.env.HUB_MODEL_CONFIG_URL;
    process.env.HUB_MODEL_CONFIG_URL = "http://hub.test/models";
    globalThis.fetch = async () => new Response(JSON.stringify({ providers: [] }));

    try {
      const response = await POST(
        new Request("http://localhost/api/teaching-bundles", {
          method: "POST",
          body: JSON.stringify({
            topic: "光合作用",
            audience: "初一生物",
            durationMinutes: 40,
            difficulty: "入门",
            teachingStyle: "案例导入",
            quizCount: 3,
            provider: "openai",
            model: "gpt-5.4",
            outputFormat: "mind_map",
          }),
        }),
      );

      const data = await response.json();

      assert.equal(response.status, 503);
      assert.equal(data.error.code, "HUB_PROVIDER_NOT_CONFIGURED");
      assert.equal(data.bundle, undefined);
      assert.notEqual(data.source, "local-fallback");
    } finally {
      globalThis.fetch = originalFetch;
      process.env.HUB_MODEL_CONFIG_URL = originalConfigUrl;
    }
  });

  it("returns structured validation errors", async () => {
    const response = await POST(
      new Request("http://localhost/api/teaching-bundles", {
        method: "POST",
        body: JSON.stringify({ topic: "", audience: "" }),
      }),
    );

    const data = await response.json();

    assert.equal(response.status, 422);
    assert.equal(data.error.code, "VALIDATION_ERROR");
  });
});
