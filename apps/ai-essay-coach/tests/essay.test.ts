import { describe, expect, it } from "vitest";
import { buildDemoAnalysis, buildDemoEssay, buildDemoOutlines } from "../server/demo";
import { buildComposePrompt } from "../server/prompt";
import {
  countEssayLength,
  fitEssayLength,
  trimEssayToLength,
  type ComposeRequest,
  type EssayInput,
  type MaterialAnswers
} from "../src/shared/contracts";

const input: EssayInput = {
  prompt: "请以“藏在小事里的成长”为题，写一篇不少于800字的记叙文，要求结合个人经历。",
  grade: "初二",
  genre: "记叙文",
  targetLength: 800,
  includePunctuation: true,
  scene: "日常练习"
};

const materials: MaterialAnswers = {
  experience: "一次放学后值日，我本来想随便擦两下课桌就回家，后来重新认真整理。",
  detail: "窗边旧课桌上的粉笔印和水滴落在水池边的声音",
  insight: "成长是在没人提醒时也愿意把小事做好。"
};

describe("essay length utilities", () => {
  it("counts punctuation only when requested", () => {
    expect(countEssayLength("你好，世界！", true)).toBe(6);
    expect(countEssayLength("你好，世界！", false)).toBe(4);
  });

  it("ignores whitespace for both counting modes", () => {
    expect(countEssayLength("你 好\n世界", true)).toBe(4);
    expect(countEssayLength("你 好\n世界", false)).toBe(4);
  });

  it("trims an overlong essay without exceeding the cap", () => {
    const trimmed = trimEssayToLength("这是一个句子。".repeat(100), 120, true);
    expect(countEssayLength(trimmed, true)).toBeLessThanOrEqual(120);
    expect(trimmed).toMatch(/[。！？…」”]$/u);
  });

  it("uses supplied expansion paragraphs before trimming", () => {
    const result = fitEssayLength("开头。", 20, true, ["这是用于补足内容的第一个段落。", "这是第二个段落。"]);
    expect(countEssayLength(result, true)).toBeGreaterThan(6);
    expect(countEssayLength(result, true)).toBeLessThanOrEqual(21);
  });
});

describe("demo writing flow", () => {
  it("creates specific analysis and three material questions", () => {
    const analysis = buildDemoAnalysis(input);
    expect(analysis.theme).toContain("成长");
    expect(analysis.requirements).toHaveLength(3);
    expect(analysis.questions).toHaveLength(3);
    expect(analysis.avoid.length).toBeGreaterThanOrEqual(2);
  });

  it("creates three distinct five-part outlines", () => {
    const result = buildDemoOutlines(input, materials);
    expect(result.outlines.map((outline) => outline.style)).toEqual(["稳妥型", "个性型", "提分型"]);
    expect(result.outlines.every((outline) => outline.sections.length === 5)).toBe(true);
    expect(new Set(result.outlines.map((outline) => outline.title)).size).toBe(3);
  });

  it("keeps narrative output inside the target range", () => {
    const outline = buildDemoOutlines(input, materials).outlines[1];
    const request: ComposeRequest = { input, materials, outline };
    const result = buildDemoEssay(request);
    expect(result.characterCount).toBeGreaterThanOrEqual(760);
    expect(result.characterCount).toBeLessThanOrEqual(840);
    expect(result.essay).toContain("粉笔印");
    expect(result.feedback.dimensions).toHaveLength(5);
  });

  it("keeps argumentative output inside the target range", () => {
    const argumentInput: EssayInput = { ...input, genre: "议论文", prompt: "请以“行动带来改变”为题写一篇议论文。" };
    const outline = buildDemoOutlines(argumentInput, materials).outlines[0];
    const result = buildDemoEssay({ input: argumentInput, materials, outline });
    expect(result.characterCount).toBeGreaterThanOrEqual(760);
    expect(result.characterCount).toBeLessThanOrEqual(840);
    expect(result.essay).toContain("行动");
  });

  it("keeps the target and factual materials in the real-model prompt", () => {
    const outline = buildDemoOutlines(input, materials).outlines[0];
    const prompt = buildComposePrompt({ input, materials, outline });
    expect(prompt).toContain("760—840");
    expect(prompt).toContain(materials.detail);
    expect(prompt).toContain("不得擅自编造");
  });
});
