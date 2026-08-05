import { describe, expect, it } from "vitest";
import { CoachTaskSchema, defaultModels } from "../src/shared/contracts.js";
import { callHubChat, HubModelError, normalizeHubProviderCatalog } from "../server/hubModels.js";
import {
  buildHubChatRequest,
  buildCoachPrompt,
  extractJson,
  normalizeCoachOutput
} from "../server/modelGateway.js";

const input = {
  paperMeta: {
    title: "Attention Is All You Need",
    authors: [],
    importedAt: "2026-06-30T00:00:00.000Z"
  },
  sectionSummaries: [
    { id: "s1", title: "Abstract", role: "abstract", summary: "Transformer replaces recurrence with attention." },
    { id: "s2", title: "Results", role: "results", summary: "Experiments improve translation quality." }
  ],
  selectedText: "The Transformer uses self-attention. [S1-P1]",
  surroundingContext: "S1-P1 The Transformer uses self-attention. S2-P1 It improves BLEU.",
  userQuestion: "创新点是什么？",
  userLevel: "graduate" as const,
  outputLanguage: "zh-CN" as const
};

describe("model gateway", () => {
  it("builds task prompts with evidence labels and citation requirements", () => {
    const prompt = buildCoachPrompt("qa", input);

    expect(prompt.system).toContain("论文阅读教练");
    expect(prompt.system).toContain("先给一句话结论");
    expect(prompt.system).toContain("基于论文文本");
    expect(prompt.system).toContain("直接回答");
    expect(prompt.user).toContain("S1-P1");
    expect(prompt.user).toContain("创新点是什么");
  });

  it("builds hub chat request bodies without provider keys in payload", () => {
    const openai = buildHubChatRequest({
      provider: "openai",
      model: defaultModels.openai,
      task: "paper_map",
      input
    });
    expect(openai.provider).toBe("openai");
    expect(openai.messages[0].role).toBe("system");
    expect(openai.messages[1].content).toContain("Attention Is All You Need");
    expect(JSON.stringify(openai)).not.toContain("sk-test");
    expect(openai.maxTokens).toBeGreaterThan(1000);
  });

  it("rejects non-OpenAI providers and non-GPT models at the Hub boundary", () => {
    expect(() => buildHubChatRequest({
      provider: "gemini",
      model: "gpt-5.4",
      task: "quiz",
      input
    } as never)).toThrow("本项目只接受 Hub 的 GPT 路由。");
    expect(() => buildHubChatRequest({
      provider: "openai",
      model: "local-preview",
      task: "quiz",
      input
    })).toThrow("本项目只允许调用 gpt-* 型号。");
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
    const fetchImpl = async (request: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(request), init });
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
      expect(headers.get("x-hub-project-id")).toBe("ai-paper-reading-coach");
      expect(headers.get("x-hub-project-path")).toBe("/paper");
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

  it("normalizes fenced JSON and fallback text into coach output", () => {
    const parsed = extractJson('```json\n{"title":"地图","summary":"摘要","blocks":[{"heading":"问题","body":"内容","evidence":"based_on_text","refs":["S1-P1"]}]}\n```');
    const output = normalizeCoachOutput(parsed, CoachTaskSchema.parse("paper_map"));

    expect(output.title).toBe("地图");
    expect(output.blocks[0].refs).toEqual(["S1-P1"]);
    expect(normalizeCoachOutput("plain answer", "qa").summary).toContain("plain answer");
  });

  it("keeps quiz string arrays readable instead of empty fallback blocks", () => {
    const output = normalizeCoachOutput(
      {
        title: "复习包",
        summary: "ok",
        cards: [{ concept: "证据标签", definition: "区分文本、推测和不确定。" }],
        questions: ["研究问题是什么？"],
        interviewQuestions: [{ question: "如果你是评审会问什么？" }]
      },
      "quiz"
    );

    expect(output.cards[0].heading).toBe("证据标签");
    expect(output.cards[0].body).toContain("区分文本");
    expect(output.questions[0].heading).toBe("理解题 1");
    expect(output.questions[0].body).toContain("研究问题");
    expect(output.interviewQuestions[0].heading).toBe("面试式问题 1");
    expect(output.interviewQuestions[0].body).toContain("评审");
  });

  it("keeps model-provided answers, explanations, and string refs visible", () => {
    const output = normalizeCoachOutput(
      {
        title: "复习包",
        summary: "ok",
        cards: [
          {
            concept: "Self-attention",
            definition: "用序列内部 token 互相加权。",
            explanation: "本文用它替代循环结构。",
            citation: "S1-P1 S2-P1"
          }
        ],
        questions: [
          {
            question: "为什么不用 RNN？",
            answer: "论文认为注意力能缩短依赖路径。",
            refs: "S1-P1"
          }
        ]
      },
      "quiz"
    );

    expect(output.cards[0].body).toContain("定义：用序列内部 token 互相加权。");
    expect(output.cards[0].body).toContain("解释：本文用它替代循环结构。");
    expect(output.cards[0].refs).toEqual(["S1-P1", "S2-P1"]);
    expect(output.questions[0].body).toContain("问题：为什么不用 RNN？");
    expect(output.questions[0].body).toContain("答案：论文认为注意力能缩短依赖路径。");
  });

  it("does not render empty model blocks", () => {
    const output = normalizeCoachOutput(
      {
        title: "段落解释",
        summary: "ok",
        blocks: [{ heading: "关键概念", body: "", evidence: "based_on_text", refs: ["S1-P1"] }]
      },
      "section_explain"
    );

    expect(output.blocks[0].body).toContain("模型没有提供正文");
  });
});
