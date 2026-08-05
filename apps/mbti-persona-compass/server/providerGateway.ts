import { aiInterpretationSchema, type AiInterpretation } from "../src/shared/contracts.js";
import { questions } from "../src/data/questions.js";
import type { AnswerMap, PersonalityProfile, ScoreResult } from "../src/types.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import { hubChatHeaders, isGptModel, type HubRuntime } from "./hubRuntime.js";

export class ProviderError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

type Fetcher = typeof fetch;

export async function generateAiInterpretation(
  input: { answers: AnswerMap; score: ScoreResult; profile: PersonalityProfile },
  runtime: HubRuntime,
  options: { fetcher?: Fetcher; timeoutMs?: number } = {},
): Promise<AiInterpretation> {
  if (runtime.provider !== "openai" || !isGptModel(runtime.model)) {
    throw new ProviderError(422, "INVALID_HUB_MODEL", "人格罗盘只允许使用 Hub 的 GPT 型号。");
  }

  const response = await timedFetch(options.fetcher || fetch, runtime.chatUrl, {
    method: "POST",
    headers: hubChatHeaders(runtime),
    body: JSON.stringify({
      provider: "openai",
      model: runtime.model,
      projectId: runtime.projectId,
      temperature: 0.35,
      max_tokens: 5_000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(input.answers, input.score, input.profile) },
      ],
    }),
  }, options.timeoutMs || 90_000);

  const raw = await response.text();
  let payload: unknown;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { text: raw };
  }

  if (!response.ok) {
    throw new ProviderError(
      mapStatus(response.status),
      "PROVIDER_HTTP_ERROR",
      providerMessage(response.status, payload),
      sanitize(payload),
    );
  }

  const content = extractResponseText(payload);
  if (!content) {
    throw new ProviderError(502, "EMPTY_MODEL_OUTPUT", "Hub GPT 没有返回可识别内容，请稍后重试。");
  }
  return parseAiInterpretation(content);
}

export function parseAiInterpretation(rawText: string): AiInterpretation {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const source = fenced ?? trimmed;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  const jsonText = start >= 0 && end > start ? source.slice(start, end + 1) : source;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new ProviderError(502, "JSON_PARSE_ERROR", "Hub GPT 没有返回合法的结构化解释，请重试。");
  }
  const result = aiInterpretationSchema.safeParse(parsed);
  if (!result.success) {
    throw new ProviderError(
      502,
      "SCHEMA_ERROR",
      "Hub GPT 返回的解释结构不完整，请重试。",
      result.error.flatten(),
    );
  }
  const invalidEvidence = result.data.dimensionInsights.some((insight) =>
    insight.evidenceQuestionIds.some(
      (id) => questions.find((question) => question.id === id)?.dimension !== insight.dimension,
    ),
  );
  if (invalidEvidence) {
    throw new ProviderError(502, "EVIDENCE_MISMATCH", "Hub GPT 引用的题目与解释维度不一致，请重试。");
  }
  return result.data;
}

function extractResponseText(payload: unknown): string {
  if (!isRecord(payload)) return "";
  if (typeof payload.output_text === "string") return payload.output_text.trim();
  if (typeof payload.text === "string") return payload.text.trim();
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices.find(isRecord);
  const message = first && isRecord(first.message) ? first.message : null;
  if (message && typeof message.content === "string") return message.content.trim();
  if (message && Array.isArray(message.content)) {
    return message.content
      .filter(isRecord)
      .map((part) => typeof part.text === "string" ? part.text : "")
      .join("\n")
      .trim();
  }
  return first && typeof first.text === "string" ? first.text.trim() : "";
}

async function timedFetch(fetcher: Fetcher, url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError(504, "HUB_TIMEOUT", "Hub GPT 解读超时，请稍后重试。");
    }
    throw new ProviderError(502, "HUB_NETWORK_ERROR", "无法连接 Hub 项目级代理，请稍后重试。");
  } finally {
    clearTimeout(timer);
  }
}

function providerMessage(status: number, payload: unknown): string {
  const detail = isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
    ? payload.error.message.slice(0, 240)
    : "";
  if (status === 401 || status === 403) return "Hub 项目身份无效或没有访问该 GPT 型号的权限。";
  if (status === 429) return "Hub 路由额度不足或请求过于频繁，请稍后重试。";
  if (status === 404) return "Hub 项目级代理或 GPT 型号不存在。";
  return detail ? `Hub 返回错误：${detail}` : "Hub 项目级代理请求失败。";
}

function mapStatus(status: number) {
  if ([401, 403, 404, 429].includes(status)) return status;
  return status >= 500 ? 502 : 400;
}

function sanitize(payload: unknown) {
  return JSON.stringify(payload).slice(0, 800).replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]");
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}
