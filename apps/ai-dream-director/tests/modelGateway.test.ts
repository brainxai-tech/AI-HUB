import { describe, expect, it } from "vitest";
import { defaultModels, type GenerateDreamRequest } from "../src/shared/contracts.js";
import { buildHubChatRequest, generateWithModel } from "../server/modelGateway.js";

const baseRequest: GenerateDreamRequest = {
  provider: "openai",
  model: defaultModels.openai,
  dreamText: "我梦见自己在一座没有天花板的地铁站等车，轨道里是一条黑色的河。",
  style: "film_noir",
  tone: "冷静、神秘",
  durationMinutes: 3,
  intensity: 4,
  language: "zh-CN"
};

describe("model gateway", () => {
  it("builds Hub chat requests without project-owned API keys", () => {
    const request = buildHubChatRequest(baseRequest);

    expect(request.provider).toBe("openai");
    expect(request.model).toBe(defaultModels.openai);
    expect(request.temperature).toBe(0.82);
    expect(request.maxTokens).toBeGreaterThan(4000);
    expect(request.messages).toHaveLength(2);
    expect(request.messages[0].content).toContain("AI 梦境导演");
    expect(request.messages[1].content).toContain("黑色的河");
    expect(JSON.stringify(request)).not.toContain("apiKey");
  });

  it("rejects local preview and non-GPT models at the Hub boundary", () => {
    expect(() => buildHubChatRequest({ ...baseRequest, provider: "demo", model: defaultModels.demo })).toThrow();
    expect(() => buildHubChatRequest({ ...baseRequest, model: "gemini-pro" })).toThrow();
  });

  it("normalizes Hub model text into a complete director output", async () => {
    const output = await generateWithModel(baseRequest, {
      callModel: async () =>
        JSON.stringify({
          title: "河站",
          logline: "梦在站台上等待。",
          directorStatement: "只拍梦，不解释梦。"
        })
    });

    expect(output.title).toBe("河站");
    expect(output.logline).toContain("站台");
    expect(output.acts).toHaveLength(3);
    expect(output.shots.length).toBeGreaterThanOrEqual(6);
  });
});
