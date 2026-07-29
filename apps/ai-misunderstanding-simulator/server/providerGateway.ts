import {
  analysisReportSchema,
  isGptModel,
  realProviderSchema,
  type AnalysisReport,
  type AnalyzeRequest
} from "../src/shared/contracts.js";
import { buildSystemPrompt, buildUserPrompt, MODEL_MAX_TOKENS, MODEL_TEMPERATURE } from "./prompt.js";
import { callHubChat, HubModelError, type HubChatRequest } from "./hubModels.js";

export class ProviderError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type ModelCaller = (request: HubChatRequest) => Promise<string>;

export async function generateWithProvider(
  input: AnalyzeRequest,
  options: { callModel?: ModelCaller } = {}
): Promise<AnalysisReport> {
  const hubRequest = buildHubChatRequest(input);
  const callModel = options.callModel || callHubChat;
  const rawText = await callModel(hubRequest).catch((error) => {
    if (error instanceof HubModelError) {
      throw new ProviderError(error.status, error.code, error.message);
    }

    throw new ProviderError(502, "HUB_MODEL_ERROR", "Hub 模型代理请求失败，请稍后再试。", String(error));
  });

  return parseModelResult(rawText);
}

export function buildHubChatRequest(input: AnalyzeRequest): HubChatRequest {
  const provider = realProviderSchema.safeParse(input.provider);
  if (!provider.success) {
    throw new ProviderError(422, "INVALID_PROVIDER", "本项目只接受 Hub 的 GPT 路由。");
  }
  if (provider.data !== "openai") {
    throw new ProviderError(422, "INVALID_PROVIDER", "本项目只接受 Hub 的 GPT 路由。");
  }
  if (!isGptModel(input.model)) {
    throw new ProviderError(422, "INVALID_MODEL", "本项目只允许调用 gpt-* 型号。");
  }

  return {
    provider: provider.data,
    model: input.model,
    temperature: MODEL_TEMPERATURE,
    maxTokens: MODEL_MAX_TOKENS,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPrompt(input) }
    ]
  };
}

export function parseModelResult(rawText: string): AnalysisReport {
  const payload = extractJsonPayload(rawText);
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new ProviderError(502, "JSON_PARSE_ERROR", "模型没有返回合法 JSON，请重试或换一个模型。");
  }

  const result = analysisReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new ProviderError(502, "SCHEMA_ERROR", "模型返回内容缺少必要字段，已阻止渲染。", result.error.flatten());
  }

  return result.data;
}

function extractJsonPayload(rawText: string) {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) return fenced;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}
