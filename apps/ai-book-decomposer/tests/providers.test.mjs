import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHubChatPayload,
  callProvider,
  extractProviderText,
  getProviderCatalog,
  getStaticProviderCatalog,
  normalizeHubProviderCatalog,
} from "../lib/providers.mjs";

test("static provider catalog exposes the Hub model families", () => {
  const catalog = getStaticProviderCatalog();

  assert.deepEqual(
    catalog.map((provider) => provider.id),
    ["deepseek", "openai", "anthropic", "gemini"],
  );
  assert.ok(catalog.find((provider) => provider.id === "anthropic").models.includes("claude-opus-4-8"));
});

test("normalizeHubProviderCatalog uses enabled models from Hub config", () => {
  const catalog = normalizeHubProviderCatalog({
    providers: [
      {
        id: "deepseek",
        label: "DeepSeek",
        model: "deepseek-chat",
        models: ["deepseek-v4-flash"],
        enabledModels: ["deepseek-chat", "deepseek-reasoner"],
        enabled: true,
        configured: true,
      },
    ],
  });

  const deepseek = catalog.find((provider) => provider.id === "deepseek");
  assert.equal(deepseek.enabled, true);
  assert.equal(deepseek.configured, true);
  assert.deepEqual(deepseek.enabledModels, ["deepseek-chat", "deepseek-reasoner"]);
  assert.equal(deepseek.models[0], "deepseek-chat");
});

test("getProviderCatalog reads model config from Hub when URL is configured", async () => {
  const previousUrl = process.env.HUB_MODEL_CONFIG_URL;
  process.env.HUB_MODEL_CONFIG_URL = "http://hub.test/hub/api/model-config";

  try {
    const catalog = await getProviderCatalog({
      fetchImpl: async (url) => {
        assert.equal(url, "http://hub.test/hub/api/model-config");
        return new Response(
          JSON.stringify({
            providers: [
              {
                id: "openai",
                label: "GPT",
                model: "gpt-5.5",
                enabledModels: ["gpt-5.5", "gpt-5.5-pro"],
                enabled: true,
                configured: true,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    const openai = catalog.find((provider) => provider.id === "openai");
    assert.deepEqual(openai.enabledModels, ["gpt-5.5", "gpt-5.5-pro"]);
  } finally {
    restoreEnv("HUB_MODEL_CONFIG_URL", previousUrl);
  }
});

test("buildHubChatPayload creates an OpenAI-compatible Hub request body", () => {
  const payload = buildHubChatPayload({
    provider: "deepseek",
    model: "deepseek-chat",
    system: "system",
    user: "user",
  });

  assert.equal(payload.provider, "deepseek");
  assert.equal(payload.model, "deepseek-chat");
  assert.equal(payload.messages.length, 2);
  assert.deepEqual(payload.response_format, { type: "json_object" });
});

test("callProvider posts to Hub with project token and extracts text", async () => {
  const previousUrl = process.env.HUB_CHAT_COMPLETIONS_URL;
  const previousToken = process.env.HUB_PROJECT_TOKEN;
  process.env.HUB_CHAT_COMPLETIONS_URL = "http://hub.test/hub/api/v1/chat/completions";
  process.env.HUB_PROJECT_TOKEN = "project-token";

  try {
    const result = await callProvider({
      provider: "deepseek",
      model: "deepseek-chat",
      system: "system",
      user: "user",
      fetchImpl: async (url, options) => {
        assert.equal(url, "http://hub.test/hub/api/v1/chat/completions");
        assert.equal(options.headers["x-hub-project-token"], "project-token");
        const body = JSON.parse(options.body);
        assert.equal(body.provider, "deepseek");
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "hub text" } }],
            usage: { prompt_tokens: 10, completion_tokens: 20 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    assert.equal(result.text, "hub text");
    assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 20 });
  } finally {
    restoreEnv("HUB_CHAT_COMPLETIONS_URL", previousUrl);
    restoreEnv("HUB_PROJECT_TOKEN", previousToken);
  }
});

test("extractProviderText supports Hub and provider response variants", () => {
  assert.equal(
    extractProviderText({
      choices: [{ message: { content: "chat text" } }],
    }),
    "chat text",
  );
  assert.equal(
    extractProviderText({
      output_text: "responses text",
    }),
    "responses text",
  );
  assert.equal(
    extractProviderText({
      content: [{ type: "text", text: "claude text" }],
    }),
    "claude text",
  );
  assert.equal(
    extractProviderText({
      candidates: [{ content: { parts: [{ text: "gemini text" }] } }],
    }),
    "gemini text",
  );
});

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
