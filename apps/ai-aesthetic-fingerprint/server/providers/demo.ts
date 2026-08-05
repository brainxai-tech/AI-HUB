import type { AnalyzeRequest, AnalyzeResponse } from "../../src/shared/schema.js";
import type { ModelAdapter } from "./types.js";

export class DemoAdapter implements ModelAdapter {
  provider = "demo" as const;
  model = "demo-local";

  async analyze(input: AnalyzeRequest): Promise<AnalyzeResponse> {
    const names = input.images.map((image) => image.name);
    return {
      provider: this.provider,
      model: this.model,
      generatedAt: new Date().toISOString(),
      report: {
        summary: "你的审美偏向克制、清晰、带一点编辑感的现代界面。",
        dnaName: "Quiet Editorial System",
        color: {
          palette: ["#111827", "#f8fafc", "#d7b56d", "#6b7280", "#ffffff"],
          temperature: "中性偏暖，用少量金属或米色做强调。",
          contrast: "主体应保持高文字对比，但减少大面积强色块。",
          guidance: "用近黑文字、浅色底、低饱和强调色建立稳定的高级感。"
        },
        typography: {
          direction: "现代无衬线为主，可以用窄体或轻衬线点缀标题。",
          hierarchy: "标题要有明显尺度差，正文保持短行宽和清晰行距。",
          spacing: "中高留白，模块之间拉开距离，内部信息保持紧凑。"
        },
        layout: {
          composition: "偏好非对称网格、左对齐信息和强烈的首屏主次关系。",
          density: "中等密度，适合工具型页面和设计报告页。",
          rhythm: "大片留白与紧凑数据块交替，避免平均铺满。"
        },
        mood: [
          { label: "克制", evidence: "整体更适合低饱和底色和少量强调色。", confidence: 0.78 },
          { label: "编辑感", evidence: "报告页应强调标题、引文式短句和清晰分栏。", confidence: 0.72 },
          { label: "专业", evidence: "视觉语言要支持长期阅读和反复使用。", confidence: 0.7 },
          { label: "轻奢", evidence: "可使用金属感暖色，但只作为点睛。", confidence: 0.62 }
        ],
        taboos: [
          "避免紫蓝大渐变和发光光斑。",
          "避免卡片套卡片和过重阴影。",
          "避免超大圆角按钮和模板化 AI 工具感。",
          "避免颜色过多导致审美指纹失焦。",
          "避免长篇说明压过结果本身。"
        ],
        nextDirections: [
          {
            title: "克制编辑版",
            description: "用杂志式标题、分栏报告、低饱和强调色表达个人审美 DNA。",
            whenToUse: "适合个人主页、作品集或审美报告。"
          },
          {
            title: "工具产品版",
            description: "提高控件密度，把上传、分析、报告、复制 prompt 做成稳定工作台。",
            whenToUse: "适合 MVP 和后续 SaaS 化。"
          },
          {
            title: "品牌实验版",
            description: "保留克制骨架，增加更强的排版反差和大图预览区域。",
            whenToUse: "适合海报、活动页或视觉展示。"
          }
        ],
        uiPrompt: "Design a calm editorial AI workspace for an aesthetic fingerprint report. Use a restrained neutral palette with near-black text, warm muted accent colors, clear typographic hierarchy, asymmetric grid layout, generous whitespace, compact control panels, and polished report sections. Avoid purple-blue gradients, glowing blobs, oversized rounded cards, heavy shadows, and generic AI dashboard styling. The interface should feel precise, design-aware, quiet, and useful for turning uploaded visual references into a next-version UI direction.",
        imageNotes: names.map((name) => ({
          imageName: name,
          observations: ["示例模式未读取真实图像，仅用于预览报告结构。", "连接真实视觉模型后会替换为逐图观察。"]
        })),
        caveats: ["这是离线示例报告，不代表真实图片分析结果。请前往 AI Hub 的模型配置统一启用视觉模型后运行真实分析。"]
      }
    };
  }
}
