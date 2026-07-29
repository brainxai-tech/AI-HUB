import type {
  DreamSymbol,
  DreamInterpretResult,
  Provider,
  ProviderStatus,
  RagCitation
} from "../shared/types";
import { isGptModel } from "../shared/types";
import { AppError } from "./errors";
import { callHubChat, getProviderCatalog, type HubChatRequest } from "./hubModels";
import { buildDreamPrompt, buildDreamSystemPrompt } from "./prompt";
import { retrieveZhougongContext } from "./rag/retriever";
import type { ParsedInterpretRequest } from "./schemas";
import { matchDreamSymbols } from "./symbols";

const providerLabels: Record<Provider, string> = {
  openai: "GPT · AI Routing"
};

const defaultModels: Record<Provider, string> = {
  openai: "gpt-5.4"
};

export interface LlmInterpretation {
  result: DreamInterpretResult;
  meta: {
    provider: Provider;
    model: string;
    mode: "model";
    ragHitCount: number;
    latencyMs: number;
  };
}

export async function getProviderStatuses(): Promise<ProviderStatus[]> {
  const providers = await getProviderCatalog();
  return providers.map((provider) => ({
    ...provider,
    label: provider.label || providerLabels[provider.provider],
    defaultModel: provider.defaultModel || defaultModels[provider.provider]
  }));
}

export async function interpretDream(input: ParsedInterpretRequest): Promise<LlmInterpretation> {
  const startedAt = Date.now();
  const ragCitations = retrieveZhougongContext(input.dreamText);
  const symbols = matchDreamSymbols(input.dreamText);
  const model = input.model;

  const rawText = await callHubChat(buildHubChatRequest(input, symbols, ragCitations, model));

  return {
    result: parseInterpretationFromText(rawText, symbols, ragCitations),
    meta: {
      provider: input.provider,
      model,
      mode: "model",
      ragHitCount: countDirectRagHits(ragCitations),
      latencyMs: Date.now() - startedAt
    }
  };
}

export function buildHubChatRequest(
  input: ParsedInterpretRequest,
  symbols = matchDreamSymbols(input.dreamText),
  ragCitations: RagCitation[] = retrieveZhougongContext(input.dreamText),
  model = input.model
): HubChatRequest {
  if (input.provider !== "openai") {
    throw new AppError(422, "INVALID_PROVIDER", "本项目只接受 Hub 的 GPT 路由。");
  }
  if (!isGptModel(model)) {
    throw new AppError(422, "INVALID_MODEL", "本项目只允许调用 gpt-* 型号。");
  }

  return {
    provider: input.provider,
    model,
    temperature: 0.75,
    maxTokens: 1800,
    messages: [
      { role: "system", content: buildDreamSystemPrompt() },
      { role: "user", content: buildDreamPrompt(input, symbols, ragCitations) }
    ]
  };
}

export function parseInterpretationFromText(
  rawText: string,
  fallbackSymbols = matchDreamSymbols(""),
  ragCitations: RagCitation[] = []
) {
  const candidate = extractJsonObject(rawText);
  let parsed: unknown;

  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new AppError(502, "MODEL_JSON_PARSE_FAILED", "模型没有返回合法 JSON。");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new AppError(502, "MODEL_SCHEMA_INVALID", "模型返回格式不正确。");
  }

  const value = parsed as Partial<DreamInterpretResult>;

  return {
    summary: safeString(value.summary, "这个梦呈现出近期情绪和现实议题交织的状态。", 140),
    symbols: normalizeSymbols(value.symbols, fallbackSymbols),
    traditionalReading: safeString(
      value.traditionalReading,
      "从传统意象看，此梦更像是在提示你留意身边变化，保持稳妥。"
    ),
    psychologicalReading: safeString(
      value.psychologicalReading,
      "从心理视角看，梦境可能反映了你近期对安全感、关系或掌控感的关注。"
    ),
    realityInsight: safeString(value.realityInsight, "近期可以观察一个正在反复出现的现实压力点。"),
    advice: safeString(value.advice, "今天先完成一件能让你恢复秩序感的小事。"),
    luckyKeywords: normalizeKeywords(value.luckyKeywords),
    ragCitations,
    disclaimer: safeString(
      value.disclaimer,
      "本解读仅供娱乐和自我反思，不构成现实决策或专业建议。",
      120
    )
  };
}

function countDirectRagHits(hits: RagCitation[]) {
  return hits.filter((hit) => hit.id !== "zhougong-no-direct-hit").length;
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  throw new AppError(502, "MODEL_JSON_PARSE_FAILED", "模型没有返回 JSON 对象。");
}

function normalizeSymbols(value: unknown, fallback: DreamSymbol[]) {
  if (!Array.isArray(value)) {
    return fallback.slice(0, 5);
  }

  const symbols = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      return {
        name: safeString((item as DreamSymbol).name, "", 24),
        meaning: safeString((item as DreamSymbol).meaning, "", 160)
      };
    })
    .filter((item): item is DreamSymbol => Boolean(item?.name && item.meaning))
    .slice(0, 6);

  return symbols.length ? symbols : fallback.slice(0, 5);
}

function normalizeKeywords(value: unknown) {
  if (!Array.isArray(value)) {
    return ["清醒", "整理", "稳住"];
  }

  const keywords = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 16))
    .filter(Boolean)
    .slice(0, 5);

  return keywords.length ? keywords : ["清醒", "整理", "稳住"];
}

function safeString(value: unknown, fallback: string, maxLength = 800) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}
