import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHubChatRequest, interpretDream, parseInterpretationFromText } from "../server/llm";
import { callHubChat, normalizeHubProviderCatalog } from "../server/hubModels";
import { buildDreamSystemPrompt } from "../server/prompt";

afterEach(() => {
  vi.restoreAllMocks();
});

const input = {
  dreamText: "我梦见蛇在河边追我，醒来后很紧张。",
  mood: "紧张",
  tags: ["压力"],
  style: "balanced" as const,
  provider: "openai" as const,
  model: "gpt-5.4"
};

describe("parseInterpretationFromText", () => {
  it("extracts a JSON object from Hub model text", () => {
    const result = parseInterpretationFromText(`
      好的：
      {
        "summary": "梦见清水与远方呼唤。",
        "symbols": [{"name": "水", "meaning": "情绪流动"}],
        "traditionalReading": "水象征流动，但不宜断言吉凶。",
        "psychologicalReading": "可能与情绪整理有关。",
        "realityInsight": "近期可能需要回应某个任务。",
        "advice": "写下一件最需要回应的事。",
        "luckyKeywords": ["清水", "回应", "整理"],
        "disclaimer": "仅供娱乐。"
      }
    `);

    expect(result.summary).toContain("清水");
    expect(result.symbols[0]).toEqual({ name: "水", meaning: "情绪流动" });
    expect(result.luckyKeywords).toEqual(["清水", "回应", "整理"]);
  });

  it("fills safe fallback fields when optional model fields are malformed", () => {
    const result = parseInterpretationFromText(`{"summary":"短梦","symbols":"bad"}`);
    expect(result.symbols.length).toBeGreaterThan(0);
    expect(result.advice).toContain("今天");
    expect(result.disclaimer).toContain("娱乐");
  });
});

describe("Hub GPT routing", () => {
  it("sends the shared system prompt through the project-level Hub gateway", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(providerResponse()), { status: 200 }));

    await interpretDream(input);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body)) as ProviderRequestBody;
    expect(body.provider).toBe("openai");
    expect(body.model).toBe("gpt-5.4");
    expect(body.messages?.[0]?.content).toBe(buildDreamSystemPrompt());
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("rejects unsupported routes at the model-call boundary", () => {
    expect(() => buildHubChatRequest({ ...input, provider: "other" as never })).toThrowError(
      expect.objectContaining({ code: "INVALID_PROVIDER", status: 422 })
    );
    expect(() => buildHubChatRequest({ ...input, model: "text-model" })).toThrowError(
      expect.objectContaining({ code: "INVALID_MODEL", status: 422 })
    );
  });

  it("filters Hub configuration to a ready GPT project selection", () => {
    const [provider] = normalizeHubProviderCatalog({
      providers: [
        {
          id: "openai",
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

  it("attaches the project identity and optional token only at Hub", async () => {
    let capturedHeaders: Headers | undefined;
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
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
        fetchImpl: fetchImpl as typeof fetch
      });
    } finally {
      if (originalToken === undefined) delete process.env.HUB_PROJECT_TOKEN;
      else process.env.HUB_PROJECT_TOKEN = originalToken;
    }
    expect(capturedHeaders?.get("x-hub-project-id")).toBe("ai-zhougong-dream");
    expect(capturedHeaders?.get("x-hub-project-path")).toBe("/zhougong");
    expect(capturedHeaders?.get("x-hub-project-token")).toBe("test-project-token");
  });
});

interface ProviderRequestBody {
  provider?: string;
  model?: string;
  messages?: Array<{ content?: string }>;
  response_format?: { type?: string };
}

function providerResponse() {
  const output = JSON.stringify({
    summary: "梦见蛇与河水，反映警觉和情绪流动。",
    symbols: [{ name: "蛇", meaning: "变化与警觉。" }],
    traditionalReading: "结合检索到的传统意象，可作提醒而非预言。",
    psychologicalReading: "可能和压力、边界感有关。",
    realityInsight: "近期可以留意让你紧张的关系议题。",
    advice: "今天写下一个需要澄清的边界。",
    luckyKeywords: ["清醒", "边界", "整理"],
    disclaimer: "仅供娱乐和自我反思。"
  });
  return { choices: [{ message: { content: output } }] };
}
