import { describe, expect, it } from "vitest";
import { defaultModels, type GenerateDreamRequest } from "../src/shared/contracts.js";
import {
  buildDirectorPrompt,
  demoDirectorOutput,
  extractJson,
  extractDreamElements,
  normalizeDirectorOutput
} from "../server/dreamDirector.js";

const request: GenerateDreamRequest = {
  provider: "demo",
  model: defaultModels.demo,
  dreamText: "我梦见自己在一座没有天花板的地铁站等车，轨道里是一条黑色的河。",
  style: "surreal",
  tone: "迷离、克制、带一点希望",
  durationMinutes: 3,
  intensity: 3,
  language: "zh-CN"
};

describe("dream director engine", () => {
  it("builds a prompt that frames the product as directing, not dream analysis", () => {
    const prompt = buildDirectorPrompt(request);

    expect(prompt.system).toContain("不是解梦师");
    expect(prompt.system).toContain("只输出一个可被 JSON.parse");
    expect(prompt.user).toContain("黑色的河");
    expect(prompt.user).toContain("shots");
  });

  it("produces a complete local preview director output", () => {
    const output = demoDirectorOutput(request);

    expect(output.acts).toHaveLength(3);
    expect(output.shots.length).toBeGreaterThanOrEqual(6);
    expect(output.characters.length).toBeGreaterThanOrEqual(2);
    expect(output.dreamElements.length).toBeGreaterThanOrEqual(2);
    expect(output.fidelity.score).toBeGreaterThanOrEqual(80);
    expect(output.shots[0].composition).toContain("构图");
    expect(output.shots[0].lighting).toContain("光");
    expect(output.shots[0].videoPrompt).toContain("cinematic");
    expect(output.shots[0].negativePrompt).toContain("text");
    expect(output.poster.prompt).toContain("cinematic");
  });

  it("extracts lockable dream elements from concrete dream details", () => {
    const elements = extractDreamElements(
      "我梦见自己在一座废弃电影院里醒来，银幕上放着我小时候没有拍完的生日录像。每当我走近银幕，座位上的观众都会戴上我的脸。走廊尽头有一台自动售票机，只卖去往昨天的车票。最后我发现放映机里不是胶片，而是一串正在发光的钥匙。"
    );
    const labels = elements.map((item) => item.label);

    expect(labels).toEqual(
      expect.arrayContaining(["废弃电影院", "生日录像", "观众戴上我的脸", "自动售票机", "去往昨天的车票", "发光的钥匙"])
    );
  });

  it("puts locked elements and revision direction into the model prompt", () => {
    const prompt = buildDirectorPrompt({
      ...request,
      revisionMode: "more_faithful",
      dreamText: "废弃电影院里有生日录像、自动售票机和发光的钥匙。"
    });

    expect(prompt.user).toContain("锁定梦境元素");
    expect(prompt.user).toContain("废弃电影院");
    expect(prompt.user).toContain("重导向");
    expect(prompt.user).toContain("更忠于原梦");
    expect(prompt.user).toContain("videoPrompt");
    expect(prompt.user).toContain("composition");
    expect(prompt.user).toContain("lighting");
  });

  it("extracts fenced JSON and normalizes loose output to the full contract", () => {
    const parsed = extractJson('```json\n{"title":"河站","logline":"梦在站台上等待。","directorStatement":"只拍梦，不解释梦。"}\n```');
    const output = normalizeDirectorOutput(parsed);

    expect(output.title).toBe("河站");
    expect(output.logline).toContain("站台");
    expect(output.acts).toHaveLength(3);
    expect(output.fidelity.note).toContain("本地");
  });
});
