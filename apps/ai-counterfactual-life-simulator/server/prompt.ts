import type { GenerateRequest } from "../src/shared/contracts.js";

export const counterfactualJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["question", "reframe", "disclaimer", "branches", "overallAdvice"],
  properties: {
    question: { type: "string" },
    reframe: { type: "string" },
    disclaimer: { type: "string" },
    branches: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "summary",
          "branchType",
          "timeline",
          "shortTermResult",
          "longTermCost",
          "hiddenOpportunity",
          "realityAdvice",
          "riskReward"
        ],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
          branchType: { type: "string", enum: ["upside", "cost", "opportunity"] },
          timeline: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["period", "label", "content"],
              properties: {
                period: { type: "string" },
                label: { type: "string" },
                content: { type: "string" }
              }
            }
          },
          shortTermResult: { type: "string" },
          longTermCost: { type: "string" },
          hiddenOpportunity: { type: "string" },
          realityAdvice: { type: "string" },
          riskReward: {
            type: "object",
            additionalProperties: false,
            required: ["rewardScore", "riskScore", "uncertainty", "emotion"],
            properties: {
              rewardScore: { type: "integer", minimum: 1, maximum: 5 },
              riskScore: { type: "integer", minimum: 1, maximum: 5 },
              uncertainty: { type: "string", enum: ["low", "medium", "high"] },
              emotion: { type: "string" }
            }
          }
        }
      }
    },
    overallAdvice: { type: "string" }
  }
} as const;

export function buildSystemPrompt(input: GenerateRequest) {
  return [
    "你是一个清醒、温柔、克制的反事实人生推演助手。",
    "你的任务是帮助用户把“如果当初……”这种问题整理成可比较的人生分支，而不是预测命运。",
    "",
    "在生成前，先在内部完成一次“输入理解”，但不要把这段内部分析直接输出：",
    "1. 提取现实选择 B：用户真实走过的路径是什么。",
    "2. 提取反事实选择 A：用户想象中没走的路径是什么。",
    "3. 提取用户真正关心的取舍：成长、稳定、关系、金钱、身份、自由、遗憾或安全感。",
    "4. 区分事实、推测和未知：只把用户明确说出的内容当事实；背景不足时要提高不确定性。",
    "5. 识别情绪核心：用户是在后悔、好奇、比较、求安慰、求行动建议，还是想重新理解自己。",
    "6. 把问题重构成一个更适合推演的主题，例如“职业成长 vs. 生活稳定”“亲密关系 vs. 自我边界”。",
    "7. 不要向用户追问；如果信息不足，就用保守假设生成，并在 reframe 或 uncertainty 中说明边界。",
    "",
    "必须输出 3 条分支：upside 收益线、cost 代价线、opportunity 隐藏机会线。",
    "每条分支都必须同时包含短期结果、长期代价、隐藏机会、现实建议、3 个时间线节点和风险/收益评分。",
    "三条分支要彼此有清晰差异，不要只是改写同一个观点。",
    "短期结果要写具体生活变化；长期代价要写真实机会成本；隐藏机会要写用户没想到但可迁移到现在的能力或资源。",
    "现实建议必须是低成本、可执行、可在 7-30 天内尝试的小行动。",
    "不要使用“你一定会”“命中注定”“唯一正确选择”等绝对表达。",
    "不要羞辱用户过去的选择，不要鼓励冲动分手、辞职、投资、断联或其他高风险行为。",
    "如果输入涉及自伤、医疗、法律、金融或人身安全风险，降低确定性语气，并建议联系现实中的可信支持或专业机构。",
    `语气：${toneInstruction(input.tone)}。`,
    `深度：${depthInstruction(input.depth)}。`,
    "只返回合法 JSON，不返回 Markdown、解释、代码块或多余文字。"
  ].join("\n");
}

export function buildUserPrompt(input: GenerateRequest) {
  return [
    "请把下面的用户输入先重构成更清晰的反事实选择，再生成结果。",
    `用户问题：${input.question}`,
    input.context ? `背景补充：${input.context}` : "背景补充：用户没有提供更多背景，请保持保守和高不确定性。",
    "请在内部识别：真实选择 B、反事实选择 A、用户真正关心的取舍、情绪核心、已知事实和未知假设。",
    "reframe 字段要用一句话说明你把这个问题理解成了什么取舍。",
    "时间线节点必须固定为：0-6 个月、1-2 年、3-5 年。",
    "disclaimer 必须明确说明：这是基于输入信息的反事实推演，不是命运预测，也不能替代专业建议。",
    "overallAdvice 必须回到现在可做的小行动。",
    "JSON 字段必须完整匹配 schema。"
  ].join("\n");
}

export function maxTokensForDepth(depth: GenerateRequest["depth"]) {
  if (depth === "light") return 1800;
  if (depth === "deep") return 3200;
  return 2400;
}

export function temperatureForTone(tone: GenerateRequest["tone"]) {
  if (tone === "sharp") return 0.75;
  if (tone === "rational") return 0.35;
  return 0.55;
}

function toneInstruction(tone: GenerateRequest["tone"]) {
  if (tone === "sharp") return "更直接，但不刻薄";
  if (tone === "rational") return "更理性，重视取舍和证据边界";
  return "温柔但不鸡汤";
}

function depthInstruction(depth: GenerateRequest["depth"]) {
  if (depth === "light") return "每个字段 1 句，保持精炼";
  if (depth === "deep") return "允许更细腻的解释，但每个字段最多 2 句";
  return "每个字段 1-2 句，兼顾洞察和可读性";
}
