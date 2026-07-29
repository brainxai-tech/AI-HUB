import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeImageInputs,
  callHubChat,
  configuredHubProviders,
  selectHubProvider,
} from "./project-hub-client.mjs";

const modelConfig = {
  defaultProvider: "deepseek",
  providers: [
    { id: "openai", label: "GPT", model: "gpt-5.5", enabled: false, configured: false },
    {
      id: "deepseek",
      label: "DeepSeek",
      model: "deepseek-v4-flash",
      models: ["deepseek-v4-flash", "deepseek-v4-pro"],
      enabledModels: ["deepseek-v4-flash", "deepseek-v4-pro"],
      enabled: true,
      configured: true,
    },
  ],
};

test("Hub provider selection uses the configured default without exposing credentials", () => {
  assert.deepEqual(selectHubProvider(modelConfig), {
    id: "deepseek",
    label: "DeepSeek",
    model: "deepseek-v4-flash",
    models: ["deepseek-v4-flash", "deepseek-v4-pro"],
  });
  assert.deepEqual(configuredHubProviders(modelConfig), [
    {
      id: "deepseek",
      label: "DeepSeek",
      model: "deepseek-v4-flash",
      models: ["deepseek-v4-flash", "deepseek-v4-pro"],
      enabled: true,
      configured: true,
    },
  ]);
});

test("Hub chat sends structured requests through the scoped local endpoint", async () => {
  let captured = null;
  const result = await callHubChat({
    provider: { id: "deepseek", model: "deepseek-v4-flash" },
    messages: [{ role: "user", content: "Return JSON" }],
    maxTokens: 900,
    responseFormat: "json",
    fetchImpl: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"ok":true}' } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
    chatUrl: "http://127.0.0.1:4194/hub/api/v1/chat/completions",
  });

  assert.equal(captured.url, "http://127.0.0.1:4194/hub/api/v1/chat/completions");
  assert.equal(captured.options.headers["content-type"], "application/json");
  assert.equal(captured.body.provider, "deepseek");
  assert.equal(captured.body.model, "deepseek-v4-flash");
  assert.deepEqual(captured.body.response_format, { type: "json_object" });
  assert.equal(result, '{"ok":true}');
});

test("image analysis derives real pixel metrics for Hub text-model grounding", async () => {
  const fakeSharp = () => ({
    metadata: async () => ({ width: 1200, height: 800, format: "png" }),
    stats: async () => ({
      dominant: { r: 18, g: 52, b: 86 },
      channels: [
        { mean: 20, stdev: 15 },
        { mean: 50, stdev: 18 },
        { mean: 80, stdev: 24 },
      ],
    }),
  });
  const [analysis] = await analyzeImageInputs([
    {
      name: "sample.png",
      mimeType: "image/png",
      size: 128,
      data: `data:image/png;base64,${Buffer.from("pixels").toString("base64")}`,
    },
  ], { sharpImpl: fakeSharp });

  assert.equal(analysis.width, 1200);
  assert.equal(analysis.height, 800);
  assert.equal(analysis.orientation, "landscape");
  assert.equal(analysis.dominantColor, "#123456");
  assert.equal(analysis.averageColor, "#143250");
  assert.equal(analysis.brightness, 46);
  assert.ok(analysis.contrast > 0);
});
