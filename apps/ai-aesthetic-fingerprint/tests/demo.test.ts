import { describe, expect, it } from "vitest";
import { DemoAdapter } from "../server/providers/demo";
import { providerStatus } from "../server/providers";

describe("demo report guidance", () => {
  it("directs users to the centralized AI Hub model settings", async () => {
    const response = await new DemoAdapter().analyze({
      provider: "demo",
      images: [
        {
          name: "sample.png",
          mimeType: "image/png",
          size: 128,
          data: `data:image/png;base64,${"a".repeat(64)}`
        }
      ]
    });
    const caveats = response.report.caveats.join("\n");

    expect(caveats).toContain("AI Hub");
    expect(caveats).not.toContain("请配置 OpenAI、Claude 或 Gemini API Key");
  });
});

describe("unified provider status", () => {
  it("exposes only the Hub GPT route and the local fallback", () => {
    const providers = providerStatus();

    expect(providers.map((item) => item.provider)).toEqual(["openai", "demo"]);
    expect(providers[0].label).toContain("AI Routing");
  });
});
