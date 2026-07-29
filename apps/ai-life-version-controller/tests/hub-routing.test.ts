import { describe, expect, it } from "vitest";
import { callHubChat, HubModelError, normalizeHubProviderCatalog } from "../server/hubModels";
import { isGptModel, isProvider } from "../src/shared/contracts";

describe("Hub GPT routing", () => {
  it("accepts only the OpenAI route and gpt-* models", () => {
    expect(isProvider("openai")).toBe(true);
    expect(isProvider("gemini")).toBe(false);
    expect(isGptModel("gpt-5.4")).toBe(true);
    expect(isGptModel("other-model")).toBe(false);
  });

  it("filters the Hub catalog and requires a configured GPT model", () => {
    const [ready] = normalizeHubProviderCatalog({
      providers: [{
        id: "openai",
        label: "GPT · AI Routing",
        model: "other-model",
        models: ["gpt-5.4", "claude-sonnet"],
        enabledModels: ["gpt-5.4", "gemini-flash"],
        enabled: true,
        configured: true
      }]
    });
    expect(ready.model).toBe("gpt-5.4");
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
        configured: true
      }]
    });
    expect(notReady.enabled).toBe(false);
    expect(notReady.configured).toBe(false);
  });

  it("sends project-scoped GPT requests and rejects invalid models before fetching", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    const originalToken = process.env.HUB_PROJECT_TOKEN;
    process.env.HUB_PROJECT_TOKEN = "test-project-token";
    try {
      await callHubChat({
        provider: "openai",
        model: "gpt-5.4",
        messages: [{ role: "user", content: "test" }],
        fetchImpl
      });
      expect(calls).toHaveLength(1);
      expect(new Headers(calls[0].init?.headers).get("x-hub-project-id")).toBe("ai-life-version-controller");
      expect(new Headers(calls[0].init?.headers).get("x-hub-project-path")).toBe("/life-version");
      expect(new Headers(calls[0].init?.headers).get("x-hub-project-token")).toBe("test-project-token");
      expect(JSON.parse(String(calls[0].init?.body)).model).toBe("gpt-5.4");

      await expect(callHubChat({
        provider: "openai",
        model: "other-model",
        messages: [],
        fetchImpl
      })).rejects.toMatchObject({ code: "INVALID_MODEL" } satisfies Partial<HubModelError>);
      expect(calls).toHaveLength(1);
    } finally {
      if (originalToken === undefined) delete process.env.HUB_PROJECT_TOKEN;
      else process.env.HUB_PROJECT_TOKEN = originalToken;
    }
  });
});
