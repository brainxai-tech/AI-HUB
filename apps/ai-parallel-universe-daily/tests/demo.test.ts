import { describe, expect, it } from "vitest";
import { demoParallelDaily } from "../dist-server/server/localDemo.js";
import { parallelDailyResultSchema } from "../dist-server/src/shared/contracts.js";

describe("local parallel-universe report", () => {
  it("returns all three universes and a bounded next action", () => {
    const report = demoParallelDaily({
      provider: "openai",
      model: "gpt-5.4",
      activity: "今天完成了产品首页",
      goal: "本周发布产品",
      mood: "有点累但很踏实",
      tomorrowMinutes: 120,
      tone: "editorial",
      locale: "zh-CN"
    });

    expect(parallelDailyResultSchema.safeParse(report).success).toBe(true);
    expect(report.reports.map((item) => item.universe)).toEqual(["persisted", "quit", "drifted"]);
    expect(report.actionPlan.firstStepMinutes).toBeLessThanOrEqual(35);
  });
});
