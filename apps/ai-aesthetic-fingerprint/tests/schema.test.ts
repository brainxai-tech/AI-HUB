import { describe, expect, it } from "vitest";
import { analyzeRequestSchema, analyzeResponseSchema } from "../src/shared/schema";

describe("shared analysis schema", () => {
  it("accepts a minimal valid multi-image request", () => {
    const result = analyzeRequestSchema.safeParse({
      provider: "demo",
      projectGoal: "个人主页下一版视觉方向",
      images: [
        {
          name: "poster.png",
          mimeType: "image/png",
          size: 1024,
          data: "data:image/png;base64," + "a".repeat(64)
        },
        {
          name: "web.webp",
          mimeType: "image/webp",
          size: 2048,
          data: "data:image/webp;base64," + "b".repeat(64)
        }
      ]
    });

    expect(result.success).toBe(true);
  });

  it("rejects unsupported files and too many images", () => {
    const images = Array.from({ length: 11 }, (_, index) => ({
      name: `file-${index}.gif`,
      mimeType: "image/gif",
      size: 1024,
      data: "data:image/gif;base64," + "a".repeat(64)
    }));

    const result = analyzeRequestSchema.safeParse({ images });

    expect(result.success).toBe(false);
  });

  it("rejects legacy vendor selections outside the unified Hub route", () => {
    const result = analyzeRequestSchema.safeParse({
      provider: "gemini",
      images: [
        {
          name: "poster.png",
          mimeType: "image/png",
          size: 1024,
          data: "data:image/png;base64," + "a".repeat(64)
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("requires complete report sections for API responses", () => {
    const result = analyzeResponseSchema.safeParse({
      provider: "demo",
      model: "demo-local",
      generatedAt: new Date().toISOString(),
      report: {
        summary: "偏好清晰的编辑感界面。",
        dnaName: "冷静编辑型",
        color: {
          palette: ["#111827", "#f8fafc", "#d4a373"],
          temperature: "中性偏暖",
          contrast: "高对比",
          guidance: "用克制底色承载少量暖色强调。"
        },
        typography: {
          direction: "现代无衬线",
          hierarchy: "强标题、短段落",
          spacing: "中高留白"
        },
        layout: {
          composition: "非对称网格",
          density: "中等",
          rhythm: "大片留白与紧凑模块交替"
        },
        mood: [
          { label: "克制", evidence: "低饱和背景", confidence: 0.8 },
          { label: "编辑感", evidence: "清晰字号层级", confidence: 0.74 },
          { label: "高级", evidence: "少量强调色", confidence: 0.69 }
        ],
        taboos: ["避免霓虹渐变", "避免圆角过大", "避免厚重阴影"],
        nextDirections: [
          { title: "克制增强", description: "保留留白，加大排版张力。", whenToUse: "想做个人主页" },
          { title: "商业转译", description: "加入更明确 CTA 与产品截图。", whenToUse: "想做 SaaS" }
        ],
        uiPrompt: "Design a calm editorial interface with strong hierarchy, restrained neutral palette, subtle warm accent, clear grid, and no heavy gradients.",
        imageNotes: [
          { imageName: "poster.png", observations: ["高对比", "留白明显"] }
        ],
        caveats: ["样本较少，建议补充更多网页截图。"]
      }
    });

    expect(result.success).toBe(true);
  });
});
