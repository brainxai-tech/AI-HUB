import type { RealProvider } from "../src/shared/contracts.js";

export type HubProvider = {
  id: RealProvider;
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
  provider: RealProvider;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
};

const DEFAULT_TIMEOUT_MS = 90_000;
const CONFIG_TIMEOUT_MS = 10_000;
const DEFAULT_HUB_CHAT_URL = "http://127.0.0.1:4194/hub/api/v1/chat/completions";
const SUPPORTED_PROVIDERS: RealProvider[] = ["openai"];

const FALLBACK_PROVIDERS: HubProvider[] = [
  {
    id: "openai",
    name: "GPT · AI Routing",
    defaultModel: "gpt-5.4",
    models: ["gpt-5.4"],
    enabledModels: [],
    enabled: false,
    configured: false
  }
];

export class HubModelError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = "HubModelError";
    this.code = code;
    this.status = status;
  }
}

export async function getProviderCatalog(): Promise<HubProvider[]> {
  const url = process.env.HUB_MODEL_CONFIG_URL;
  if (!url) return staticProviderCatalog();

  try {
    const response = await fetch(url, {
      headers: hubProjectHeaders(),
      signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS),
      cache: "no-store"
    });

    if (!response.ok) {
      throw new HubModelError("HUB_CONFIG_ERROR", `Hub 模型配置读取失败：${response.status}`, 502);
    }

    return normalizeHubProviderCatalog(await response.json());
  } catch (error) {
    if (error instanceof HubModelError) throw error;
    throw new HubModelError("HUB_CONFIG_ERROR", "无法读取 Hub 模型配置，请稍后再试。", 502);
  }
}

export async function callHubChat({
  provider,
  model,
  messages,
  temperature = 0.45,
  maxTokens = 1800
}: HubChatRequest) {
  const response = await fetch(process.env.HUB_CHAT_COMPLETIONS_URL || DEFAULT_HUB_CHAT_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...hubProjectHeaders()
    },
    body: JSON.stringify({
      provider,
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false
    }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    cache: "no-store"
  }).catch(() => {
    throw new HubModelError("HUB_NETWORK_ERROR", "连接 Hub 模型代理失败，请稍后再试。", 502);
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new HubModelError("HUB_MODEL_ERROR", hubErrorMessage(payload), response.status >= 500 ? 502 : response.status);
  }

  const text = extractHubText(payload);
  if (!text) {
    throw new HubModelError("EMPTY_MODEL_OUTPUT", "Hub 模型代理没有返回可用内容。", 502);
  }

  return text;
}

function normalizeHubProviderCatalog(config: unknown): HubProvider[] {
  const providers = isRecord(config) && Array.isArray(config.providers) ? config.providers : [];
  const byId = new Map(providers.filter(isRecord).map((provider) => [String(provider.id), provider]));

  return SUPPORTED_PROVIDERS.map((id) => {
    const fallback = FALLBACK_PROVIDERS.find((provider) => provider.id === id)!;
    const provider = byId.get(id);
    const enabledModels = uniqueStrings(readArray(provider, "enabledModels")).filter(isGptModel);
    const catalogModels = uniqueStrings(readArray(provider, "models")).filter(isGptModel);
    const configuredModel = stringField(provider, "model");
    const selectedModel = isGptModel(configuredModel) ? configuredModel : "";
    const models = uniqueStrings([...enabledModels, selectedModel, ...catalogModels]);
    const defaultModel = selectedModel || enabledModels[0] || catalogModels[0] || fallback.defaultModel;
    const hasConfiguredGpt = Boolean(provider && booleanField(provider, "enabled") && booleanField(provider, "configured") && models.length);

    return {
      id,
      name: stringField(provider, "label") || fallback.name,
      adapter: stringField(provider, "adapter"),
      defaultModel,
      models,
      enabledModels,
      enabled: hasConfiguredGpt,
      configured: hasConfiguredGpt
    };
  });
}

function staticProviderCatalog() {
  return FALLBACK_PROVIDERS.map((provider) => ({
    ...provider,
    models: [...provider.models],
    enabledModels: [...provider.enabledModels]
  }));
}

function hubProjectHeaders(): Record<string, string> {
  const token = process.env.HUB_PROJECT_TOKEN;
  return token ? { "x-hub-project-token": token } : {};
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
  if (typeof firstChoice?.text === "string") {
    return firstChoice.text.trim();
  }

  if (Array.isArray(payload.content)) {
    return payload.content
      .filter(isRecord)
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  if (Array.isArray(payload.candidates)) {
    return payload.candidates
      .filter(isRecord)
      .flatMap((candidate) => (isRecord(candidate.content) && Array.isArray(candidate.content.parts) ? candidate.content.parts : []))
      .filter(isRecord)
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return "";
}

function hubErrorMessage(payload: unknown) {
  if (isRecord(payload) && isRecord(payload.error)) {
    return stringField(payload.error, "message") || "Hub 模型代理请求失败。";
  }
  if (isRecord(payload)) {
    return stringField(payload, "error") || stringField(payload, "message") || "Hub 模型代理请求失败。";
  }
  return "Hub 模型代理请求失败。";
}

function uniqueStrings(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim())
    )
  );
}

function isGptModel(value: string) {
  return /^gpt-/i.test(value);
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
