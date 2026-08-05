const REQUEST_TIMEOUT_MS = 90_000;
const CONFIG_TIMEOUT_MS = 10_000;
const DEFAULT_HUB_CHAT_URL = "http://127.0.0.1:4194/hub/api/v1/chat/completions";
const SUPPORTED_PROVIDER_IDS = ["deepseek", "openai", "anthropic", "gemini"];

export const PROVIDERS = {
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    defaultModel: "deepseek-v4-flash",
    models: ["deepseek-v4-flash", "deepseek-v4-pro"],
    enabledModels: [],
    enabled: false,
    configured: false
  },
  openai: {
    id: "openai",
    label: "GPT",
    defaultModel: "gpt-5.5",
    models: ["gpt-5.5", "gpt-5.5-pro", "gpt-5.4", "gpt-5.4-mini"],
    enabledModels: [],
    enabled: false,
    configured: false
  },
  anthropic: {
    id: "anthropic",
    label: "Claude",
    defaultModel: "claude-opus-4-8",
    models: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"],
    enabledModels: [],
    enabled: false,
    configured: false
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    defaultModel: "gemini-3.5-flash",
    models: ["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-3-flash-preview"],
    enabledModels: [],
    enabled: false,
    configured: false
  }
};

export class ProviderError extends Error {
  constructor(provider, status, message, details = undefined) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
    this.details = details;
  }
}

export function listProviders() {
  return Object.values(PROVIDERS).map((provider) => ({
    ...provider,
    models: [...provider.models],
    enabledModels: [...provider.enabledModels]
  }));
}

export async function getProviderCatalog() {
  const url = process.env.HUB_MODEL_CONFIG_URL;
  if (!url) return listProviders();

  try {
    const response = await fetch(url, {
      headers: hubProjectHeaders(),
      signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS)
    });
    const data = await readJsonResponse(response);

    if (!response.ok) {
      throw new ProviderError("hub", 502, `Hub model config failed with status ${response.status}`, data);
    }

    return normalizeHubProviderCatalog(data);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("hub", 502, "Hub model config is unavailable");
  }
}

export function resolveModel(provider, model) {
  return model || PROVIDERS[provider]?.defaultModel || "";
}

export function buildProviderPayload(request) {
  const model = resolveModel(request.provider, request.model);
  return {
    provider: request.provider,
    model,
    messages: [
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.userPrompt }
    ],
    temperature: request.jsonMode ? 0.2 : 0.75,
    max_tokens: request.jsonMode ? 1300 : 500,
    stream: false,
    ...(request.jsonMode ? { response_format: { type: "json_object" } } : {})
  };
}

export async function callProvider(request) {
  const provider = String(request.provider || "").toLowerCase();
  if (!SUPPORTED_PROVIDER_IDS.includes(provider)) {
    throw new ProviderError(provider, 422, "Unsupported provider");
  }

  const catalog = await getProviderCatalog();
  const configuredProvider = catalog.find((item) => item.id === provider);
  if (!configuredProvider?.enabled || !configuredProvider.configured) {
    throw new ProviderError(provider, 503, "请先在 Hub 统一模型配置中启用并保存该模型供应商。");
  }

  const model = resolveConfiguredModel(configuredProvider, request.model);
  const payload = buildProviderPayload({ ...request, provider, model });
  const response = await fetch(process.env.HUB_CHAT_COMPLETIONS_URL || DEFAULT_HUB_CHAT_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...hubProjectHeaders()
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  }).catch((error) => {
    throw new ProviderError(provider, 502, "连接 Hub 模型代理失败，请稍后再试。", String(error));
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new ProviderError(provider, response.status >= 500 ? 502 : response.status, hubErrorMessage(data), data);
  }

  const text = extractHubText(data);
  if (!text) {
    throw new ProviderError(provider, 502, "Hub 模型代理没有返回可用内容。", data);
  }

  return {
    text,
    provider,
    model,
    usage: isRecord(data) ? data.usage || null : null
  };
}

function resolveConfiguredModel(provider, requestedModel) {
  const requested = String(requestedModel || "").trim();
  const enabledModels = Array.isArray(provider.enabledModels) ? provider.enabledModels : [];
  const model = requested || provider.defaultModel || enabledModels[0] || provider.models?.[0] || "";

  if (enabledModels.length && !enabledModels.includes(model)) {
    throw new ProviderError(provider.id, 422, "请选择 Hub 中已启用的模型。");
  }

  return model;
}

function normalizeHubProviderCatalog(config) {
  const providers = isRecord(config) && Array.isArray(config.providers) ? config.providers : [];
  const byId = new Map(providers.filter(isRecord).map((provider) => [String(provider.id), provider]));

  return SUPPORTED_PROVIDER_IDS.map((id) => {
    const fallback = PROVIDERS[id];
    const provider = byId.get(id);
    const enabledModels = uniqueStrings(readArray(provider, "enabledModels"));
    const catalogModels = uniqueStrings(readArray(provider, "models"));
    const configuredModel = stringField(provider, "model");
    const defaultModel = configuredModel || enabledModels[0] || fallback.defaultModel;
    const models = uniqueStrings([...enabledModels, defaultModel, ...catalogModels, ...fallback.models]);

    return {
      id,
      label: stringField(provider, "label") || fallback.label,
      adapter: stringField(provider, "adapter"),
      defaultModel,
      models,
      enabledModels,
      enabled: booleanField(provider, "enabled"),
      configured: booleanField(provider, "configured")
    };
  });
}

function hubProjectHeaders() {
  const token = process.env.HUB_PROJECT_TOKEN;
  return token ? { "x-hub-project-token": token } : {};
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function extractHubText(payload) {
  if (!isRecord(payload)) return "";
  if (typeof payload.output_text === "string") return payload.output_text.trim();

  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = choices.find(isRecord);
  if (isRecord(firstChoice?.message) && typeof firstChoice.message.content === "string") {
    return firstChoice.message.content.trim();
  }
  if (typeof firstChoice?.text === "string") return firstChoice.text.trim();

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

function hubErrorMessage(payload) {
  if (isRecord(payload) && isRecord(payload.error)) {
    return stringField(payload.error, "message") || "Hub 模型代理请求失败。";
  }
  if (isRecord(payload)) {
    return stringField(payload, "error") || stringField(payload, "message") || "Hub 模型代理请求失败。";
  }
  return "Hub 模型代理请求失败。";
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean)));
}

function readArray(value, key) {
  return isRecord(value) && Array.isArray(value[key]) ? value[key] : [];
}

function stringField(value, key) {
  return isRecord(value) && typeof value[key] === "string" ? value[key].trim() : "";
}

function booleanField(value, key) {
  return isRecord(value) ? value[key] === true : false;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
