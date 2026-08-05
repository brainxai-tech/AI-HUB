import { answerOptions, questions } from "../src/data/questions.js";
import type { PersonalityProfile, ScoreResult } from "../src/types.js";
import type { AnswerMap } from "../src/types.js";

const oppositePole: Record<string, string> = {
  E: "I", I: "E", S: "N", N: "S", T: "F", F: "T", J: "P", P: "J",
};

export const PROMPT_VERSION = "persona-reasoning-v1";

export function buildSystemPrompt(): string {
  return [
    "你是一位谨慎、清晰的中文人格偏好解读师。",
    "本地规则已经确定四字母结果；你不能重新判型，只能解释为什么出现这个结果。",
    "所有理由必须能追溯到用户的具体题目选择或四维百分比，不得编造经历、职业、家庭背景、创伤、疾病或人格特质。",
    "当百分比接近 50% 时，必须承认情境弹性和不确定性，不能强行解释为强偏好。",
    "这不是心理诊断。避免绝对化、宿命化、褒贬能力高低和招聘筛选建议。",
    "只返回严格 JSON，不要 Markdown、代码围栏或额外解释。",
  ].join("\n");
}

export function buildUserPrompt(answers: AnswerMap, score: ScoreResult, profile: PersonalityProfile): string {
  const metricLines = Object.values(score.metrics).map((metric) =>
    `${metric.dimension}: ${metric.first} ${metric.firstPercent}% / ${metric.second} ${metric.secondPercent}%` +
    `；偏好置信度 ${metric.confidence}%${metric.confidence < 25 ? "（弹性区间）" : ""}`,
  );

  const answerLines = questions.map((question) => {
    const value = answers[question.id];
    const label = answerOptions.find((option) => option.value === value)?.label ?? "未作答";
    const signal = value === 0 ? "中性/依情境" : value > 0 ? question.pole : oppositePole[question.pole];
    return `Q${question.id} [${question.dimension}] 场景「${question.scene}」；陈述「${question.statement}」；` +
      `回答「${label}」；本题信号 ${signal}`;
  });

  return [
    `提示词版本：${PROMPT_VERSION}`,
    `固定结果：${score.type}「${profile.title}」；所属组：${profile.group}`,
    `基础画像：${profile.summary}`,
    "",
    "四维结果：",
    ...metricLines,
    "",
    "32 道回答证据：",
    ...answerLines,
    "",
    "请生成以下 JSON 结构：",
    "{",
    '  "headline": "一句具体但不夸张的个人解读标题",',
    '  "reasoningSummary": "综合说明为什么是这个结果，并指出最强和最接近中线的维度",',
    '  "dimensionInsights": [',
    '    { "dimension": "EI|SN|TF|JP", "conclusion": "本维度结论", "reason": "结合百分比与选择模式的理由", "evidenceQuestionIds": [1, 5], "nuance": "反向信号或情境弹性的解释" }',
    "  ],",
    '  "crossSignals": ["最多三条看似矛盾但可以共存的跨维度信号"],',
    '  "growthExperiments": [',
    '    { "title": "实验名", "action": "本周可完成的具体动作", "rationale": "为什么适合这组回答" }',
    "  ],",
    '  "closingNote": "温和提醒：结果是当前偏好地图，不是终身标签"',
    "}",
    "",
    "硬性要求：dimensionInsights 必须按 EI、SN、TF、JP 顺序各一项；evidenceQuestionIds 只能引用该维度真实题号；growthExperiments 必须恰好三项。",
  ].join("\n");
}
