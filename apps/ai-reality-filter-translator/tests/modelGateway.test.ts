import { describe, expect, it, vi } from "vitest";
import {
  defaultModels,
  GenerateRealityRequestSchema,
  type GenerateRealityRequest,
  type RealityFilterOutput
} from "../src/shared/contracts";
import { buildHubChatRequest, generateWithProvider } from "../server/modelGateway";

const baseRequest: GenerateRealityRequest = {
  provider: "openai",
  model: defaultModels.openai,
  world: "cyber_city",
  language: "zh-CN",
  creativity: 3,
  photo: {
    dataUrl: "data:image/png;base64,aGVsbG8=",
    mimeType: "image/png",
    name: "corner-store.png",
    size: 128
  },
  photoNote: "夜晚便利店门口",
  lockedElements: "白色灯牌"
};

describe("Hub model gateway", () => {
  it("builds a project-safe GPT vision request", () => {
    const request = buildHubChatRequest(baseRequest);

    expect(request.provider).toBe("openai");
    expect(request.model).toBe("gpt-5.4");
    expect(request.messages[0].content).toContain("reality-filter translator");
    expect(request.messages[1].content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "image_url" })
    ]));
  });

  it("normalizes structured output returned through Hub", async () => {
    const callModel = vi.fn(async () => JSON.stringify(modelOutput));
    const result = await generateWithProvider(baseRequest, { callModel });

    expect(result.title).toBe("霓虹便利店");
    expect(result.world).toBe("cyber_city");
    expect(callModel).toHaveBeenCalledOnce();
  });

  it("rejects non-OpenAI providers at the model boundary", () => {
    expect(() => buildHubChatRequest({ ...baseRequest, provider: "other" as never })).toThrowError(
      expect.objectContaining({ code: "INVALID_PROVIDER", status: 422 })
    );
  });

  it("rejects non-GPT models at the model boundary", () => {
    expect(() => buildHubChatRequest({ ...baseRequest, model: "text-model" })).toThrowError(
      expect.objectContaining({ code: "INVALID_MODEL", status: 422 })
    );
  });

  it("rejects legacy credential fields at the request schema", () => {
    const parsed = GenerateRealityRequestSchema.safeParse({ ...baseRequest, apiKey: "must-not-be-accepted" });
    expect(parsed.success).toBe(false);
  });
});

const modelOutput: RealityFilterOutput = {
  world: "cyber_city",
  title: "霓虹便利店",
  story: "一段保留原图事实的世界观故事。",
  scenePrompt: "Preserve the store sign and translate it into a neon district.",
  negativePrompt: "unrelated subject, low resolution",
  sourcePhotoFacts: ["夜晚便利店门口", "白色灯牌"],
  visualDirectives: {
    camera: "35mm street photography",
    lighting: "neon rain reflections",
    palette: ["cyan", "magenta", "sodium amber"],
    composition: "keep the original subject placement",
    texture: "wet glass and brushed metal"
  },
  safetyNotes: ["虚构娱乐表达"]
};
