import {
  counterfactualResultSchema,
  type CounterfactualResult,
  type GenerateRequest
} from "../src/shared/contracts.js";
import {
  buildSystemPrompt,
  buildUserPrompt,
  maxTokensForDepth,
  temperatureForTone
} from "./prompt.js";
import { callHubChat, HubModelError, type HubChatRequest } from "./hubModels.js";

export class ProviderError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function generateWithProvider(
  input: GenerateRequest,
  options: { callModel?: (request: HubChatRequest) => Promise<string> } = {}
): Promise<CounterfactualResult> {
  const hubRequest = buildHubChatRequest(input);
  const callModel = options.callModel || callHubChat;
  const text = await callModel(hubRequest).catch((error) => {
    if (error instanceof HubModelError) {
      throw new ProviderError(error.status, error.code, error.message);
    }

    throw new ProviderError(502, "HUB_MODEL_ERROR", "Hub 模型代理请求失败，请稍后再试。", String(error));
  });

  return parseModelResult(text);
}

export function buildHubChatRequest(input: GenerateRequest): HubChatRequest {
  if (input.provider !== "openai") {
    throw new ProviderError(422, "INVALID_PROVIDER", "请选择 Hub 中已启用的模型服务。");
  }

  if (!/^gpt-/i.test(input.model)) {
    throw new ProviderError(422, "INVALID_MODEL", "本项目只允许调用 gpt-* 型号。");
  }

  return {
    provider: input.provider,
    model: input.model,
    temperature: temperatureForTone(input.tone),
    maxTokens: maxTokensForDepth(input.depth),
    messages: [
      { role: "system", content: buildSystemPrompt(input) },
      { role: "user", content: buildUserPrompt(input) }
    ]
  };
}

export function parseModelResult(rawText: string): CounterfactualResult {
  const payload = extractJsonPayload(rawText);
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new ProviderError(502, "JSON_PARSE_ERROR", "模型没有返回合法 JSON，请重试或换一个模型。");
  }

  const result = counterfactualResultSchema.safeParse(parsed);
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
