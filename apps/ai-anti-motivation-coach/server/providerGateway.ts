import {
  coachResultSchema,
  type CoachResult,
  type GenerateRequest,
  realProviderSchema
} from "../src/shared/contracts.js";
import { buildRewritePrompt, buildSystemPrompt, buildUserPrompt, temperatureForStyle } from "./prompt.js";
import { evaluateCoachResult, formatQualityIssues, type QualityReport } from "./quality.js";
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

type ModelCallMode = "initial" | "rewrite";
export type CoachHubChatRequest = HubChatRequest & {
  mode: ModelCallMode;
};
type ModelCaller = (request: CoachHubChatRequest) => Promise<string>;

export type ProviderGeneration = {
  data: CoachResult;
  quality: QualityReport;
  rewritten: boolean;
};

export async function generateWithProvider(
  input: GenerateRequest,
  options: { callModel?: ModelCaller } = {}
): Promise<ProviderGeneration> {
  const callModel = options.callModel || ((request: CoachHubChatRequest) => callHubChat(request));
  const initialRequest = buildHubChatRequest(input, buildUserPrompt(input), "initial");
  const rawText = await callModel(initialRequest).catch(handleHubError);
  const draft = parseModelResult(rawText);
  const draftQuality = evaluateCoachResult(input, draft);

  if (draftQuality.passed) {
    return {
      data: draft,
      quality: draftQuality,
      rewritten: false
    };
  }

  const rewriteRequest = buildHubChatRequest(
    input,
    buildRewritePrompt(input, draft, formatQualityIssues(draftQuality.issues)),
    "rewrite"
  );
  const rewriteText = await callModel(rewriteRequest).catch(handleHubError);
  const rewritten = parseModelResult(rewriteText);
  const rewrittenQuality = evaluateCoachResult(input, rewritten);

  return {
    data: rewritten,
    quality: rewrittenQuality,
    rewritten: true
  };
}

export function buildHubChatRequest(
  input: GenerateRequest,
  userPrompt: string,
  mode: ModelCallMode
): CoachHubChatRequest {
  const provider = realProviderSchema.safeParse(input.provider);
  if (!provider.success) {
    throw new ProviderError(422, "INVALID_PROVIDER", "请选择 Hub 中已启用的模型服务。");
  }
  if (!/^gpt-/i.test(input.model)) {
    throw new ProviderError(422, "INVALID_MODEL", "请选择 AI Hub 为本项目提供的 GPT 型号。");
  }

  return {
    provider: provider.data,
    model: input.model,
    temperature: temperatureForStyle(input.style),
    maxTokens: 1800,
    mode,
    messages: [
      { role: "system", content: buildSystemPrompt(input) },
      { role: "user", content: userPrompt }
    ]
  };
}

export function parseModelResult(rawText: string): CoachResult {
  const payload = extractJsonPayload(rawText);
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new ProviderError(502, "JSON_PARSE_ERROR", "模型没有返回合法 JSON，请重试或换一个模型。");
  }

  const result = coachResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new ProviderError(502, "SCHEMA_ERROR", "模型返回内容缺少必要字段，已阻止渲染。", result.error.flatten());
  }

  return result.data;
}

function handleHubError(error: unknown): never {
  if (error instanceof HubModelError) {
    throw new ProviderError(error.status, error.code, error.message);
  }

  throw new ProviderError(502, "HUB_MODEL_ERROR", "Hub 模型代理请求失败，请稍后再试。", String(error));
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
