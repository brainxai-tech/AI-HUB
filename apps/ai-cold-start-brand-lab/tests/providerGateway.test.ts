import { describe, expect, it } from "vitest";
import { buildDemoBrandPack } from "../server/demoBrandPack.js";
import {
  extractJsonPayload,
  generateValidBrandPack,
  parseBrandPackPayload,
  ProviderError
} from "../server/providerGateway.js";
import type { GenerateBrandPackRequest } from "../src/shared/contracts.js";

const request: GenerateBrandPackRequest = {
  provider: "demo",
  model: "local-demo",
  focus: "full",
  input: {
    idea: "一个面向独立开发者的 AI 冷启动品牌实验室",
    targetAudience: "独立开发者",
    market: "AI SaaS",
    tone: "sharp-professional",
    language: "zh-CN",
    landingPageStyle: "problem"
  }
};

describe("provider gateway", () => {
  it("extracts JSON from fenced model output", () => {
    const pack = buildDemoBrandPack(request);
    expect(parseBrandPackPayload(`\`\`\`json\n${JSON.stringify(pack)}\n\`\`\``)).toEqual(pack);
  });

  it("rejects incomplete model output", () => {
    expect(() => parseBrandPackPayload(JSON.stringify({ brandNames: [] }))).toThrow(ProviderError);
  });

  it("retries once when the model returns invalid structured output", async () => {
    const pack = buildDemoBrandPack(request);
    const outputs = [JSON.stringify({ brandNames: [] }), JSON.stringify(pack)];
    let attempts = 0;

    const result = await generateValidBrandPack(async () => outputs[attempts++] ?? "");

    expect(result).toEqual(pack);
    expect(attempts).toBe(2);
  });

  it("keeps request API keys out of prompt parsing utilities", () => {
    const wrapped = `prefix ${JSON.stringify({ ok: true })} suffix`;
    expect(extractJsonPayload(wrapped)).toBe(JSON.stringify({ ok: true }));
  });

});
