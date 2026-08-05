import { describe, expect, it } from "vitest";
import { buildDemoAnalysis, riskLevelFromScore } from "../server/analysis.js";
import type { AnalyzeRequest } from "../src/shared/contracts.js";

const baseRequest: AnalyzeRequest = {
  provider: "openai",
  model: "gpt-5.4",
  input: {
    text: "怎么还没发我？不是说今天给吗",
    channel: "message",
    intent: "想确认资料什么时候发来",
    toneGoal: "softer"
  }
};

describe("local misunderstanding analysis helper", () => {
  it("returns all required audience perspectives and rewrites", () => {
    const report = buildDemoAnalysis(baseRequest);

    expect(report.original).toBe(baseRequest.input.text);
    expect(report.overallRisk).toBeGreaterThanOrEqual(58);
    expect(report.audiences.map((audience) => audience.persona)).toEqual(["friend", "boss", "stranger", "sensitive"]);
    expect(report.rewrites.soft).toContain("温和确认");
    expect(report.quickFixes).toHaveLength(4);
  });

  it("maps risk scores to stable risk levels", () => {
    expect(riskLevelFromScore(18)).toBe("LOW");
    expect(riskLevelFromScore(34)).toBe("MEDIUM");
    expect(riskLevelFromScore(58)).toBe("MEDIUM_HIGH");
    expect(riskLevelFromScore(78)).toBe("HIGH");
  });
});
