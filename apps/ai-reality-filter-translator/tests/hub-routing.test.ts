import { describe, expect, it, vi } from "vitest";
import { callHubChat, normalizeHubProviderCatalog } from "../server/hubModels";

describe("Hub project routing", () => {
  it("keeps only ready GPT models from the OpenAI project selection", () => {
    const [provider] = normalizeHubProviderCatalog({
      providers: [
        {
          id: "openai",
          label: "GPT · AI Routing",
          enabled: true,
          configured: true,
          model: "gpt-5.4",
          enabledModels: ["gpt-5.4", "text-model"],
          models: ["gpt-5.4-mini", "other-model"]
        },
        { id: "other", enabled: true, configured: true, model: "other-model" }
      ]
    });

    expect(provider.id).toBe("openai");
    expect(provider.defaultModel).toBe("gpt-5.4");
    expect(provider.models).toEqual(["gpt-5.4", "gpt-5.4-mini"]);
    expect(provider.enabled).toBe(true);
    expect(provider.configured).toBe(true);
  });

  it("does not mark a project ready without a configured GPT selection", () => {
    const [provider] = normalizeHubProviderCatalog({
      providers: [{ id: "openai", enabled: true, configured: true, model: "text-model", models: ["text-model"] }]
    });

    expect(provider.enabled).toBe(false);
    expect(provider.configured).toBe(false);
  });

  it("sends project identity and the project token only to Hub", async () => {
    let capturedHeaders: Headers | undefined;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const originalToken = process.env.HUB_PROJECT_TOKEN;
    process.env.HUB_PROJECT_TOKEN = "test-project-token";

    try {
      await callHubChat({
        provider: "openai",
        model: "gpt-5.4",
        messages: [{ role: "user", content: "Return JSON" }],
        fetchImpl: fetchImpl as typeof fetch
      });
    } finally {
      if (originalToken === undefined) delete process.env.HUB_PROJECT_TOKEN;
      else process.env.HUB_PROJECT_TOKEN = originalToken;
    }

    expect(capturedHeaders?.get("x-hub-project-id")).toBe("ai-reality-filter-translator");
    expect(capturedHeaders?.get("x-hub-project-path")).toBe("/reality-filter");
    expect(capturedHeaders?.get("x-hub-project-token")).toBe("test-project-token");
  });

  it("rejects unsupported routes before network access", async () => {
    const fetchImpl = vi.fn();
    await expect(callHubChat({
      provider: "openai",
      model: "text-model",
      messages: [{ role: "user", content: "test" }],
      fetchImpl: fetchImpl as typeof fetch
    })).rejects.toMatchObject({ code: "INVALID_MODEL", status: 422 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
