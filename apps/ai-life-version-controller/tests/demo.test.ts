import { describe, expect, it } from "vitest";
import { buildDemoPlan } from "../server/demo";
import type { GenerateRequest } from "../src/shared/contracts";

const request: GenerateRequest = {
  provider: "openai",
  model: "gpt-5.4",
  input: {
    repoName: "life/main",
    currentState: "我正在纠结是否转行做 AI 产品。",
    decision: "要不要未来 90 天投入 AI 小产品？",
    values: "成长、自由、稳定",
    constraints: "每天只有 2 小时。",
    resources: "会前端，会调用 API。",
    timeHorizon: "未来 90 天"
  }
};

describe("buildDemoPlan", () => {
  it("creates a usable life repository plan", () => {
    const plan = buildDemoPlan(request);

    expect(plan.repoName).toBe("life/main");
    expect(plan.head).toBe("main");
    expect(plan.branches.length).toBeGreaterThanOrEqual(4);
    expect(plan.branches.some((branch) => branch.name === "feature/14-day-validation")).toBe(true);
    expect(plan.conflicts.length).toBeGreaterThanOrEqual(2);
    expect(plan.diff.length).toBeGreaterThanOrEqual(3);
    expect(plan.nextCommit.nextAction).toContain("今天");
  });
});
