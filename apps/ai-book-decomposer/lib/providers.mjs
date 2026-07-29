const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_TOKENS = 2600;
const DEFAULT_HUB_CHAT_URL = "http://127.0.0.1:4194/hub/api/v1/chat/completions";
const FALLBACK_PROVIDERS = [
  {
    id: "deepseek",
    name: "DeepSeek",
    defaultModel: "deepseek-v4-flash",
    models: ["deepseek-v4-flash", "deepseek-v4-pro"],
    enabled: false,
    configured: false,
  },
  {
    id: "openai",
    name: "GPT",
    defaultModel: "gpt-5.5",
    models: ["gpt-5.5", "gpt-5.5-pro", "gpt-5.4", "gpt-5.4-mini"],
    enabled: false,
    configured: false,
  },
  {
    id: "anthropic",
    name: "Claude",
    defaultModel: "claude-opus-4-8",
    models: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"],
    enabled: false,
    configured: false,
  },
  {
    id: "gemini",
    name: "Gemini",
    defaultModel: "gemini-3.5-flash",
    models: ["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-3-flash-preview"],
    enabled: false,
    configured: false,
  },
];

export function getStaticProviderCatalog() {
  return FALLBACK_PROVIDERS.map((provider) => ({
    ...provider,
    models: [...provider.models],
  }));
}

export async function getProviderCatalog({ fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  const url = hubModelConfigUrl();
  if (!url) {
    return getStaticProviderCatalog();
  }

  const config = await fetchHubJson(url, { fetchImpl, timeoutMs });
  return normalizeHubProviderCatalog(config);
}

export function normalizeHubProviderCatalog(config) {
  const providers = Array.isArray(config?.providers) ? config.providers : [];
  return providers
    .filter((provider) =>
      provider &&
      stringOrEmpty(provider.id) &&
      stringOrEmpty(provider.adapter) !== "ai-routing-compatibility-alias"
    )
    .map((provider) => {
    const id = stringOrEmpty(provider.id);
    const enabledModels = uniqueStrings(provider.enabledModels);
    const catalogModels = uniqueStrings(provider.models);
    const defaultModel = stringOrEmpty(provider.model);
    const models = uniqueStrings([
      ...enabledModels,
      defaultModel,
      ...catalogModels,
    ]);

    return {
      id,
      name: stringOrEmpty(provider.label) || id,
      adapter: stringOrEmpty(provider.adapter),
      defaultModel,
      models,
      enabledModels,
      enabled: Boolean(provider.enabled),
      configured: Boolean(provider.configured),
    };
  });
}

export function buildHubChatPayload({
  provider,
  model,
  system,
  user,
  temperature = 0.35,
  maxTokens = DEFAULT_MAX_TOKENS,
}) {
  const messages = [
    { role: "system", content: String(system || "") },
    { role: "user", content: String(user || "") },
  ];

  return {
    provider,
    model,
    temperature,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages,
  };
}

export async function callProvider({
  provider,
  model,
  system,
  user,
  temperature,
  maxTokens,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { "content-type": "application/json" };
  const token = hubProjectToken();

  if (token) {
    headers["x-hub-project-token"] = token;
  }

  try {
    const response = await fetchImpl(hubChatCompletionsUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify(
        buildHubChatPayload({
          provider,
          model,
          system,
          user,
          temperature,
          maxTokens,
        }),
      ),
      signal: controller.signal,
    });
    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw hubHttpError(response.status, payload);
    }

    return {
      text: extractProviderText(payload),
      usage: extractUsage(payload),
      raw: payload,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new ProviderError("MODEL_TIMEOUT", "模型请求超时，请缩短输入内容或换一个模型。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function extractProviderText(payload) {
  if (payload?.output_text) return String(payload.output_text).trim();

  const choiceText =
    payload?.choices?.[0]?.message?.content ||
    payload?.choices?.[0]?.text ||
    "";
  if (choiceText) return String(choiceText).trim();

  if (Array.isArray(payload?.content)) {
    return payload.content
      .map((part) => part.text || "")
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  if (Array.isArray(payload?.candidates)) {
    return payload.candidates
      .flatMap((candidate) => candidate?.content?.parts || [])
      .map((part) => part.text || "")
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return "";
}

export class ProviderError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.details = details;
  }
}

function hubChatCompletionsUrl() {
  return process.env.HUB_CHAT_COMPLETIONS_URL || DEFAULT_HUB_CHAT_URL;
}

function hubModelConfigUrl() {
  return process.env.HUB_MODEL_CONFIG_URL || "";
}

function hubProjectToken() {
  return process.env.HUB_PROJECT_TOKEN || "";
}

async function fetchHubJson(url, { fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw new ProviderError(
        "HUB_CONFIG_UNAVAILABLE",
        "无法读取 Hub 模型配置，请先检查 AI Hub 是否正常运行。",
        { status: response.status },
      );
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new ProviderError("HUB_CONFIG_UNAVAILABLE", "读取 Hub 模型配置超时。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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

function hubHttpError(status, payload) {
  const message = payload?.error?.message || payload?.error || payload?.message || payload?.text;
  const normalized = String(message || "Hub 模型代理请求失败。").slice(0, 500);

  if (status === 401) {
    return new ProviderError(
      "HUB_PROJECT_TOKEN_REQUIRED",
      "项目未通过 Hub 口令校验，请检查服务端是否注入 project-client.env。",
      { status },
    );
  }

  if (status === 400 && /not been configured|not been enabled/i.test(normalized)) {
    return new ProviderError("MODEL_NOT_CONFIGURED", "该模型尚未在 Hub 中配置或启用。", {
      status,
      upstreamMessage: normalized,
    });
  }

  return new ProviderError("HUB_GATEWAY_ERROR", normalized, { status });
}

function extractUsage(payload) {
  const usage = payload?.usage || payload?.usageMetadata;
  if (!usage) return undefined;

  return {
    inputTokens: usage.prompt_tokens || usage.input_tokens || usage.promptTokenCount,
    outputTokens:
      usage.completion_tokens || usage.output_tokens || usage.candidatesTokenCount,
  };
}

function stringOrEmpty(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}
