import { defaultModels, type Provider, type StoryRequest } from "../src/shared/contracts.js";
import {
  buildStoryPrompt,
  extractJson,
  normalizeStoryResponse,
  ProviderError
} from "./storyEngine.js";

const REQUEST_TIMEOUT_MS = 90_000;
const CONFIG_TIMEOUT_MS = 10_000;
const DEFAULT_HUB_CHAT_URL = "http://127.0.0.1:4194/hub/api/v1/chat/completions";
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

type HubChatResponse = {
  choices?: Array<{ message?: { content?: string }; text?: string }>;
  output_text?: string;
  content?: Array<{ text?: string }>;
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usage?: unknown;
};

const FALLBACK_PROVIDERS: HubProvider[] = [
  {
    id: "openai",
    name: "GPT · AI Routing",
    defaultModel: defaultModels.openai,
    models: ["gpt-5.4"],
    enabledModels: [],
    enabled: false,
    configured: false
  }
];

export async function generateWithProvider(input: StoryRequest) {
  const raw = await callHubProvider(input);
  return normalizeStoryResponse(extractJson(raw.text));
}

export async function getProviderCatalog() {
  const url = process.env.HUB_MODEL_CONFIG_URL;
  if (!url) {
    return staticProviderCatalog();
  }

  try {
    const response = await fetch(url, {
      headers: hubProjectHeaders(),
      signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new ProviderError("HUB_CONFIG_ERROR", `Hub 模型配置读取失败：${response.status}`, 502);
    }

    return normalizeHubProviderCatalog(await response.json());
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error;
    }
    throw new ProviderError("HUB_CONFIG_ERROR", "无法读取 Hub 模型配置，请稍后再试。", 502);
  }
}

async function callHubProvider(input: StoryRequest): Promise<{ text: string; usage?: unknown }> {
  const model = input.model || defaultModels[input.provider];
  if (!isGptModel(model)) {
    throw new ProviderError("INVALID_MODEL", "请选择 AI Hub 为本项目提供的 GPT 型号。", 422);
  }
  const { system, user } = buildStoryPrompt(input);

  const response = await fetch(process.env.HUB_CHAT_COMPLETIONS_URL || DEFAULT_HUB_CHAT_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...hubProjectHeaders()
    },
    body: JSON.stringify({
      provider: input.provider,
      model,
      temperature: 0.82,
      max_tokens: 2600,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  }).catch((error) => {
    throw new ProviderError("HUB_NETWORK_ERROR", "连接 Hub 模型代理失败，请稍后再试。", 502, String(error));
  });

  const payload = (await readJsonResponse(response)) as HubChatResponse | { error?: unknown };
  if (!response.ok) {
    throw new ProviderError("HUB_MODEL_ERROR", hubErrorMessage(payload), response.status >= 500 ? 502 : response.status);
  }

  const text = extractHubText(payload as HubChatResponse);
  if (!text) {
    throw new ProviderError("EMPTY_MODEL_OUTPUT", "Hub 模型代理没有返回可用内容。", 502);
  }

  return { text, usage: "usage" in payload ? payload.usage : undefined };
}

function normalizeHubProviderCatalog(config: unknown): HubProvider[] {
  const providers = isRecord(config) && Array.isArray(config.providers) ? config.providers : [];
  const byId = new Map(
    providers
      .filter(isRecord)
      .map((provider) => [String(provider.id), provider])
  );

  return FALLBACK_PROVIDERS.map((fallback) => {
    const provider = byId.get(fallback.id);
    const enabledModels = uniqueStrings(readArray(provider, "enabledModels")).filter(isGptModel);
    const catalogModels = uniqueStrings(readArray(provider, "models")).filter(isGptModel);
    const configuredModel = stringField(provider, "model");
    const selectedModel = isGptModel(configuredModel) ? configuredModel : "";
    const defaultModel = selectedModel || enabledModels[0] || catalogModels[0] || fallback.defaultModel;
    const models = uniqueStrings([
      ...enabledModels,
      selectedModel,
      ...catalogModels
    ]);
    const hasConfiguredGpt = Boolean(provider && booleanField(provider, "enabled") && booleanField(provider, "configured") && models.length);

    return {
      id: fallback.id,
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

function extractHubText(payload: HubChatResponse) {
  if (payload.output_text) return String(payload.output_text).trim();

  const choiceText = payload.choices?.[0]?.message?.content || payload.choices?.[0]?.text || "";
  if (choiceText) return String(choiceText).trim();

  if (Array.isArray(payload.content)) {
    return payload.content
      .map((part) => part.text || "")
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  if (Array.isArray(payload.candidates)) {
    return payload.candidates
      .flatMap((candidate) => candidate.content?.parts || [])
      .map((part) => part.text || "")
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
