import type { Dimension, DimensionVector, PersonalityType } from "../data/personality-test.ts";

export type GeneratedPersonalityResult = {
  personalityId: string;
  personalityName: string;
  keywords: string[];
  summary: string;
  strength: string;
  blindSpot: string;
  relationshipTip: string;
  dailyAdvice: string;
};

export type DeepSeekResultPayload = {
  modeLabel: string;
  answeredCount: number;
  personality: PersonalityType;
  scores: DimensionVector;
  dimensions: Dimension[];
};

type FetchLike = typeof fetch;

const HUB_CHAT_COMPLETIONS_URL = process.env.HUB_CHAT_COMPLETIONS_URL || "http://127.0.0.1:4194/api/v1/chat/completions";
const HUB_PROJECT_TOKEN = process.env.HUB_PROJECT_TOKEN || "";

export function buildDeepSeekResultPrompt(payload: DeepSeekResultPayload): string {
  const scoreLines = payload.dimensions
    .map((dimension) => {
      const score = payload.scores[dimension.id];
      return `${dimension.id}: ${score} (${dimension.negativeLabel} / ${dimension.positiveLabel})`;
    })
    .join("\n");

  return [
    "你正在为一个轻松、治愈、有梗但不做心理诊断的人格测试生成结果页文案。",
    "人格类型已经由本地固定计分规则确定。你只负责基于固定人格和五维分数生成用户可读的分析文案。",
    "要求：",
    "1. 必须返回严格 JSON，不要 Markdown，不要额外解释。",
    "2. 不要重新判断人格类型，不要改人格名。",
    "3. personalityName 必须严格等于给定人格名称。",
    "4. keywords 返回 3-4 个中文短语，可以结合给定关键词和用户五维分数重写。",
    "5. summary、strength、blindSpot、relationshipTip、dailyAdvice 都必须是中文，语气轻松、清爽、有草原意象。",
    "6. 明确避免心理诊断、疾病判断、命运断言。",
    "JSON 字段：personalityName, keywords, summary, strength, blindSpot, relationshipTip, dailyAdvice。",
    "",
    `测试版本：${payload.modeLabel}`,
    `答题数量：${payload.answeredCount}`,
    `固定人格 ID：${payload.personality.id}`,
    `固定人格名称：${payload.personality.name}`,
    `固定人格关键词：${payload.personality.keywords.join(" / ")}`,
    `固定人格基础描述：${payload.personality.summary}`,
    "五维分数：",
    scoreLines
  ].join("\n");
}

export function parseDeepSeekResultContent(
  content: string,
  personality: PersonalityType
): GeneratedPersonalityResult {
  const parsed: unknown = JSON.parse(content);

  if (!isGeneratedResult(parsed)) {
    throw new Error("模型返回的结果格式不完整。");
  }

  return {
    personalityId: personality.id,
    personalityName: personality.name,
    keywords: parsed.keywords.map((keyword) => keyword.trim()).filter(Boolean).slice(0, 4),
    summary: parsed.summary.trim(),
    strength: parsed.strength.trim(),
    blindSpot: parsed.blindSpot.trim(),
    relationshipTip: parsed.relationshipTip.trim(),
    dailyAdvice: parsed.dailyAdvice.trim()
  };
}

export async function generateDeepSeekResult(
  payload: DeepSeekResultPayload,
  fetcher: FetchLike = fetch
): Promise<GeneratedPersonalityResult> {
  if (!payload.personality) {
    throw new Error("固定人格不能为空。");
  }

  const prompt = buildDeepSeekResultPrompt(payload);
  const response = await fetcher(HUB_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: buildHubHeaders(),
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content: "你是一个中文娱乐型人格测试结果文案生成器，只输出严格 JSON。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      stream: false
    })
  });
  const body = await readJsonSafely(response);

  if (!response.ok) {
    throw new Error(`AI Project Hub ${response.status}: ${extractProviderError(body)}`);
  }

  const content = extractAssistantContent(body);
  return parseDeepSeekResultContent(content, payload.personality);
}

function buildHubHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (HUB_PROJECT_TOKEN) {
    headers["x-hub-project-token"] = HUB_PROJECT_TOKEN;
  }
  return headers;
}

function isGeneratedResult(value: unknown): value is GeneratedPersonalityResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GeneratedPersonalityResult>;

  return (
    typeof candidate.personalityName === "string" &&
    Array.isArray(candidate.keywords) &&
    candidate.keywords.every((keyword) => typeof keyword === "string") &&
    typeof candidate.summary === "string" &&
    typeof candidate.strength === "string" &&
    typeof candidate.blindSpot === "string" &&
    typeof candidate.relationshipTip === "string" &&
    typeof candidate.dailyAdvice === "string"
  );
}

async function readJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractAssistantContent(body: unknown): string {
  if (!body || typeof body !== "object") {
    throw new Error("模型返回中缺少可用文本。");
  }

  const content = (body as { choices?: Array<{ message?: { content?: unknown } }> })
    .choices?.[0]?.message?.content;

  if (typeof content === "string" && content.trim()) {
    return content;
  }

  throw new Error("模型返回中缺少可用文本。");
}

function extractProviderError(body: unknown): string {
  const message = (body as { error?: { message?: unknown } })?.error?.message;

  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  return "请求失败";
}
