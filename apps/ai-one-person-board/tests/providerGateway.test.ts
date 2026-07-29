import { describe, expect, it } from "vitest";
import { buildLocalBoardReport } from "../server/board.js";
import { callHubChat, HubModelError, normalizeHubProviderCatalog } from "../server/hubModels.js";
import { buildHubChatRequest, generateWithProvider, parseModelResult, ProviderError } from "../server/providerGateway.js";
import type { GenerateRequest } from "../src/shared/contracts.js";

const request: GenerateRequest = {
  provider: "openai",
  model: "gpt-5.4",
  input: {
    idea: "一个帮助独立开发者压力测试项目想法的 AI 一人董事会。",
    targetUser: "",
    problem: "",
    businessModel: "",
    constraints: ""
  }
};

const validReport = buildLocalBoardReport(request);

describe("provider gateway", () => {
  it("parses fenced JSON returned by a model", () => {
    expect(parseModelResult(`\`\`\`json\n${JSON.stringify(validReport)}\n\`\`\``)).toEqual(validReport);
  });

  it("rejects model JSON missing required fields", () => {
    expect(() => parseModelResult(JSON.stringify({ finalDecision: { recommendation: "GO" } }))).toThrow(ProviderError);
  });

  it("builds Hub chat requests without project-owned API keys", () => {
    const hubRequest = buildHubChatRequest(request);

    expect(hubRequest.provider).toBe("openai");
    expect(hubRequest.model).toBe("gpt-5.4");
    expect(hubRequest.temperature).toBe(0.42);
    expect(hubRequest.messages).toHaveLength(2);
    expect(hubRequest.messages[0].content).toContain("AI · 一人董事会");
    expect(hubRequest.messages[1].content).toContain("独立开发者");
    expect(JSON.stringify(hubRequest)).not.toContain("apiKey");
  });

  it("uses an injected model caller for deterministic tests", async () => {
    const calls: unknown[] = [];
    const result = await generateWithProvider(request, {
      callModel: async (hubRequest) => {
        calls.push(hubRequest);
        return JSON.stringify(validReport);
      }
    });

    expect(calls).toHaveLength(1);
    expect(result.directors.map((director) => director.role)).toContain("engineer");
    expect(result.finalDecision.recommendation).toBe("VALIDATE");
  });

  it("rejects non-OpenAI providers and non-GPT models at the Hub boundary", () => {
    expect(() => buildHubChatRequest({ ...request, provider: "gemini" } as unknown as GenerateRequest)).toThrow(
      "本项目只接受 Hub 的 GPT 路由。"
    );
    expect(() => buildHubChatRequest({ ...request, model: "local-preview" })).toThrow(
      "本项目只允许调用 gpt-* 型号。"
    );
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
    expect(ready.defaultModel).toBe("gpt-5.4");
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
      const headers = new Headers(calls[0].init?.headers);
      expect(headers.get("x-hub-project-id")).toBe("ai-one-person-board");
      expect(headers.get("x-hub-project-path")).toBe("/board");
      expect(headers.get("x-hub-project-token")).toBe("test-project-token");
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
