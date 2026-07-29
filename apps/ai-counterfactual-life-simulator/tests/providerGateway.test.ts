import { describe, expect, it } from "vitest";
import { defaultModels, generateRequestSchema } from "../src/shared/contracts";
import { demoCounterfactualResult } from "../server/localDemo";
import { buildHubChatRequest, parseModelResult, ProviderError } from "../server/providerGateway";
import { buildSystemPrompt, buildUserPrompt } from "../server/prompt";

describe("provider gateway", () => {
  const request = generateRequestSchema.parse({
    provider: "demo",
    model: defaultModels.demo,
    question: "如果我当初接受那份大厂 offer，而不是创业？",
    context: "当时 24 岁，现实中选择了创业，现在担心职业路径不够稳定。",
    tone: "rational",
    depth: "standard"
  });

  it("parses valid fenced JSON returned by a model", () => {
    const raw = `\`\`\`json\n${JSON.stringify(demoCounterfactualResult(request))}\n\`\`\``;
    expect(parseModelResult(raw).branches).toHaveLength(3);
  });

  it("rejects malformed JSON before the UI can render it", () => {
    expect(() => parseModelResult("{ not json")).toThrow(ProviderError);
  });

  it("builds Hub chat requests without project-owned API keys", () => {
    const hubRequest = buildHubChatRequest({
      ...request,
      provider: "openai",
      model: defaultModels.openai
    });

    expect(hubRequest.provider).toBe("openai");
    expect(hubRequest.model).toBe(defaultModels.openai);
    expect(hubRequest.messages).toHaveLength(2);
    expect(hubRequest.messages[0].content).toContain("反事实人生推演助手");
    expect(hubRequest.messages[1].content).toContain("用户问题");
    expect(JSON.stringify(hubRequest)).not.toContain("apiKey");
  });

  it("rejects local preview and non-GPT models at the Hub boundary", () => {
    expect(() => buildHubChatRequest(request)).toThrow(ProviderError);
    expect(() => buildHubChatRequest({ ...request, provider: "openai", model: "gemini-pro" })).toThrow(ProviderError);
  });

  it("keeps prompt safety requirements explicit", () => {
    const systemPrompt = buildSystemPrompt(request);
    const userPrompt = buildUserPrompt(request);
    expect(systemPrompt).toContain("不是预测命运");
    expect(systemPrompt).toContain("不要使用");
    expect(systemPrompt).toContain("输入理解");
    expect(systemPrompt).toContain("现实选择 B");
    expect(systemPrompt).toContain("反事实选择 A");
    expect(systemPrompt).toContain("不要向用户追问");
    expect(userPrompt).toContain("用户真正关心的取舍");
    expect(userPrompt).toContain("reframe 字段");
    expect(userPrompt).toContain("0-6 个月");
  });
});
