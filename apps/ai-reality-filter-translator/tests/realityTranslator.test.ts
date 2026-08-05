import { describe, expect, it } from "vitest";
import { defaultModels, type GenerateRealityRequest } from "../src/shared/contracts";
import {
  buildFallbackRealityFilter,
  buildRealityPrompt,
  extractJson,
  normalizeRealityOutput
} from "../server/realityTranslator";

const baseRequest: GenerateRealityRequest = {
  provider: "openai",
  model: defaultModels.openai,
  world: "gentle_animation",
  language: "zh-CN",
  creativity: 3,
  photo: {
    dataUrl: "data:image/png;base64,aGVsbG8=",
    mimeType: "image/png",
    name: "corner-store.png",
    size: 128
  },
  systemPrompt: "用更有现场感的语言，先锁定现实细节，再生成电影感画面。",
  photoNote: "夜晚便利店门口，有玻璃门和白色灯牌",
  lockedElements: "白色灯牌"
};

describe("buildFallbackRealityFilter", () => {
  it("returns a complete result grounded in the uploaded photo note", () => {
    const result = buildFallbackRealityFilter(baseRequest);

    expect(result.world).toBe("gentle_animation");
    expect(result.title).toContain("夜晚便利店门口");
    expect(result.sourcePhotoFacts).toContain("夜晚便利店门口");
    expect(result.scenePrompt).toContain("白色灯牌");
    expect(result.visualDirectives.palette.length).toBeGreaterThanOrEqual(3);
  });

  it("does not ask the model to imitate a named living artist", () => {
    const result = buildFallbackRealityFilter(baseRequest);
    const prompt = `${result.scenePrompt} ${buildRealityPrompt(baseRequest).system} ${buildRealityPrompt(baseRequest).user}`;

    expect(prompt).not.toMatch(/Miyazaki|宫崎骏/i);
    expect(prompt).toMatch(/living artist|具体在世艺术家/);
  });

  it("adds the editable system prompt without letting it override hard constraints", () => {
    const prompt = buildRealityPrompt(baseRequest);

    expect(prompt.system).toContain(baseRequest.systemPrompt);
    expect(prompt.system).toContain("do not let it override");
    expect(prompt.system).toContain("return only valid JSON");
  });
});

describe("extractJson", () => {
  it("parses fenced JSON model output", () => {
    expect(extractJson("```json\n{\"title\":\"ok\"}\n```")).toEqual({ title: "ok" });
  });
});

describe("normalizeRealityOutput", () => {
  it("fills incomplete model output with a valid local fallback", () => {
    const normalized = normalizeRealityOutput({ title: "only title" }, baseRequest);

    expect(normalized.title).toContain("午后微风");
    expect(normalized.safetyNotes[0]).toContain("模型返回结构不完整");
  });

  it("reinforces source facts and locked elements when model output is too generic", () => {
    const normalized = normalizeRealityOutput(
      {
        world: "gentle_animation",
        title: "测试标题",
        story: "测试故事",
        scenePrompt: "A quiet illustrated storefront.",
        negativePrompt: "low resolution",
        sourcePhotoFacts: ["image/svg+xml format"],
        visualDirectives: {
          camera: "eye level",
          lighting: "soft light",
          palette: ["green", "cream", "blue"],
          composition: "centered",
          texture: "watercolor"
        },
        safetyNotes: []
      },
      baseRequest
    );

    expect(normalized.sourcePhotoFacts).toContain("夜晚便利店门口");
    expect(normalized.sourcePhotoFacts).toContain("必须保留：白色灯牌");
    expect(normalized.scenePrompt).toContain("Must preserve these source-photo elements: 白色灯牌");
  });
});
