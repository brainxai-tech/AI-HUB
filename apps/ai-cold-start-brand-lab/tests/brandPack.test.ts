import { describe, expect, it } from "vitest";
import { buildDemoBrandPack } from "../server/demoBrandPack.js";
import { brandPackSchema, type GenerateBrandPackRequest } from "../src/shared/contracts.js";

const request: GenerateBrandPackRequest = {
  provider: "demo",
  model: "local-demo",
  focus: "full",
  input: {
    idea: "一个输入产品想法后生成品牌名和首页文案的 AI 工具",
    targetAudience: "AI 创业者",
    market: "冷启动品牌工具",
    tone: "bold-growth",
    language: "zh-CN",
    landingPageStyle: "outcome"
  }
};

describe("demo brand pack", () => {
  it("returns the complete MVP output shape", () => {
    const pack = buildDemoBrandPack(request);
    const parsed = brandPackSchema.safeParse(pack);

    expect(parsed.success).toBe(true);
    expect(pack.brandNames.length).toBeGreaterThanOrEqual(3);
    expect(pack.personas).toHaveLength(3);
    expect(pack.landingPageDirections).toHaveLength(3);
    expect(pack.landingPageCopy.hero.headline).toContain("品牌名");
  });
});
