import {
  channelLabels,
  personaLabels,
  riskLevelLabels,
  type AnalysisReport,
  type AnalyzeRequest,
  type Persona,
  type RiskLevel
} from "../src/shared/contracts.js";

type Signal = {
  token: string;
  weight: number;
  type: "tone" | "context" | "ambiguity" | "relationship" | "emotion" | "urgency";
};

const signals: Signal[] = [
  { token: "随便", weight: 12, type: "emotion" },
  { token: "算了", weight: 14, type: "emotion" },
  { token: "呵呵", weight: 18, type: "tone" },
  { token: "你自己", weight: 14, type: "relationship" },
  { token: "不是说", weight: 16, type: "relationship" },
  { token: "怎么还", weight: 18, type: "urgency" },
  { token: "尽快", weight: 12, type: "urgency" },
  { token: "必须", weight: 13, type: "urgency" },
  { token: "别", weight: 8, type: "tone" },
  { token: "无所谓", weight: 13, type: "emotion" },
  { token: "你到底", weight: 20, type: "relationship" },
  { token: "我早就", weight: 11, type: "relationship" },
  { token: "?", weight: 5, type: "ambiguity" },
  { token: "？", weight: 5, type: "ambiguity" },
  { token: "!", weight: 7, type: "tone" },
  { token: "！", weight: 7, type: "tone" }
];

const personaWeights: Record<Persona, number> = {
  friend: 0,
  boss: 8,
  stranger: 10,
  sensitive: 14
};

export function buildDemoAnalysis(request: AnalyzeRequest): AnalysisReport {
  const text = request.input.text.trim();
  const matched = signals.filter((signal) => text.includes(signal.token));
  const uniqueTypes = Array.from(new Set(matched.map((signal) => signal.type)));
  const lengthPenalty = text.length < 12 ? 14 : text.length < 24 ? 6 : 0;
  const intentPenalty = request.input.intent.trim() ? 0 : 8;
  const channelPenalty = request.input.channel === "work" || request.input.channel === "email" ? 6 : 0;
  const punctuationPenalty = /[?!？！]{2,}/.test(text) ? 10 : 0;
  const rawRisk =
    18 +
    matched.reduce((sum, signal) => sum + signal.weight, 0) +
    uniqueTypes.length * 4 +
    lengthPenalty +
    intentPenalty +
    channelPenalty +
    punctuationPenalty;
  const overallRisk = clampRisk(rawRisk);
  const riskLevel = riskLevelFromScore(overallRisk);
  const triggerWords = matched.map((signal) => signal.token).filter((token, index, list) => list.indexOf(token) === index);
  const primaryTriggers = triggerWords.length ? triggerWords.slice(0, 5) : extractShortEvidence(text);

  return {
    original: text,
    overallRisk,
    riskLevel,
    summary: buildSummary(overallRisk, request),
    topRisks: buildRiskFactors(request, matched, primaryTriggers),
    audiences: (Object.keys(personaLabels) as Persona[]).map((persona) =>
      buildAudienceCard(persona, request, overallRisk, primaryTriggers)
    ),
    rewrites: buildRewrites(request),
    quickFixes: [
      "补一句你的真实意图，减少对方自行脑补。",
      "把质问句改成确认句。",
      "删除容易带情绪的短词，换成可执行请求。",
      "如果是职场场景，补上时间、动作和责任边界。"
    ],
    disclaimer: "这是沟通风险预演，不代表对方一定会这样理解；重要关系里仍建议结合上下文判断。"
  };
}

export function clampRisk(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 78) return "HIGH";
  if (score >= 58) return "MEDIUM_HIGH";
  if (score >= 34) return "MEDIUM";
  return "LOW";
}

function buildSummary(score: number, request: AnalyzeRequest) {
  const label = riskLevelLabels[riskLevelFromScore(score)];
  const channel = channelLabels[request.input.channel];

  if (score >= 78) {
    return `${channel}语境下属于${label}，容易被读成催促、质疑或情绪表达。`;
  }
  if (score >= 58) {
    return `${channel}语境下属于${label}，主要风险来自语气和上下文不足。`;
  }
  if (score >= 34) {
    return `${channel}语境下有轻微歧义，补充意图后会更稳。`;
  }
  return `${channel}语境下风险较低，表达基本清楚。`;
}

function buildRiskFactors(request: AnalyzeRequest, matched: Signal[], triggers: string[]) {
  const types = new Set(matched.map((signal) => signal.type));
  const factors: AnalysisReport["topRisks"] = [
    {
      type: "tone" as const,
      label: "语气容易偏硬",
      evidence: triggers.length ? `触发词：${triggers.join("、")}` : "原文缺少缓冲语。",
      advice: "把判断和催促改成确认，让对方知道你是在同步信息。"
    },
    {
      type: "context" as const,
      label: "上下文不足",
      evidence: request.input.intent.trim() || "没有说明你想达成什么结果。",
      advice: "补一句目的，比如“我想确认进度，方便安排后续”。"
    }
  ];

  if (types.has("urgency") || request.input.channel === "work") {
    factors.push({
      type: "urgency" as const,
      label: "催促感偏强",
      evidence: "时间压力没有被解释。",
      advice: "给出截止时间的原因，而不是只要求对方快一点。"
    });
  }

  if (types.has("relationship") || request.input.channel === "email") {
    factors.push({
      type: "relationship" as const,
      label: "关系位置可能被误读",
      evidence: "对方可能把它理解为质疑、指责或上对下命令。",
      advice: "先承认对方处境，再提出清晰请求。"
    });
  }

  if (request.input.text.trim().length < 18) {
    factors.push({
      type: "ambiguity" as const,
      label: "短句留白过多",
      evidence: "短文本让对方更容易用情绪补全含义。",
      advice: "至少补充一个背景、一个动作、一个期望时间。"
    });
  }

  return factors.slice(0, 5);
}

function buildAudienceCard(persona: Persona, request: AnalyzeRequest, baseRisk: number, triggers: string[]) {
  const riskScore = clampRisk(baseRisk + personaWeights[persona]);
  const triggerWords = triggers.slice(0, 4);
  const base = {
    persona,
    label: personaLabels[persona],
    riskScore,
    triggerWords,
    saferSignal: ""
  };

  switch (persona) {
    case "friend":
      return {
        ...base,
        possibleMisread: "可能觉得你有点冷、敷衍，或者在用短句表达不高兴。",
        saferSignal: "加一点关系温度，比如说明你不是在责怪，只是在确认。"
      };
    case "boss":
      return {
        ...base,
        possibleMisread: "可能觉得你在推责、质疑安排，或没有给出可执行下一步。",
        saferSignal: "换成进度同步和行动请求，减少情绪判断。"
      };
    case "stranger":
      return {
        ...base,
        possibleMisread: "因为缺少关系背景，可能只看到命令或压力，看不到你的真实意图。",
        saferSignal: "补上背景和目的，让陌生人也能读懂。"
      };
    case "sensitive":
      return {
        ...base,
        possibleMisread: "可能感到被否定、被催促或被暗示做得不够好。",
        saferSignal: "先给安全感，再提出具体请求。"
      };
  }
}

function buildRewrites(request: AnalyzeRequest) {
  const text = request.input.text.trim();
  const intent = request.input.intent.trim();
  const intentLine = intent ? `我的意思是：${intent}` : "我想确认一下情况，方便安排后续。";
  const isWork = request.input.channel === "work" || request.input.channel === "email";

  return {
    clear: `${intentLine} 关于“${shorten(text)}”，能否帮我确认目前状态和下一步？`,
    soft: `我可能表达得有点简短，想温和确认一下：${shorten(text)}。如果你现在不方便，也可以晚点再回复。`,
    professional: isWork
      ? `想同步一下这件事的当前进展：${shorten(text)}。麻烦你方便时确认状态、预计时间和需要我配合的部分。`
      : `我想把意思说清楚一点：${shorten(text)}。我的重点是确认信息，不是催促或责怪。`
  };
}

function shorten(text: string) {
  const normalized = text.replace(/\s+/g, " ");
  return normalized.length > 80 ? `${normalized.slice(0, 78)}...` : normalized;
}

function extractShortEvidence(text: string) {
  const chunks = text
    .split(/[，。,.；;：:\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return chunks.slice(0, 3);
}
