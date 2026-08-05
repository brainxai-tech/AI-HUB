import { describe, expect, it, vi } from "vitest";
import { rewriteRequestSchema } from "../dist-server/src/shared/contracts.js";
import { callHubChat, normalizeHubProviderCatalog } from "../dist-server/server/hubModels.js";
import { generateRewrite } from "../dist-server/server/providerGateway.js";

const request = {
  provider: "openai",
  model: "gpt-5.4",
  text: "这个方案我不同意，希望先明确责任再继续。",
  targetTone: "boundaried",
  intensity: 2,
  scenario: "工作沟通",
  recipient: "同事"
};

describe("recovered Hub routing artifacts", () => {
  it("accepts only OpenAI GPT requests and rejects legacy credential fields", () => {
    expect(rewriteRequestSchema.safeParse(request).success).toBe(true);
    expect(rewriteRequestSchema.safeParse({ ...request, provider: "other" }).success).toBe(false);
    expect(rewriteRequestSchema.safeParse({ ...request, model: "text-model" }).success).toBe(false);
    expect(rewriteRequestSchema.safeParse({ ...request, apiKey: "must-not-be-accepted" }).success).toBe(false);
  });

  it("filters Hub configuration to ready GPT models", () => {
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
    expect(provider.models).toEqual(["gpt-5.4", "gpt-5.4-mini"]);
    expect(provider.enabled).toBe(true);
    expect(provider.configured).toBe(true);
  });

  it("does not mark a project ready without a configured GPT model", () => {
    const [provider] = normalizeHubProviderCatalog({
      providers: [{ id: "openai", enabled: true, configured: true, model: "text-model", models: ["text-model"] }]
    });
    expect(provider.enabled).toBe(false);
    expect(provider.configured).toBe(false);
  });

  it("sends project identity and token to the Hub boundary", async () => {
    let capturedHeaders: Headers | undefined;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
    });
    const originalToken = process.env.HUB_PROJECT_TOKEN;
    process.env.HUB_PROJECT_TOKEN = "test-project-token";
    try {
      await callHubChat({
        provider: "openai",
        model: "gpt-5.4",
        messages: [{ role: "user", content: "Return JSON" }],
        fetchImpl
      });
    } finally {
      if (originalToken === undefined) delete process.env.HUB_PROJECT_TOKEN;
      else process.env.HUB_PROJECT_TOKEN = originalToken;
    }
    expect(capturedHeaders?.get("x-hub-project-id")).toBe("ai-tone-dressing-room");
    expect(capturedHeaders?.get("x-hub-project-path")).toBe("/tone");
    expect(capturedHeaders?.get("x-hub-project-token")).toBe("test-project-token");
  });

  it("uses the selected GPT model at the provider boundary", async () => {
    const callModel = vi.fn(async () => JSON.stringify({
      rewrite: "我需要先明确边界，再讨论后续方案。",
      shortRewrite: "请先明确边界。",
      beforeScores: { firm: 50, soft: 40, premium: 40, selfLike: 70, boundary: 50 },
      afterScores: { firm: 75, soft: 45, premium: 65, selfLike: 70, boundary: 90 },
      explanation: ["明确了责任范围。", "保留了原始立场。"],
      cautions: []
    }));
    const generated = await generateRewrite(request, { callModel });
    expect(generated.model).toBe("gpt-5.4");
    expect(callModel).toHaveBeenCalledWith(expect.objectContaining({ provider: "openai", model: "gpt-5.4" }));
  });
});
