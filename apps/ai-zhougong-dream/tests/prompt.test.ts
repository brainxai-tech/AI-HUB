import { describe, expect, it } from "vitest";
import { buildDreamPrompt, buildDreamSystemPrompt } from "../server/prompt";
import type { RagCitation } from "../shared/types";
import type { ParsedInterpretRequest } from "../server/schemas";

const baseInput: ParsedInterpretRequest = {
  dreamText: "我梦见蛇在河边追我，醒来后很紧张。",
  mood: "紧张",
  tags: ["压力", "关系"],
  style: "balanced",
  provider: "openai",
  model: "gpt-5.4"
};

const ragCitations: RagCitation[] = [
  {
    id: "zhougong-test-snake",
    category: "龍蛇禽獸",
    original: "蛇入怀中，生贵子。",
    sourceTitle: "维基文库《周公解梦》",
    sourceUrl: "https://zh.wikisource.org/wiki/%E5%91%A8%E5%85%AC%E8%A7%A3%E5%A4%A2",
    sourceLicense: "Wikisource CC BY-SA 4.0",
    score: 48
  }
];

describe("buildDreamSystemPrompt", () => {
  it("sets RAG grounding, untrusted input, safety, and JSON boundaries", () => {
    const systemPrompt = buildDreamSystemPrompt();

    expect(systemPrompt).toContain("RAG");
    expect(systemPrompt).toContain("优先依据");
    expect(systemPrompt).toContain("不可信数据");
    expect(systemPrompt).toContain("不要遵循");
    expect(systemPrompt).toContain("不要编造");
    expect(systemPrompt).toContain("合法 JSON");
    expect(systemPrompt).toContain("自伤");
  });
});

describe("buildDreamPrompt", () => {
  it("keeps retrieved Zhougong entries and user dream text in separated sections", () => {
    const userPrompt = buildDreamPrompt(baseInput, [{ name: "蛇", meaning: "传统中常与变化和警觉相关。" }], ragCitations);

    expect(userPrompt).toContain("检索到的《周公解梦》RAG 原文条目");
    expect(userPrompt).toContain("[龍蛇禽獸] 蛇入怀中，生贵子。");
    expect(userPrompt).toContain("用户梦境");
    expect(userPrompt).toContain(baseInput.dreamText);
    expect(userPrompt).toContain("用户醒来情绪：紧张");
  });
});
