import { NextResponse } from "next/server.js";
import type {
  ActionAdvice,
  CardInterpretation,
  GeneratedReading,
  QuestionIntent,
  ReadingInterpretation,
  ReadingTheme,
  ReadingVerdict,
  VerdictSignal,
} from "../../../lib/types.ts";

const SYSTEM_PROMPT =
  "你是一个中文塔罗测评生成器。你必须输出严格 json，必须给出明确的能/不能倾向、为什么、怎么做、改判条件。不要输出 Markdown。";

const HUB_CHAT_COMPLETIONS_URL = process.env.HUB_CHAT_COMPLETIONS_URL || "http://127.0.0.1:4194/api/v1/chat/completions";
const HUB_PROJECT_TOKEN = process.env.HUB_PROJECT_TOKEN || "";

type OpenAiChoice = {
  message?: {
    content?: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTheme(value: unknown): value is ReadingTheme {
  return value === "relationship" || value === "career";
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback;
}

function isGeneratedReading(value: unknown): value is GeneratedReading {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.createdAt) &&
    isTheme(value.theme) &&
    typeof value.question === "string" &&
    Array.isArray(value.cards) &&
    value.cards.length === 3
  );
}

function fallbackIntent(reading: GeneratedReading): QuestionIntent {
  return {
    id: "general-judgment",
    label: reading.theme === "relationship" ? "关系方向判断" : "事业与财富方向判断",
    judgmentPath:
      reading.theme === "relationship"
        ? "判断这段关系当前更适合推进、澄清、等待，还是设下边界。"
        : "判断这件事当前更适合推进、缩小测试、等待证据，还是降低投入。",
    matchedKeywords: [],
  };
}

function normalizeIntent(value: unknown, reading: GeneratedReading): QuestionIntent {
  if (!isRecord(value)) {
    return fallbackIntent(reading);
  }

  return {
    id: value.id === "general-judgment" ? "general-judgment" : fallbackIntent(reading).id,
    label: stringValue(value.label, fallbackIntent(reading).label),
    judgmentPath: stringValue(value.judgmentPath, fallbackIntent(reading).judgmentPath),
    matchedKeywords: stringArray(value.matchedKeywords, []),
  };
}

function normalizeSignal(value: unknown): VerdictSignal | null {
  if (!isRecord(value)) {
    return null;
  }

  const position = value.position === "root" || value.position === "present" || value.position === "trend"
    ? value.position
    : "present";
  const orientation = value.orientation === "upright" || value.orientation === "reversed" ? value.orientation : "upright";

  return {
    cardName: stringValue(value.cardName, "未知牌"),
    position,
    orientation,
    contribution: typeof value.contribution === "number" ? value.contribution : 0,
    text: stringValue(value.text, `${stringValue(value.cardName, "这张牌")}形成一个判断信号。`),
  };
}

function normalizeActions(value: unknown): ActionAdvice {
  if (!isRecord(value)) {
    return {
      nextAction: "先把下一步缩小到一个可验证动作。",
      avoid: "避免把牌阵当成现实保证。",
      sevenDayObservation: "七天内记录现实反馈，再决定是否重新判断。",
    };
  }

  return {
    nextAction: stringValue(value.nextAction, "先把下一步缩小到一个可验证动作。"),
    avoid: stringValue(value.avoid, "避免把牌阵当成现实保证。"),
    sevenDayObservation: stringValue(value.sevenDayObservation, "七天内记录现实反馈，再决定是否重新判断。"),
  };
}

function normalizeVerdict(value: unknown): ReadingVerdict {
  const verdict = isRecord(value) ? value : {};
  const answer = verdict.answer === "blocked" || verdict.answer === "unknown" ? verdict.answer : "supportive";
  const confidence =
    verdict.confidence === "high" || verdict.confidence === "medium" || verdict.confidence === "low"
      ? verdict.confidence
      : "medium";
  const rawSupportSignals = Array.isArray(verdict.supportSignals) ? verdict.supportSignals : [];
  const rawResistanceSignals = Array.isArray(verdict.resistanceSignals) ? verdict.resistanceSignals : [];
  const supportSignals = rawSupportSignals
    .map((item) => normalizeSignal(item))
    .filter((item): item is VerdictSignal => item !== null);
  const resistanceSignals = rawResistanceSignals
    .map((item) => normalizeSignal(item))
    .filter((item): item is VerdictSignal => item !== null);

  return {
    answer,
    confidence,
    why: stringValue(verdict.why, "Hub 模型网关已生成判断，但返回内容缺少原因说明。"),
    whatToDo: stringArray(verdict.whatToDo, ["先记录现实证据。", "降低不可逆投入。", "七天后复盘。"]).slice(0, 5),
    score: typeof verdict.score === "number" ? verdict.score : 0,
    scoreBreakdown: [],
    supportSignals,
    resistanceSignals,
    changeCondition: stringValue(verdict.changeCondition, "改判条件：现实反馈明显改变后，再重新判断。"),
  };
}

function normalizeCardSections(value: unknown, reading: GeneratedReading): CardInterpretation[] {
  const sections = Array.isArray(value) ? value : [];

  return reading.cards.map((card, index) => {
    const section = isRecord(sections[index]) ? sections[index] : {};

    return {
      position: card.position,
      cardName: card.card.name,
      orientation: card.orientation,
      title: stringValue(section.title, `${card.position}: ${card.card.name}`),
      meaning: stringValue(section.meaning, `${card.card.name} 是本次判断中的关键牌。`),
      risk: stringValue(section.risk, card.card.risk),
      advice: stringValue(section.advice, card.card.advice),
    };
  });
}

function normalizeInterpretation(value: unknown, reading: GeneratedReading): ReadingInterpretation {
  const result = isRecord(value) ? value : {};

  return {
    intent: normalizeIntent(result.intent, reading),
    verdict: normalizeVerdict(result.verdict),
    summary: stringValue(result.summary, "Hub 模型网关已完成本次牌阵解读。"),
    cardSections: normalizeCardSections(result.cardSections, reading),
    combination: stringValue(result.combination, "三张牌共同构成本次判断。"),
    riskNotes: stringArray(result.riskNotes, []),
    actions: normalizeActions(result.actions),
    disclaimer: stringValue(
      result.disclaimer,
      "本解读由 Hub 模型网关生成，仅供自我反思与娱乐参考，不构成医疗、法律、金融、心理健康或其他专业建议。",
    ),
  };
}

function buildPrompt(reading: GeneratedReading) {
  return `请用中文生成一次 AI 塔罗测评结果，必须输出严格 json，不要输出 Markdown。

用户问题：${reading.question}
主题：${reading.theme === "relationship" ? "关系" : "事业与财富"}
三张牌：
${reading.cards
  .map(
    (card) =>
      `- ${card.position}: ${card.card.name}（${card.orientation === "upright" ? "正位" : "逆位"}）。关键词：${card.card.keywords.join("、")}。风险：${card.card.risk}。建议：${card.card.advice}`,
  )
  .join("\n")}

必须返回这个 json 结构：
{
  "intent": {"id":"general-judgment","label":"判断口径","judgmentPath":"本次如何判断","matchedKeywords":[]},
  "verdict": {
    "answer":"supportive 或 blocked",
    "confidence":"high 或 medium 或 low",
    "why":"必须明确说明为什么能或不能，并引用三张牌",
    "whatToDo":["可执行建议1","可执行建议2","可执行建议3"],
    "score":0,
    "supportSignals":[{"cardName":"牌名","position":"root","orientation":"upright","contribution":1,"text":"支持信号"}],
    "resistanceSignals":[{"cardName":"牌名","position":"present","orientation":"reversed","contribution":-1,"text":"阻力信号"}],
    "changeCondition":"什么现实条件出现后需要改判"
  },
  "summary":"综合摘要",
  "cardSections":[{"position":"root","cardName":"牌名","orientation":"upright","title":"标题","meaning":"牌义","risk":"风险","advice":"建议"}],
  "combination":"三牌组合解读",
  "riskNotes":["风险1"],
  "actions":{"nextAction":"下一步","avoid":"避免事项","sevenDayObservation":"七天观察点"},
  "disclaimer":"本解读仅供自我反思与娱乐参考，不构成医疗、法律、金融、心理健康或其他专业建议。"
}`;
}

function extractCompletionText(value: unknown) {
  if (!isRecord(value)) {
    return "";
  }

  const completion = value as { choices?: OpenAiChoice[] };
  return completion.choices?.[0]?.message?.content?.trim() ?? "";
}

function parseModelJson(content: string) {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(content.slice(start, end + 1)) as unknown;
    }

    throw new Error("Hub 模型网关返回的测评内容不是有效 JSON。");
  }
}

export async function POST(request: Request) {
  try {
    const payload: unknown = await request.json();

    if (!isRecord(payload)) {
      return NextResponse.json({ error: "请求体不是有效测评数据。" }, { status: 400 });
    }

    if (!isGeneratedReading(payload.reading)) {
      return NextResponse.json({ error: "测评数据无效。" }, { status: 400 });
    }

    const modelResponse = await fetch(HUB_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: buildHubHeaders(),
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildPrompt(payload.reading) },
        ],
        response_format: { type: "json_object" },
        stream: false,
        max_tokens: 2400,
        temperature: 0.55,
      }),
    });

    const completion = (await modelResponse.json().catch(() => null)) as unknown;

    if (!modelResponse.ok) {
      const errorText = isRecord(completion)
        ? JSON.stringify((completion as { error?: unknown }).error ?? completion)
        : "";
      return NextResponse.json(
        { error: `Hub 模型网关请求失败：${modelResponse.status}`, detail: errorText.slice(0, 500) },
        { status: 502 },
      );
    }

    const content = extractCompletionText(completion);

    if (!content) {
      return NextResponse.json({ error: "Hub 模型网关没有返回测评内容。" }, { status: 502 });
    }

    const parsed = parseModelJson(content);
    return NextResponse.json(normalizeInterpretation(parsed, payload.reading));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Hub 模型网关测评生成失败。" },
      { status: 500 },
    );
  }
}

function buildHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (HUB_PROJECT_TOKEN) {
    headers["x-hub-project-token"] = HUB_PROJECT_TOKEN;
  }
  return headers;
}
