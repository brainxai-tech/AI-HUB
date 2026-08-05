import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCompatibleChatPayload,
  defaultModelForProvider,
  providerEndpoint,
  requestCompatibleChatCompletion
} from "../src/server/llm-compatible-client.mjs";

test("providerEndpoint always resolves to the scoped Hub route", () => {
  for (const provider of ["openai", "deepseek", "gemini", "openrouter", "custom"]) {
    assert.equal(providerEndpoint({ provider }), "http://127.0.0.1:4194/hub/api/v1/chat/completions");
  }
});

test("model selection is delegated to Hub instead of local provider defaults", () => {
  assert.equal(defaultModelForProvider("openai"), "");
  assert.equal(defaultModelForProvider("gemini"), "");
});

test("buildCompatibleChatPayload uses one OpenAI-compatible JSON shape", () => {
  const messages = [{ role: "user", content: "Return JSON" }];
  const deepseekPayload = buildCompatibleChatPayload({ provider: "deepseek", model: "deepseek-chat", messages });
  const openAiPayload = buildCompatibleChatPayload({ provider: "openai", model: "gpt-4.1-mini", messages });

  assert.equal(deepseekPayload.response_format.type, "json_object");
  assert.equal(deepseekPayload.thinking, undefined);
  assert.equal(openAiPayload.response_format.type, "json_object");
  assert.equal(openAiPayload.thinking, undefined);
});

test("requestCompatibleChatCompletion uses project-scoped Hub access without a user key", async () => {
  const calls = [];
  const content = await requestCompatibleChatCompletion({
    provider: "gemini",
    model: "gemini-2.5-flash",
    messages: [{ role: "user", content: "JSON" }],
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: "{\"ok\":true}" } }] };
        }
      };
    }
  });

  assert.equal(content, "{\"ok\":true}");
  assert.equal(calls[0].url, "http://127.0.0.1:4194/hub/api/v1/chat/completions");
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(JSON.parse(calls[0].options.body).model, undefined);
});
