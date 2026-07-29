import { describe, expect, it } from "vitest";
import { counterfactualResultSchema, defaultModels, generateRequestSchema } from "../src/shared/contracts";
import { demoCounterfactualResult } from "../server/localDemo";

describe("contracts", () => {
  it("validates the demo result against the public result schema", () => {
    const request = generateRequestSchema.parse({
      provider: "demo",
      model: defaultModels.demo,
      question: "如果我当初去了北京而不是留在杭州？",
      context: "",
      tone: "gentle",
      depth: "standard"
    });

    const result = demoCounterfactualResult(request);
    expect(() => counterfactualResultSchema.parse(result)).not.toThrow();
    expect(result.branches).toHaveLength(3);
  });

  it("only exposes Hub GPT and local preview providers", () => {
    expect(Object.keys(defaultModels)).toEqual(["openai", "demo"]);
    expect(defaultModels.openai).toMatch(/^gpt-/i);
  });

  it("rejects vendor providers and non-GPT real models", () => {
    const baseRequest = {
      model: defaultModels.openai,
      question: "如果当初我选择了另一条职业路线，现在可能会怎样？",
      context: "",
      tone: "gentle",
      depth: "standard"
    };

    expect(generateRequestSchema.safeParse({ ...baseRequest, provider: "gemini" }).success).toBe(false);
    expect(generateRequestSchema.safeParse({ ...baseRequest, provider: "openai", model: "claude-sonnet" }).success).toBe(false);
  });
});
