export type Provider = "routing";

export type HubProvider = {
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

const DEFAULT_TIMEOUT_MS = 90_000;
const CONFIG_TIMEOUT_MS = 10_000;
const DEFAULT_HUB_CONFIG_URL = "http://127.0.0.1:4194/api/model-config";
const DEFAULT_HUB_CHAT_URL = "http://127.0.0.1:4194/hub/api/v1/chat/completions";
const PROJECT_ID = "trace-sheet-workbench";
const PROJECT_PATH = "/tracesheet";
const FALLBACK_PROVIDER: HubProvider = {
  id: "routing",
  name: "GPT · AI Routing",
  defaultModel: "gpt-5.5",
  models: ["gpt-5.5"],
  enabledModels: [],
  enabled: false,
  configured: false,
};

export class HubModelError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 502,
  ) {
    super(message);
  }
}

export async function getProviderCatalog(): Promise<HubProvider[]> {
  const url = process.env.HUB_MODEL_CONFIG_URL || DEFAULT_HUB_CONFIG_URL;

  try {
    const response = await fetch(url, {
      headers: hubProjectHeaders(),
      signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS),
      cache: "no-store",
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
  temperature = 0.2,
  maxTokens = 2600,
}: {
  provider: Provider;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}) {
  if (provider !== "routing") {
    throw new HubModelError("INVALID_PROVIDER", "本项目只接受 Hub 的 GPT 路由。", 422);
  }
  if (!isSupportedModel(model)) {
    throw new HubModelError("INVALID_MODEL", "本项目只允许调用 gpt-* 型号。", 422);
  }

  const response = await fetch(process.env.HUB_CHAT_COMPLETIONS_URL || DEFAULT_HUB_CHAT_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-project-path": PROJECT_PATH,
      ...hubProjectHeaders(),
    },
    body: JSON.stringify({
      provider,
      model,
      projectId: PROJECT_ID,
      messages,
      temperature,
      max_tokens: maxTokens,
      reasoning_effort: "high",
      stream: false,
    }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    cache: "no-store",
  }).catch((error) => {
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

export function normalizeHubProviderCatalog(config: unknown): HubProvider[] {
  const providers = isRecord(config) && Array.isArray(config.providers) ? config.providers : [];
  const provider = providers
    .filter(isRecord)
    .find((item) => ["routing", "openai"].includes(String(item.id)));
  const enabledModels = uniqueStrings(readArray(provider, "enabledModels")).filter(isSupportedModel);
  const catalogModels = uniqueStrings(readArray(provider, "models")).filter(isSupportedModel);
  const configuredModel = stringField(provider, "model");
  const selectedModel = isSupportedModel(configuredModel) ? configuredModel : "";
  const configuredModels = uniqueStrings([...enabledModels, selectedModel, ...catalogModels]).filter(isSupportedModel);
  const defaultModel = selectedModel || enabledModels[0] || catalogModels[0] || FALLBACK_PROVIDER.defaultModel;
  const models = configuredModels.length ? configuredModels : [...FALLBACK_PROVIDER.models];
  const hasConfiguredGpt = Boolean(
    provider && booleanField(provider, "enabled") && booleanField(provider, "configured") && configuredModels.length,
  );

  return [{
    id: "routing",
    name: stringField(provider, "label") || FALLBACK_PROVIDER.name,
    adapter: stringField(provider, "adapter"),
    defaultModel,
    models,
    enabledModels,
    enabled: hasConfiguredGpt,
    configured: hasConfiguredGpt,
  }];
}

export function normalizeModelOperationInput(value: unknown) {
  if (!isRecord(value)) return value;
  const operation = { ...value };
  const op = stringField(operation, "op") || stringField(operation, "type");
  if (op) operation.op = op.toUpperCase();

  if (operation.op === "DEDUP") {
    if (!Array.isArray(operation.keys) && Array.isArray(operation.columns)) {
      operation.keys = operation.columns;
    }
    if (typeof operation.keep === "string") operation.keep = operation.keep.toUpperCase();
  }
  if (operation.op === "JOIN" && typeof operation.joinType === "string") {
    operation.joinType = operation.joinType.toUpperCase();
  }

  return operation;
}

function isSupportedModel(model: string) {
  return /^gpt-/i.test(model.trim());
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
        .map((value) => value.trim()),
    ),
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
