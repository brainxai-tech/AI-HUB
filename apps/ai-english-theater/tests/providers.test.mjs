import assert from "node:assert/strict";
import test from "node:test";

import { buildProviderPayload, callProvider, getProviderCatalog, listProviders, ProviderError, resolveModel } from "../src/providers.mjs";
import { getScenario } from "../src/scenarios.mjs";

test("lists the four Hub-supported LLM providers", () => {
  assert.deepEqual(
    listProviders().map((provider) => provider.id),
    ["deepseek", "openai", "anthropic", "gemini"]
  );
});

test("uses current Hub fallback model names when model is omitted", () => {
  assert.equal(resolveModel("openai", ""), "gpt-5.5");
  assert.equal(resolveModel("gemini", undefined), "gemini-3.5-flash");
  assert.equal(resolveModel("anthropic", ""), "claude-opus-4-8");
});

test("builds an OpenAI-compatible Hub chat payload", () => {
  const payload = buildProviderPayload({
    provider: "deepseek",
    systemPrompt: "System",
    userPrompt: "User",
    model: "deepseek-v4-flash",
    jsonMode: true
  });

  assert.equal(payload.provider, "deepseek");
  assert.equal(payload.model, "deepseek-v4-flash");
  assert.equal(payload.messages[0].role, "system");
  assert.equal(payload.response_format.type, "json_object");
});

test("normalizes Hub model config without exposing credentials", async () => {
  const originalFetch = globalThis.fetch;
  const originalConfigUrl = process.env.HUB_MODEL_CONFIG_URL;
  process.env.HUB_MODEL_CONFIG_URL = "http://hub.test/models";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        providers: [
          {
            id: "deepseek",
            label: "DeepSeek",
            model: "deepseek-v4-flash",
            models: ["deepseek-v4-flash", "deepseek-v4-pro"],
            enabledModels: ["deepseek-v4-flash", "deepseek-v4-pro"],
            enabled: true,
            configured: true
          }
        ]
      })
    );

  try {
    const providers = await getProviderCatalog();
    const deepseek = providers.find((provider) => provider.id === "deepseek");
    assert.equal(deepseek.configured, true);
    assert.deepEqual(deepseek.enabledModels, ["deepseek-v4-flash", "deepseek-v4-pro"]);
    assert.equal(providers.find((provider) => provider.id === "openai").configured, false);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.HUB_MODEL_CONFIG_URL = originalConfigUrl;
  }
});

test("calls Hub chat proxy only after provider is configured", async () => {
  const originalFetch = globalThis.fetch;
  const originalConfigUrl = process.env.HUB_MODEL_CONFIG_URL;
  const originalChatUrl = process.env.HUB_CHAT_COMPLETIONS_URL;
  const originalToken = process.env.HUB_PROJECT_TOKEN;
  process.env.HUB_MODEL_CONFIG_URL = "http://hub.test/models";
  process.env.HUB_CHAT_COMPLETIONS_URL = "http://hub.test/chat";
  process.env.HUB_PROJECT_TOKEN = "project-token";

  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/models")) {
      return new Response(
        JSON.stringify({
          providers: [
            {
              id: "deepseek",
              label: "DeepSeek",
              model: "deepseek-v4-flash",
              enabledModels: ["deepseek-v4-flash"],
              enabled: true,
              configured: true
            }
          ]
        })
      );
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "Hello from Hub" } }] }));
  };

  try {
    const result = await callProvider({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      purpose: "roleplay",
      scenario: getScenario("travel"),
      systemPrompt: "System",
      userPrompt: "User"
    });
    assert.equal(result.text, "Hello from Hub");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, "http://hub.test/chat");
    assert.equal(calls[1].options.headers["x-hub-project-token"], "project-token");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.HUB_MODEL_CONFIG_URL = originalConfigUrl;
    process.env.HUB_CHAT_COMPLETIONS_URL = originalChatUrl;
    process.env.HUB_PROJECT_TOKEN = originalToken;
  }
});

test("blocks generation when Hub provider is not configured", async () => {
  const originalFetch = globalThis.fetch;
  const originalConfigUrl = process.env.HUB_MODEL_CONFIG_URL;
  process.env.HUB_MODEL_CONFIG_URL = "http://hub.test/models";
  globalThis.fetch = async () => new Response(JSON.stringify({ providers: [] }));

  try {
    await assert.rejects(
      () =>
        callProvider({
          provider: "deepseek",
          model: "deepseek-v4-flash",
          purpose: "evaluate",
          scenario: getScenario("campus"),
          systemPrompt: "System",
          userPrompt: "User",
          jsonMode: true
        }),
      ProviderError
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env.HUB_MODEL_CONFIG_URL = originalConfigUrl;
  }
});
