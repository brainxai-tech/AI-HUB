import { describe, expect, it } from "vitest";
import { InterpretRequestSchema } from "../server/schemas";

const baseRequest = {
  dreamText: "我梦见自己在河边走，水很清，有人叫我的名字。",
  style: "balanced",
  provider: "openai",
  model: "gpt-5.4"
};

describe("InterpretRequestSchema", () => {
  it("accepts the Hub GPT request", () => {
    expect(InterpretRequestSchema.safeParse(baseRequest).success).toBe(true);
  });

  it("rejects non-OpenAI providers, non-GPT models, and legacy fields", () => {
    expect(InterpretRequestSchema.safeParse({ ...baseRequest, provider: "other" }).success).toBe(false);
    expect(InterpretRequestSchema.safeParse({ ...baseRequest, model: "text-model" }).success).toBe(false);
    expect(InterpretRequestSchema.safeParse({ ...baseRequest, keyMode: "preview" }).success).toBe(false);
    expect(InterpretRequestSchema.safeParse({ ...baseRequest, apiKey: "must-not-be-accepted" }).success).toBe(false);
  });

  it("trims dream text and normalizes missing tags", () => {
    const result = InterpretRequestSchema.parse({
      ...baseRequest,
      dreamText: "  我梦见考试迟到，在走廊里找不到教室。  "
    });
    expect(result.dreamText).toBe("我梦见考试迟到，在走廊里找不到教室。");
    expect(result.tags).toEqual([]);
  });
});
