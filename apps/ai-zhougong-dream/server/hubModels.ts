import { isGptModel, type Provider, type ProviderStatus } from "../shared/types";
import { AppError } from "./errors";

type HubProvider = {
  id: Provider;
  name: string;
  adapter?: string;
  defaultModel: string;
  models: string[];
  enabledModels: string[];
  enabled: boolean;
  configured: boolean;
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type HubChatRequest = {
  provider: Provider;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
};

const DEFAULT_TIMEOUT_MS = 90_000;
const CONFIG_TIMEOUT_MS = 10_000;
const DEFAULT_HUB_CONFIG_URL = "http://127.0.0.1:4194/hub/api/model-config";
const DEFAULT_HUB_CHAT_URL = "http://127.0.0.1:4194/hub/api/v1/chat/completions";
const PROJECT_ID = "ai-zhougong-dream";
const PROJECT_PATH = "/zhougong";
const FALLBACK_PROVIDER: HubProvider = {
  id: "openai",
  name: "GPT · AI Routing",
  defaultModel: "gpt-5.4",
  models: ["gpt-5.4"],
  enabledModels: [],
  enabled: false,
  configured: false
};

export async function getProviderCatalog(fetchImpl: typeof fetch = fetch): Promise<ProviderStatus[]> {
  try {
    const response = await fetchImpl(process.env.HUB_MODEL_CONFIG_URL || DEFAULT_HUB_CONFIG_URL, {
      headers: hubProjectHeaders({ accept: "application/json" }),
      signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS),
      cache: "no-store"
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new AppError(502, "HUB_CONFIG_ERROR", `Hub 模型配置读取失败：${response.status}`, payload);
    }
    return toProviderStatuses(normalizeHubProviderCatalog(payload));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, "HUB_CONFIG_ERROR", "无法读取 Hub 模型配置，请稍后再试。");
  }
}

export async function callHubChat({
  provider,
  model,
  messages,
  temperature = 0.75,
  maxTokens = 1800,
  fetchImpl = fetch
}: HubChatRequest) {
  assertHubRoute(provider, model);
  const response = await fetchImpl(process.env.HUB_CHAT_COMPLETIONS_URL || DEFAULT_HUB_CHAT_URL, {
    method: "POST",
    headers: hubProjectHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({
      provider,
      model,
      projectId: PROJECT_ID,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      stream: false
    }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    cache: "no-store"
  }).catch(() => {
    throw new AppError(502, "HUB_NETWORK_ERROR", "连接 Hub 项目级代理失败，请稍后再试。");
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new AppError(
      response.status >= 500 ? 502 : response.status,
      "HUB_MODEL_ERROR",
      hubErrorMessage(payload),
      payload
    );
  }

  const text = extractHubText(payload);
  if (!text) {
    throw new AppError(502, "EMPTY_MODEL_OUTPUT", "Hub 项目级代理没有返回可用内容。", payload);
  }
  return text;
}

export function normalizeHubProviderCatalog(config: unknown): HubProvider[] {
  const providers = isRecord(config) && Array.isArray(config.providers) ? config.providers : [];
  const provider = providers.filter(isRecord).find((item) => String(item.id) === "openai");
  const enabledModels = uniqueStrings(readArray(provider, "enabledModels")).filter(isGptModel);
  const catalogModels = uniqueStrings(readArray(provider, "models")).filter(isGptModel);
  const configuredModel = stringField(provider, "model");
  const selectedModel = isGptModel(configuredModel) ? configuredModel : "";
  const configuredModels = uniqueStrings([...enabledModels, selectedModel, ...catalogModels]).filter(isGptModel);
  const defaultModel = selectedModel || enabledModels[0] || catalogModels[0] || FALLBACK_PROVIDER.defaultModel;
  const ready = Boolean(
    provider && booleanField(provider, "enabled") && booleanField(provider, "configured") && configuredModels.length
  );
  return [{
    id: "openai",
    name: stringField(provider, "label") || FALLBACK_PROVIDER.name,
    adapter: stringField(provider, "adapter"),
    defaultModel,
    models: configuredModels.length ? configuredModels : [...FALLBACK_PROVIDER.models],
    enabledModels,
    enabled: ready,
    configured: ready
  }];
}

function toProviderStatuses(providers: HubProvider[]): ProviderStatus[] {
  return providers.map((provider) => ({
    provider: provider.id,
    label: provider.name,
    defaultModel: provider.defaultModel,
    models: [...provider.models],
    enabledModels: [...provider.enabledModels],
    enabled: provider.enabled,
    configured: provider.configured
  }));
}

function assertHubRoute(provider: Provider, model: string) {
  if (provider !== "openai") {
    throw new AppError(422, "INVALID_PROVIDER", "本项目只接受 Hub 的 GPT 路由。");
  }
  if (!isGptModel(model)) {
    throw new AppError(422, "INVALID_MODEL", "本项目只允许调用 gpt-* 型号。");
  }
}

function hubProjectHeaders(initial: Record<string, string> = {}) {
  const token = process.env.HUB_PROJECT_TOKEN;
  return {
    ...initial,
    "x-hub-project-id": PROJECT_ID,
    "x-hub-project-path": PROJECT_PATH,
    ...(token ? { "x-hub-project-token": token } : {})
  };
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function extractHubText(payload: unknown) {
  if (!isRecord(payload)) return "";
  if (typeof payload.output_text === "string") return payload.output_text.trim();
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = choices.find(isRecord);
  if (isRecord(firstChoice?.message) && typeof firstChoice.message.content === "string") {
    return firstChoice.message.content.trim();
  }
  return typeof firstChoice?.text === "string" ? firstChoice.text.trim() : "";
}

function hubErrorMessage(payload: unknown) {
  if (isRecord(payload) && isRecord(payload.error)) {
    return stringField(payload.error, "message") || "Hub 项目级代理请求失败。";
  }
  return isRecord(payload)
    ? stringField(payload, "error") || stringField(payload, "message") || "Hub 项目级代理请求失败。"
    : "Hub 项目级代理请求失败。";
}

function uniqueStrings(values: unknown[]) {
  return Array.from(
    new Set(values.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))
  );
}

function readArray(source: unknown, key: string) {
  return isRecord(source) && Array.isArray(source[key]) ? source[key] : [];
}

function stringField(source: unknown, key: string) {
  return isRecord(source) && typeof source[key] === "string" ? source[key].trim() : "";
}

function booleanField(source: unknown, key: string) {
  return isRecord(source) ? Boolean(source[key]) : false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
