import {
  brandPackSchema,
  realProviderSchema,
  type BrandPack,
  type GenerateBrandPackRequest
} from "../src/shared/contracts.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";

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

type Fetcher = typeof fetch;
const HUB_CHAT_URL = process.env.HUB_CHAT_COMPLETIONS_URL || "http://127.0.0.1:4194/hub/api/v1/chat/completions";

export async function generateWithProvider(
  request: GenerateBrandPackRequest,
  options: { fetcher?: Fetcher; timeoutMs?: number } = {}
): Promise<BrandPack> {
  if (!realProviderSchema.safeParse(request.provider).success) {
    throw new ProviderError(422, "INVALID_PROVIDER", "请选择 AI Hub 的 GPT 模型。");
  }
  if (!/^gpt-/i.test(request.model)) {
    throw new ProviderError(422, "INVALID_MODEL", "请选择 AI Hub 为本项目提供的 GPT 型号。");
  }

  return generateValidBrandPack(() => callHub(request, options.fetcher || fetch, options.timeoutMs || 45_000));
}

export async function generateValidBrandPack(generate: () => Promise<string>, maxAttempts = 2): Promise<BrandPack> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
    try {
      return parseBrandPackPayload(await generate());
    } catch (error) {
      lastError = error;
      const canRetry = error instanceof ProviderError && ["JSON_PARSE_ERROR", "SCHEMA_ERROR"].includes(error.code) && attempt < maxAttempts;
      if (!canRetry) throw error;
    }
  }
  throw lastError;
}

export function parseBrandPackPayload(rawText: string): BrandPack {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonPayload(rawText));
  } catch {
    throw new ProviderError(502, "JSON_PARSE_ERROR", "模型没有返回合法 JSON，请重试。");
  }
  const result = brandPackSchema.safeParse(parsed);
  if (!result.success) {
    throw new ProviderError(502, "SCHEMA_ERROR", "模型返回内容缺少必要字段，已阻止渲染。", result.error.flatten());
  }
  return result.data;
}

export function extractJsonPayload(rawText: string) {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) return fenced;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

async function callHub(request: GenerateBrandPackRequest, fetcher: Fetcher, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const token = process.env.HUB_PROJECT_TOKEN;
    const response = await fetcher(HUB_CHAT_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { "x-hub-project-token": token } : {})
      },
      body: JSON.stringify({
        provider: "openai",
        model: request.model,
        temperature: 0.62,
        max_tokens: 4200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(request) }
        ]
      }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new ProviderError(response.status >= 500 ? 502 : response.status, "HUB_MODEL_ERROR", "AI Hub 模型请求失败。", payload);
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new ProviderError(502, "HUB_RESPONSE_ERROR", "AI Hub 返回结构无法识别。");
    return content;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new ProviderError(504, "HUB_TIMEOUT", "AI Hub 请求超时，请稍后重试。");
    throw new ProviderError(502, "HUB_NETWORK_ERROR", "无法连接 AI Hub 模型网关。");
  } finally {
    clearTimeout(timer);
  }
}
