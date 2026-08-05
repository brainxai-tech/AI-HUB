import { describe, expect, it } from "vitest";
import { buildDemoAnalysis } from "../server/analysis.js";
import { callHubChat, HubModelError, normalizeHubProviderCatalog } from "../server/hubModels.js";
import {
  buildHubChatRequest,
  generateWithProvider,
  parseModelResult,
  ProviderError
} from "../server/providerGateway.js";
import type { AnalyzeRequest } from "../src/shared/contracts.js";

const request: AnalyzeRequest = {
  provider: "openai",
  model: "gpt-5.4",
  input: {
    text: "怎么还没发我？不是说今天给吗",
    channel: "work",
    intent: "想确认资料进度",
    toneGoal: "professional"
  }
};

const validReport = buildDemoAnalysis(request);

describe("provider gateway", () => {
  it("parses fenced JSON returned by a model", () => {
    expect(parseModelResult(`\`\`\`json\n${JSON.stringify(validReport)}\n\`\`\``)).toEqual(validReport);
  });

  it("rejects model JSON missing required fields", () => {
    expect(() => parseModelResult(JSON.stringify({ summary: "missing fields" }))).toThrow(ProviderError);
  });

  it("builds Hub chat calls with structured prompts", () => {
    const callRequest = buildHubChatRequest(request);

    expect(callRequest.provider).toBe("openai");
    expect(callRequest.model).toBe("gpt-5.4");
    expect(callRequest.messages[0]?.role).toBe("system");
    expect(callRequest.messages[0]?.content).toContain("沟通误解风险分析器");
    expect(callRequest.messages[0]?.content).toContain("更适合大模型判断的沟通上下文");
    expect(callRequest.messages[0]?.content).toContain("确定信息、合理推断和不确定假设");
    expect(callRequest.messages[0]?.content).toContain("topRisks 必须至少输出 2 条");
    expect(callRequest.messages[0]?.content).toContain("不要使用“XX”“某某”“……”");
    expect(callRequest.messages[1]?.content).toContain("怎么还没发我");
    expect(callRequest.messages[1]?.content).toContain("第二个风险名");
    expect(JSON.stringify(callRequest)).not.toContain("API Key");
  });

  it("uses an injected Hub model caller for deterministic tests", async () => {
    const calls: unknown[] = [];
    const result = await generateWithProvider(request, {
      callModel: async (modelRequest) => {
        calls.push(modelRequest);
        return JSON.stringify(validReport);
      }
    });

    expect(calls).toHaveLength(1);
    expect(result.audiences.map((audience) => audience.persona)).toContain("sensitive");
    expect(result.rewrites.professional).toContain("进展");
  });

  it("rejects non-OpenAI providers and non-GPT models at the Hub boundary", () => {
    expect(() => buildHubChatRequest({ ...request, provider: "gemini" } as unknown as AnalyzeRequest)).toThrow(
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
      expect(headers.get("x-hub-project-id")).toBe("ai-misunderstanding-simulator");
      expect(headers.get("x-hub-project-path")).toBe("/misunderstanding");
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
