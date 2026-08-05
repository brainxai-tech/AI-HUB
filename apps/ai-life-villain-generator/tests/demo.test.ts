import { describe, expect, it } from "vitest";
import { buildDemoResult } from "../dist-server/server/demo.js";
import { villainCardSchema } from "../dist-server/src/shared/contracts.js";

describe("demo villain card", () => {
  it("generates a complete card that preserves the user's goal", () => {
    const card = buildDemoResult({
      provider: "openai",
      model: "gpt-5.4",
      goal: "完成产品发布",
      blockerHint: "总想继续准备",
      deadline: "本周五",
      tone: "coach",
      cardStyle: "rpg"
    });

    expect(villainCardSchema.safeParse(card).success).toBe(true);
    expect(card.goal).toBe("完成产品发布");
    expect(card.strategy.todayQuest).toContain("完成产品发布");
  });
});
