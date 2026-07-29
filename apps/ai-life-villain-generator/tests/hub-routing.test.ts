import { describe, expect, it } from "vitest";
import { callHubChat, HubModelError, normalizeHubProviderCatalog } from "../dist-server/server/hubModels.js";
import { generateRequestSchema } from "../dist-server/src/shared/contracts.js";

const baseRequest = {
  provider: "openai",
  model: "gpt-5.4",
  goal: "完成产品发布",
  blockerHint: "总想继续准备",
  deadline: "本周五",
  tone: "coach",
  cardStyle: "rpg",
};

describe("recovered Hub routing artifacts", () => {
  it("accepts only the OpenAI GPT route", () => {
    expect(generateRequestSchema.safeParse(baseRequest).success).toBe(true);
    expect(generateRequestSchema.safeParse({ ...baseRequest, provider: "gemini" }).success).toBe(false);
    expect(generateRequestSchema.safeParse({ ...baseRequest, model: "other-model" }).success).toBe(false);
  });

  it("filters the Hub catalog and requires a configured GPT model", () => {
    const [ready] = normalizeHubProviderCatalog({
      providers: [{
        id: "openai",
        model: "other-model",
        models: ["gpt-5.4", "claude-sonnet"],
        enabledModels: ["gpt-5.4", "gemini-flash"],
        enabled: true,
        configured: true,
      }],
    });
    expect(ready.models).toEqual(["gpt-5.4"]);
    expect(ready.enabledModels).toEqual(["gpt-5.4"]);
    expect(ready.enabled).toBe(true);

    const [notReady] = normalizeHubProviderCatalog({
      providers: [{
        id: "openai",
        model: "other-model",
        models: ["other-model"],
        enabledModels: ["other-model"],
        enabled: true,
        configured: true,
      }],
    });
    expect(notReady.enabled).toBe(false);
    expect(notReady.configured).toBe(false);
  });

  it("sends project-scoped requests and rejects invalid models before fetching", async () => {
    const originalFetch = globalThis.fetch;
    const originalToken = process.env.HUB_PROJECT_TOKEN;
    const calls: RequestInit[] = [];
    process.env.HUB_PROJECT_TOKEN = "test-project-token";
    globalThis.fetch = async (_input, init) => {
      calls.push(init || {});
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
    };

    try {
      await callHubChat({ provider: "openai", model: "gpt-5.4", messages: [] });
      expect(new Headers(calls[0].headers).get("x-hub-project-id")).toBe("ai-life-villain-generator");
      expect(new Headers(calls[0].headers).get("x-hub-project-path")).toBe("/villain");
      expect(new Headers(calls[0].headers).get("x-hub-project-token")).toBe("test-project-token");

      await expect(callHubChat({ provider: "openai", model: "other-model", messages: [] }))
        .rejects.toMatchObject<Partial<HubModelError>>({ code: "INVALID_MODEL" });
      expect(calls).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalToken === undefined) delete process.env.HUB_PROJECT_TOKEN;
      else process.env.HUB_PROJECT_TOKEN = originalToken;
    }
  });
});
