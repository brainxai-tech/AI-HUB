import { describe, expect, it } from "vitest";
import { buildLocalBoardReport, ensureRoleCoverage, tallyVotes } from "../server/board.js";
import { buildSystemPrompt, buildUserPrompt } from "../server/prompt.js";
import type { GenerateRequest } from "../src/shared/contracts.js";

const request: GenerateRequest = {
  provider: "openai",
  model: "gpt-5.4",
  input: {
    idea: "做一个 AI 一人董事会，输入项目想法后让 CEO、CFO、用户、工程师、设计师轮流质询并投票。",
    targetUser: "独立开发者和早期创业者",
    problem: "早期想法太容易自嗨，缺少反对意见。",
    businessModel: "按次付费或订阅",
    constraints: "MVP 只做单次评审"
  }
};

describe("board report", () => {
  it("builds a complete five-role local board report", () => {
    const report = buildLocalBoardReport(request);

    expect(report.directors).toHaveLength(5);
    expect(ensureRoleCoverage(report)).toBe(true);
    expect(report.voteTally.GO + report.voteTally.PIVOT + report.voteTally.VALIDATE + report.voteTally.KILL).toBe(5);
    expect(report.finalDecision.sevenDayPlan.length).toBeGreaterThanOrEqual(5);
  });

  it("tallies votes without dropping any recommendation type", () => {
    expect(tallyVotes(["GO", "GO", "PIVOT", "VALIDATE", "KILL"])).toEqual({
      GO: 2,
      PIVOT: 1,
      VALIDATE: 1,
      KILL: 1
    });
  });
});

describe("prompt", () => {
  it("requires strict JSON and all board roles", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("只返回 JSON");
    expect(prompt).toContain("CEO");
    expect(prompt).toContain("CFO");
    expect(prompt).toContain("设计师");
  });

  it("guides the model to enrich rough user input before judging", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("输入理解与增强规则");
    expect(prompt).toContain("目标用户");
    expect(prompt).toContain("最危险假设");
    expect(prompt).toContain("待验证");
    expect(prompt).toContain("可验证表述");
    expect(prompt).toContain("具体模型名或供应商品牌");
    expect(prompt).toContain("模型 API");
    expect(prompt).toContain("第 1 天");
  });

  it("pushes the board toward role-specific conflict instead of mechanical consensus", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("角色冲突与投票性格");
    expect(prompt).toContain("工程师关注最小可行路径");
    expect(prompt).toContain("设计师关注输入门槛");
    expect(prompt).toContain("不要让五个角色全部投同一票");
    expect(prompt).toContain("finalDecision.reason");
  });

  it("includes optional user context when present", () => {
    const prompt = buildUserPrompt(request);
    expect(prompt).toContain("独立开发者");
    expect(prompt).toContain("按次付费");
  });
});
