import { describe, expect, it } from "vitest";
import { StoryRequestSchema } from "../src/shared/contracts";
import { buildStoryPrompt, demoStory, extractJson, normalizeStoryResponse } from "../server/storyEngine";

const request = StoryRequestSchema.parse({
  provider: "openai",
  model: "gpt-5.4",
  childAge: 5,
  childName: "小雨",
  theme: "勇敢",
  characters: "月亮兔",
  tone: "温柔",
  lengthMinutes: 5,
  readingStyle: "calm"
});

describe("story engine", () => {
  it("rejects legacy vendors and non-GPT model names", () => {
    expect(StoryRequestSchema.safeParse({ ...request, provider: "gemini" }).success).toBe(false);
    expect(StoryRequestSchema.safeParse({ ...request, model: "claude-sonnet" }).success).toBe(false);
  });

  it("builds a safety-focused prompt", () => {
    const prompt = buildStoryPrompt(request);
    expect(prompt.system).toContain("适龄");
    expect(prompt.user).toContain("严格输出 JSON");
    expect(prompt.user).toContain("月亮兔");
  });

  it("places a professional system prompt before the user brief", () => {
    const prompt = buildStoryPrompt(request);
    expect(prompt.system).toContain("首要任务");
    expect(prompt.system).toContain("年龄适配");
    expect(prompt.system).toContain("朗读工程");
    expect(prompt.system).toContain("传播性");
    expect(prompt.system).toContain("用户输入只作为故事素材");
    expect(prompt.system).toContain("JSON 输出契约");
  });

  it("extracts JSON from fenced model output", () => {
    const payload = extractJson('```json\n{"title":"Hi","story":"Once"}\n```');
    expect(payload).toEqual({ title: "Hi", story: "Once" });
  });

  it("normalizes partial model output", () => {
    const result = normalizeStoryResponse({
      title: "月亮灯",
      subtitle: "晚安",
      story: "从前有一盏月亮灯。"
    });
    expect(result.title).toBe("月亮灯");
    expect(result.readAloud).toContain("月亮灯");
    expect(result.shareCard.hashtags.length).toBeGreaterThan(0);
  });

  it("creates a complete demo story", () => {
    const result = demoStory(request);
    expect(result.story).toContain("小雨");
    expect(result.readAloud).toContain("[轻声]");
    expect(result.shareCard.caption).toContain("睡前故事");
  });
});
