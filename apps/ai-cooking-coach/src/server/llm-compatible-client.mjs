const HUB_CHAT_COMPLETIONS_URL = process.env.HUB_CHAT_COMPLETIONS_URL || "http://127.0.0.1:4194/hub/api/v1/chat/completions";
const HUB_PROJECT_TOKEN = process.env.HUB_PROJECT_TOKEN || "";

export function defaultProvider() {
  return "openai";
}

export function normalizeProvider(value) {
  return defaultProvider();
}

export function defaultModelForProvider(providerInput) {
  return "";
}

export function providerEndpoint({ provider, apiBaseUrl } = {}) {
  return HUB_CHAT_COMPLETIONS_URL;
}

export function buildCompatibleChatPayload({
  provider = defaultProvider(),
  model,
  messages,
  temperature = 0.4,
  maxTokens = 4000,
  jsonMode = true
} = {}) {
  const normalizedProvider = normalizeProvider(provider);
  const payload = {
    model: model || defaultModelForProvider(normalizedProvider),
    messages: Array.isArray(messages) ? messages : [],
    temperature,
    max_tokens: maxTokens
  };

  if (jsonMode) {
    payload.response_format = { type: "json_object" };
  }
  return payload;
}

export async function requestCompatibleChatCompletion({
  messages,
  temperature = 0.4,
  maxTokens = 4000,
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw createCompatibleError("当前 Node 环境缺少 fetch。", 500);
  }

  let response;
  try {
    response = await fetchImpl(HUB_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: hubHeaders(),
      body: JSON.stringify({
        messages,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" }
      })
    });
  } catch (error) {
    throw mapCompatibleNetworkError(error, "hub");
  }

  if (!response.ok) {
    const raw = typeof response.text === "function" ? await response.text() : "";
    throw mapCompatibleHttpError(response.status, raw, "hub");
  }

  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  if (!content) {
    throw createCompatibleError("模型返回中缺少 choices[0].message.content。", 502);
  }
  return content;
}

function hubHeaders() {
  const headers = {
    "Content-Type": "application/json"
  };
  if (HUB_PROJECT_TOKEN) {
    headers["x-hub-project-token"] = HUB_PROJECT_TOKEN;
  }
  return headers;
}

function mapCompatibleHttpError(status, raw, provider) {
  if (status === 401 || status === 403) {
    return createCompatibleError("AI Hub 尚未配置可用模型或项目无权调用。", status, raw);
  }
  if (status === 429) {
    return createCompatibleError(`${providerLabel(provider)} 请求过于频繁或额度不足，请稍后重试。`, status, raw);
  }
  return createCompatibleError(`${providerLabel(provider)} 请求失败 (${status}): ${raw.slice(0, 160)}`, status, raw);
}

function mapCompatibleNetworkError(error, provider) {
  const mapped = createCompatibleError(`无法连接 ${providerLabel(provider)} 兼容 API，请检查网络、Base URL 或运行环境出站 HTTPS。`, 502);
  mapped.cause = error;
  return mapped;
}

function createCompatibleError(message, status = 500, raw = undefined) {
  const error = new Error(message);
  error.status = status;
  if (raw !== undefined) error.raw = String(raw).slice(0, 600);
  return error;
}

function providerLabel(provider) {
  return "AI Hub";
}
