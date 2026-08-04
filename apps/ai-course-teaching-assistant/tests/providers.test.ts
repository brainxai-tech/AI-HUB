import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildHubChatPayload,
  callTeachingProvider,
  extractProviderText,
  getProviderCatalog,
  ProviderError,
} from "../lib/providers.ts";
import { TEACHING_SYSTEM_PROMPT, type TeachingRequest } from "../lib/teaching.ts";

const request: TeachingRequest = {
  topic: "光合作用",
  audience: "初一生物",
  durationMinutes: 40,
  difficulty: "入门",
  teachingStyle: "案例导入",
  quizCount: 3,
  provider: "openai",
  model: "gpt-5.4",
  outputFormat: "mind_map",
  includeExamples: true,
};

function aiBundleJson() {
  return JSON.stringify({
    sections: {
      lecture: {
        title: "光合作用教学",
        objective: "理解光合作用的条件和产物。",
        outline: ["导入", "讲解", "练习"],
        keyConcepts: ["光能", "叶绿体"],
        explanation: "光合作用将光能转化为化学能。",
        examples: ["叶片实验"],
        misconceptions: ["只在白天呼吸"],
        boardPlan: ["条件", "过程", "产物"],
      },
      quiz: [],
      mistakeAnalysis: [],
      activities: [],
    },
    qualityChecks: ["内容围绕同一知识点。"],
    teacherNotes: ["正式使用前请人工复核。"],
  });
}

describe("Hub provider contracts", () => {
  it("normalizes Hub model catalog", async () => {
    const originalFetch = globalThis.fetch;
    const originalConfigUrl = process.env.HUB_MODEL_CONFIG_URL;
    process.env.HUB_MODEL_CONFIG_URL = "http://hub.test/models";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          providers: [
            {
              id: "openai",
              label: "GPT · AI Routing",
              model: "gpt-5.4",
              models: ["gpt-5.4", "gemini-test"],
              enabledModels: ["gpt-5.4", "claude-test"],
              enabled: true,
              configured: true,
            },
          ],
        }),
      );

    try {
      const providers = await getProviderCatalog();
      assert.equal(providers.length, 1);
      assert.equal(providers[0]?.configured, true);
      assert.deepEqual(providers[0]?.enabledModels, ["gpt-5.4"]);
      assert.deepEqual(providers[0]?.models, ["gpt-5.4"]);
    } finally {
      globalThis.fetch = originalFetch;
      process.env.HUB_MODEL_CONFIG_URL = originalConfigUrl;
    }
  });

  it("builds an OpenAI-compatible Hub chat payload with the teaching system prompt", () => {
    const payload = buildHubChatPayload("openai", "gpt-5.4", "用户 brief");

    assert.equal(payload.provider, "openai");
    assert.equal(payload.model, "gpt-5.4");
    assert.equal(payload.messages[0].content, TEACHING_SYSTEM_PROMPT);
    assert.equal(payload.response_format.type, "json_object");
  });

  it("rejects non-GPT models at the Hub payload boundary", () => {
    assert.throws(() => buildHubChatPayload("openai", "gemini-pro", "用户 brief"), ProviderError);
  });

  it("extracts text from supported Hub response shapes", () => {
    assert.equal(extractProviderText({ output_text: "{\"ok\":true}" }), "{\"ok\":true}");
    assert.equal(extractProviderText({ choices: [{ message: { content: "{\"ok\":true}" } }] }), "{\"ok\":true}");
    assert.equal(extractProviderText({ content: [{ type: "text", text: "{\"ok\":true}" }] }), "{\"ok\":true}");
    assert.equal(
      extractProviderText({ candidates: [{ content: { parts: [{ text: "{\"ok\":true}" }] } }] }),
      "{\"ok\":true}",
    );
  });

  it("calls Hub chat proxy only after provider is configured", async () => {
    const originalFetch = globalThis.fetch;
    const originalTimeout = AbortSignal.timeout;
    const originalConfigUrl = process.env.HUB_MODEL_CONFIG_URL;
    const originalChatUrl = process.env.HUB_CHAT_COMPLETIONS_URL;
    const originalToken = process.env.HUB_PROJECT_TOKEN;
    process.env.HUB_MODEL_CONFIG_URL = "http://hub.test/models";
    process.env.HUB_CHAT_COMPLETIONS_URL = "http://hub.test/chat";
    process.env.HUB_PROJECT_TOKEN = "project-token";

    const calls: Array<{ url: string; options?: RequestInit }> = [];
    const timeoutCalls: number[] = [];
    AbortSignal.timeout = (milliseconds) => {
      timeoutCalls.push(milliseconds);
      return new AbortController().signal;
    };
    globalThis.fetch = async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith("/models")) {
        return new Response(
          JSON.stringify({
            providers: [
              {
                id: "openai",
                label: "GPT · AI Routing",
                model: "gpt-5.4",
                enabledModels: ["gpt-5.4"],
                enabled: true,
                configured: true,
              },
            ],
          }),
        );
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: aiBundleJson() } }] }));
    };

    try {
      const bundle = await callTeachingProvider(request);
      assert.equal(bundle.source, "openai");
      assert.equal(bundle.model, "gpt-5.4");
      assert.equal(calls[1].url, "http://hub.test/chat");
      assert.equal((calls[1].options?.headers as Record<string, string>)["x-hub-project-token"], "project-token");
      assert.deepEqual(timeoutCalls, [10_000, 160_000]);
    } finally {
      globalThis.fetch = originalFetch;
      AbortSignal.timeout = originalTimeout;
      process.env.HUB_MODEL_CONFIG_URL = originalConfigUrl;
      process.env.HUB_CHAT_COMPLETIONS_URL = originalChatUrl;
      process.env.HUB_PROJECT_TOKEN = originalToken;
    }
  });

  it("blocks generation when Hub provider is not configured", async () => {
    const originalFetch = globalThis.fetch;
    const originalConfigUrl = process.env.HUB_MODEL_CONFIG_URL;
    process.env.HUB_MODEL_CONFIG_URL = "http://hub.test/models";
    globalThis.fetch = async () => new Response(JSON.stringify({ providers: [] }));

    try {
      await assert.rejects(() => callTeachingProvider(request), ProviderError);
    } finally {
      globalThis.fetch = originalFetch;
      process.env.HUB_MODEL_CONFIG_URL = originalConfigUrl;
    }
  });
});
