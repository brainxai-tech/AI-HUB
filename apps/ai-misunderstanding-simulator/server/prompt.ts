import {
  channelLabels,
  personaLabels,
  riskLevelLabels,
  toneGoalLabels,
  type AnalyzeRequest
} from "../src/shared/contracts.js";

export const MODEL_TEMPERATURE = 0.35;
export const MODEL_MAX_TOKENS = 2600;

export function buildSystemPrompt() {
  return [
    "你是一个中文沟通误解风险分析器。",
    "你的核心任务是把用户输入整理成更适合大模型判断的沟通上下文，再模拟不同接收者可能产生的误读。",
    "每次分析前，先在内部完成四步理解：1. 识别原文事实含义；2. 结合场景和真实意图推断用户想达成的目标；3. 找出容易被情绪化解读的词、语气和缺失背景；4. 区分确定信息、合理推断和不确定假设。",
    "如果用户没有提供真实意图或背景，只能做保守推断；必须把风险归因写成“可能”“容易被理解为”，不要把推断当事实。",
    "改写时优先保留用户原意，其次补足背景、目的、动作、时间和关系安全感；不要擅自增加承诺、道歉、立场或事实。",
    "改写版本不要使用“XX”“某某”“……”这类占位符；缺少具体信息时，用自然的泛化表达，例如“这部分”“目前版本”“相关资料”，并把需要补充的信息放进 quickFixes。",
    "你的任务不是批评用户，而是帮助用户把输入变成更清楚、更低误解风险的表达。",
    "必须区分“事实含义”和“可能被感受到的含义”。",
    "不要诊断人格，不要给任何人贴心理标签。",
    "不要输出泛泛建议；每条风险和改写都必须能回到原文、场景或用户意图。",
    "topRisks 必须至少输出 2 条；如果只发现一条明显风险，也要补充“上下文不足”或“短句歧义”作为第二条。",
    "audiences 必须正好输出 4 条，且必须覆盖 friend、boss、stranger、sensitive，不能合并、遗漏或新增 persona。",
    "不要输出 Markdown，不要解释 JSON 以外的内容。",
    "输出必须是严格 JSON，且字段名、枚举值和结构必须完全符合用户要求。"
  ].join("\n");
}

export function buildUserPrompt(request: AnalyzeRequest) {
  const { input } = request;
  return `
请分析下面这段文本的误解风险，并给出改写版本。

文本：
${input.text}

场景：${channelLabels[input.channel]}
真实意图：${input.intent || "用户未提供，请从文本谨慎推断，不要过度脑补。"}
改写目标：${toneGoalLabels[input.toneGoal]}

必须覆盖四类接收者：
${Object.entries(personaLabels)
  .map(([id, label]) => `- ${id}: ${label}`)
  .join("\n")}

风险等级只能使用：
${Object.entries(riskLevelLabels)
  .map(([id, label]) => `- ${id}: ${label}`)
  .join("\n")}

请只返回以下 JSON 结构：
{
  "original": "原文",
  "overallRisk": 0-100 的整数,
  "riskLevel": "LOW | MEDIUM | MEDIUM_HIGH | HIGH",
  "summary": "一句话总结主要误解风险",
  "topRisks": [
    {
      "type": "tone | context | ambiguity | relationship | emotion | urgency",
      "label": "风险名",
      "evidence": "原文中的证据或上下文缺口",
      "advice": "降低风险的具体做法"
    },
    {
      "type": "tone | context | ambiguity | relationship | emotion | urgency",
      "label": "第二个风险名",
      "evidence": "第二个证据或上下文缺口",
      "advice": "第二条具体做法"
    }
  ],
  "audiences": [
    {
      "persona": "friend",
      "label": "朋友",
      "possibleMisread": "这个人可能如何误解",
      "riskScore": 0-100 的整数,
      "triggerWords": ["触发词"],
      "saferSignal": "应该补充什么安全信号"
    },
    {
      "persona": "boss",
      "label": "老板",
      "possibleMisread": "这个人可能如何误解",
      "riskScore": 0-100 的整数,
      "triggerWords": ["触发词"],
      "saferSignal": "应该补充什么安全信号"
    },
    {
      "persona": "stranger",
      "label": "陌生人",
      "possibleMisread": "这个人可能如何误解",
      "riskScore": 0-100 的整数,
      "triggerWords": ["触发词"],
      "saferSignal": "应该补充什么安全信号"
    },
    {
      "persona": "sensitive",
      "label": "敏感的人",
      "possibleMisread": "这个人可能如何误解",
      "riskScore": 0-100 的整数,
      "triggerWords": ["触发词"],
      "saferSignal": "应该补充什么安全信号"
    }
  ],
  "rewrites": {
    "clear": "更清楚版",
    "soft": "更温和版",
    "professional": "更职场版"
  },
  "quickFixes": ["3 到 5 条可执行修正建议"],
  "disclaimer": "这是沟通风险预演，不代表对方一定会这样理解。"
}

约束：
- topRisks 至少 2 条，最多 6 条；即使原文很短，也必须至少给出“语气风险”和“上下文/歧义风险”两类。
- audiences 必须正好 4 条，且 persona 必须覆盖 friend、boss、stranger、sensitive。
- rewrites 必须保留原意，不能擅自增加承诺。
- rewrites 不要包含“XX”“某某”“……”等占位符；如果缺少具体信息，用自然说法替代。
- 所有输出使用简体中文。
`.trim();
}
