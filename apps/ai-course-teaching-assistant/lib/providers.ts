import {
  buildTeachingPrompt,
  normalizeTeachingBundle,
  parseJsonObject,
  TEACHING_SYSTEM_PROMPT,
  type ProviderId,
  type TeachingBundle,
  type TeachingRequest,
} from "./teaching.ts";

export interface HubProvider {
  id: ProviderId;
  label: string;
  adapter?: string;
  defaultModel: string;
  models: string[];
  enabledModels: string[];
  enabled: boolean;
  configured: boolean;
}

export interface HubChatPayload {
  provider: ProviderId;
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  response_format: { type: "json_object" };
  temperature: number;
  max_tokens: number;
  stream: false;
}

export class ProviderError extends Error {
  readonly code: "HUB_CONFIG_ERROR" | "HUB_PROVIDER_NOT_CONFIGURED" | "HUB_MODEL_NOT_ENABLED" | "HUB_NETWORK_ERROR" | "HUB_MODEL_ERROR" | "PROVIDER_BAD_RESPONSE";
  readonly status: number;

  constructor(
    message: string,
    code: "HUB_CONFIG_ERROR" | "HUB_PROVIDER_NOT_CONFIGURED" | "HUB_MODEL_NOT_ENABLED" | "HUB_NETWORK_ERROR" | "HUB_MODEL_ERROR" | "PROVIDER_BAD_RESPONSE",
    status = 502,
  ) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const REQUEST_TIMEOUT_MS = Math.min(
  Math.max(Number.parseInt(process.env.HUB_COURSE_REQUEST_TIMEOUT_MS || "190000", 10) || 190_000, 1_000),
  300_000,
);
const CONFIG_TIMEOUT_MS = 10_000;
const DEFAULT_HUB_CHAT_URL = "http://127.0.0.1:4194/hub/api/v1/chat/completions";
const supportedProviders: ProviderId[] = ["openai"];

const fallbackProviders: HubProvider[] = [
  {
    id: "openai",
    label: "GPT · AI Routing",
    defaultModel: "gpt-5.4",
    models: ["gpt-5.4"],
    enabledModels: [],
    enabled: false,
    configured: false,
  },
];

export async function getProviderCatalog(): Promise<HubProvider[]> {
  const url = process.env.HUB_MODEL_CONFIG_URL;
  if (!url) {
    return staticProviderCatalog();
  }

  try {
    const response = await fetch(url, {
      headers: hubProjectHeaders(),
      signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS),
      cache: "no-store",
    });
    const data = await readJsonResponse(response);

    if (!response.ok) {
      throw new ProviderError(`Hub 模型配置读取失败：${response.status}`, "HUB_CONFIG_ERROR", 502);
    }

    return normalizeHubProviderCatalog(data);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("无法读取 Hub 模型配置，请稍后再试。", "HUB_CONFIG_ERROR", 502);
  }
}

export function buildHubChatPayload(provider: ProviderId, model: string, prompt: string): HubChatPayload {
  if (provider !== "openai") {
    throw new ProviderError("本项目只接受 Hub 的 GPT 路由。", "HUB_PROVIDER_NOT_CONFIGURED", 422);
  }
  if (!/^gpt-/i.test(model)) {
    throw new ProviderError("本项目只允许调用 gpt-* 型号。", "HUB_MODEL_NOT_ENABLED", 422);
  }

  return {
    provider,
    model,
    messages: [
      { role: "system", content: TEACHING_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.45,
    max_tokens: 4200,
    stream: false,
  };
}

export function extractProviderText(data: unknown): string {
  if (!isRecord(data)) return "";
  if (typeof data.output_text === "string") return data.output_text.trim();

  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices.find(isRecord);
  if (isRecord(firstChoice?.message) && typeof firstChoice.message.content === "string") {
    return firstChoice.message.content.trim();
  }
  if (typeof firstChoice?.text === "string") {
    return firstChoice.text.trim();
  }

  if (Array.isArray(data.content)) {
    return data.content
      .filter(isRecord)
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  if (Array.isArray(data.candidates)) {
    return data.candidates
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

export async function callTeachingProvider(request: TeachingRequest): Promise<TeachingBundle> {
  const provider = await resolveConfiguredProvider(request.provider, request.model);
  const model = provider.model;
  const prompt = buildTeachingPrompt({ ...request, model });
  const payload = buildHubChatPayload(provider.id, model, prompt);
  const response = await fetch(process.env.HUB_CHAT_COMPLETIONS_URL || DEFAULT_HUB_CHAT_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...hubProjectHeaders(),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  }).catch(() => {
    throw new ProviderError("连接 Hub 模型代理失败，请稍后再试。", "HUB_NETWORK_ERROR", 502);
  });
  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new ProviderError(hubErrorMessage(data), "HUB_MODEL_ERROR", response.status >= 500 ? 502 : response.status);
  }

  const text = extractProviderText(data);
  if (!text) {
    throw new ProviderError("Hub 模型代理没有返回可用内容。", "PROVIDER_BAD_RESPONSE");
  }

  try {
    return normalizeTeachingBundle(parseJsonObject(text), { ...request, model }, provider.id, model);
  } catch {
    throw new ProviderError("Hub 模型返回的教学包 JSON 不完整，请换一个模型或稍后重试。", "PROVIDER_BAD_RESPONSE");
  }
}

async function resolveConfiguredProvider(providerId: ProviderId, requestedModel?: string) {
  if (!supportedProviders.includes(providerId)) {
    throw new ProviderError("本项目只接受 Hub 的 GPT 路由。", "HUB_PROVIDER_NOT_CONFIGURED", 422);
  }

  const catalog = await getProviderCatalog();
  const provider = catalog.find((item) => item.id === providerId);
  if (!provider?.enabled || !provider.configured) {
    throw new ProviderError("请先在 Hub 配置 AI Routing Key 并为本项目启用 GPT 型号。", "HUB_PROVIDER_NOT_CONFIGURED", 503);
  }

  const enabledModels = provider.enabledModels.length ? provider.enabledModels : provider.models;
  const model = requestedModel || provider.defaultModel || enabledModels[0];
  if (!model || !/^gpt-/i.test(model) || (enabledModels.length && !enabledModels.includes(model))) {
    throw new ProviderError("请选择 Hub 中已启用的模型。", "HUB_MODEL_NOT_ENABLED", 422);
  }

  return { id: provider.id, model };
}

function normalizeHubProviderCatalog(config: unknown): HubProvider[] {
  const providers = isRecord(config) && Array.isArray(config.providers) ? config.providers : [];
  const byId = new Map(providers.filter(isRecord).map((provider) => [String(provider.id), provider]));

  return supportedProviders.map((id) => {
    const fallback = fallbackProviders.find((provider) => provider.id === id)!;
    const provider = byId.get(id);
    const enabledModels = uniqueStrings(readArray(provider, "enabledModels")).filter(isGptModel);
    const catalogModels = uniqueStrings(readArray(provider, "models")).filter(isGptModel);
    const configuredModel = stringField(provider, "model");
    const selectedModel = isGptModel(configuredModel) ? configuredModel : "";
    const models = uniqueStrings([...enabledModels, selectedModel, ...catalogModels]);
    const defaultModel = selectedModel || enabledModels[0] || catalogModels[0] || fallback.defaultModel;
    const hasConfiguredGpt = Boolean(
      provider && booleanField(provider, "enabled") && booleanField(provider, "configured") && models.length,
    );

    return {
      id,
      label: stringField(provider, "label") || fallback.label,
      adapter: stringField(provider, "adapter"),
      defaultModel,
      models,
      enabledModels,
      enabled: hasConfiguredGpt,
      configured: hasConfiguredGpt,
    };
  });
}

function staticProviderCatalog() {
  return fallbackProviders.map((provider) => ({
    ...provider,
    models: [...provider.models],
    enabledModels: [...provider.enabledModels],
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
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean)));
}

function readArray(value: unknown, key: string) {
  return isRecord(value) && Array.isArray(value[key]) ? value[key] : [];
}

function isGptModel(value: string) {
  return /^gpt-/i.test(value);
}

function stringField(value: unknown, key: string) {
  return isRecord(value) && typeof value[key] === "string" ? value[key].trim() : "";
}

function booleanField(value: unknown, key: string) {
  return isRecord(value) ? value[key] === true : false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
