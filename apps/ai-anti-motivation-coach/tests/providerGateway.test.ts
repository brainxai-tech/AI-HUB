import { describe, expect, it } from "vitest";
import { buildHubChatRequest, generateWithProvider, parseModelResult, ProviderError } from "../server/providerGateway.js";
import { buildSystemPrompt, buildUserPrompt } from "../server/prompt.js";
import { buildSafetyResult, needsSafetyMode } from "../server/safety.js";
import { generateRequestSchema, type GenerateRequest } from "../src/shared/contracts.js";

const baseRequest: GenerateRequest = {
  provider: "openai",
  model: "gpt-5.4",
  style: "calm",
  userText: "我想成为更好的自己，但总是坚持不下去。"
};

const validPayload = {
  originalInput: baseRequest.userText,
  headline: "把雾变成动作",
  verdict: "这句话的问题是太抽象，真正缺的是一个现在能打开的具体对象。",
  emptyPhrases: [
    {
      phrase: "更好的自己",
      whyItIsEmpty: "没有说明具体改变。",
      replaceWith: "今天完成一个 15 分钟动作。"
    }
  ],
  realityCheck: "真正的问题是没有开始条件，你可能在用“更好的自己”绕开具体任务。",
  actions: [
    {
      title: "打开一个真实任务",
      minutes: 15,
      firstStep: "打开你最近一直回避的文件或页面，只改一个标题或第一句话。",
      proof: "文件保存时间发生变化，页面里出现一个新标题。"
    }
  ],
  reviewQuestion: "今晚你能看到哪个文件、消息或任务窗口发生了变化？",
  boundary: "不替代专业服务。",
  safetyMode: false
};

describe("provider gateway", () => {
  it("parses fenced JSON returned by a model", () => {
    expect(parseModelResult(`\`\`\`json\n${JSON.stringify(validPayload)}\n\`\`\``)).toEqual(validPayload);
  });

  it("rejects model JSON missing required fields", () => {
    expect(() => parseModelResult(JSON.stringify({ headline: "太短" }))).toThrow(ProviderError);
  });

  it("builds Hub chat requests without project-owned API keys", () => {
    const request = buildHubChatRequest(baseRequest, buildUserPrompt(baseRequest), "initial");

    expect(request.provider).toBe("openai");
    expect(request.model).toBe("gpt-5.4");
    expect(request.temperature).toBe(0.45);
    expect(request.mode).toBe("initial");
    expect(request.messages).toHaveLength(2);
    expect(request.messages[0].content).toContain("AI 反鸡汤教练");
    expect(request.messages[1].content).toContain("更好的自己");
    expect(JSON.stringify(request)).not.toContain("apiKey");
  });

  it("rejects legacy vendors and non-GPT model names", () => {
    expect(generateRequestSchema.safeParse({ ...baseRequest, provider: "gemini" }).success).toBe(false);
    expect(generateRequestSchema.safeParse({ ...baseRequest, model: "claude-sonnet" }).success).toBe(false);
  });

  it("uses the injected model caller for deterministic tests", async () => {
    const result = await generateWithProvider(baseRequest, {
      callModel: async () => JSON.stringify(validPayload)
    });

    expect(result.data.actions[0]?.minutes).toBe(15);
    expect(result.rewritten).toBe(false);
  });

  it("rewrites once when the first model result fails quality checks", async () => {
    const weakPayload = {
      ...validPayload,
      actions: [
        {
          title: "写下来",
          minutes: 5,
          firstStep: "写下来，然后设定计时器做 5 分钟。",
          proof: "纸上打个勾。"
        },
        {
          title: "继续写下来",
          minutes: 5,
          firstStep: "再写下一个 5 分钟目标，打开计时器。",
          proof: "备忘录里有记录。"
        }
      ]
    };
    const callModes: string[] = [];
    const result = await generateWithProvider(baseRequest, {
      callModel: async (request) => {
        callModes.push(request.mode);
        return JSON.stringify(request.mode === "initial" ? weakPayload : validPayload);
      }
    });

    expect(callModes).toEqual(["initial", "rewrite"]);
    expect(result.rewritten).toBe(true);
    expect(result.data.headline).toBe(validPayload.headline);
  });

});

describe("prompt and safety", () => {
  it("forbids chicken-soup language in the system prompt", () => {
    const prompt = buildSystemPrompt({ ...baseRequest, style: "sharp" });
    expect(prompt).toContain("不要说");
    expect(prompt).toContain("不能攻击人格");
  });

  it("adds an input understanding protocol to improve short user prompts", () => {
    const prompt = buildSystemPrompt({ ...baseRequest, userText: "我很迷茫" });
    expect(prompt).toContain("输入理解协议");
    expect(prompt).toContain("表层表达 / 隐含目标 / 当前阻力 / 可验证行动");
    expect(prompt).toContain("不要编造用户没有给出的事实");
  });

  it("discourages repetitive generic actions in generated advice", () => {
    const prompt = buildSystemPrompt({ ...baseRequest, userText: "我总是拖延" });
    expect(prompt).toContain("回答质量协议");
    expect(prompt).toContain("不要每次都只给“写下来、设定计时器、做 5 分钟”");
    expect(prompt).toContain("环境动作、沟通动作、文件/任务动作");
  });

  it("routes crisis language to safety mode", () => {
    expect(needsSafetyMode("我不想活了")).toBe(true);
    expect(buildSafetyResult({ ...baseRequest, userText: "我不想活了" }).safetyMode).toBe(true);
  });
});
