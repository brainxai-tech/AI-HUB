import { describe, expect, it } from "vitest";
import { buildAnalysisPrompt, buildSystemPrompt } from "../server/prompts";

describe("analysis prompt", () => {
  it("builds a system prompt that improves noisy user input without overriding constraints", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain("User Intent Normalization");
    expect(prompt).toContain("clarify vague input");
    expect(prompt).toContain("preserve explicit user constraints");
    expect(prompt).toContain("do not invent business facts");
  });

  it("mentions every uploaded image and requires JSON output", () => {
    const prompt = buildAnalysisPrompt({
      provider: "demo",
      projectGoal: "做一个个人主页",
      images: [
        { name: "site.png", mimeType: "image/png", size: 1024, data: "data:image/png;base64,aaaa" },
        { name: "poster.jpg", mimeType: "image/jpeg", size: 1024, data: "data:image/jpeg;base64,bbbb" }
      ]
    });

    expect(prompt).toContain("用户上传了 2 张");
    expect(prompt).toContain("做一个个人主页");
    expect(prompt).toContain("只返回 JSON");
    expect(prompt).toContain("uiPrompt");
  });
});
