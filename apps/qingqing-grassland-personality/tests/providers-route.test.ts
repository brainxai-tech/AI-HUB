import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "../app/api/providers/route.ts";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("providers route returns the standard Hub contract", async () => {
  globalThis.fetch = async () =>
    Response.json({
      defaultProvider: "deepseek",
      providers: [
        {
          id: "deepseek",
          label: "DeepSeek",
          model: "deepseek-v4-flash",
          models: ["deepseek-v4-flash"],
          enabledModels: ["deepseek-v4-flash"],
          enabled: true,
          configured: true
        }
      ]
    });

  const response = await GET();
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.hubUrl, "/hub/#models");
  assert.equal(payload.defaultProvider, "deepseek");
  assert.equal(payload.configured, true);
  assert.deepEqual(
    payload.providers.map((provider: { id: string }) => provider.id),
    ["deepseek", "openai", "gemini", "anthropic"]
  );
  assert.equal(payload.providers[0].provider, "deepseek");
  assert.equal(payload.providers[0].configured, true);
});

test("providers route falls back to local provider metadata if Hub is unavailable", async () => {
  globalThis.fetch = async () => {
    throw new Error("offline");
  };

  const response = await GET();
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.hubUrl, "/hub/#models");
  assert.equal(payload.configured, false);
  assert.equal(payload.providers.length, 4);
  assert.equal(payload.providers[0].enabled, false);
});
