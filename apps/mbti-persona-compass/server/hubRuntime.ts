const DEFAULT_CONFIG_URL = "http://127.0.0.1:4194/hub/api/model-config";
const DEFAULT_CHAT_URL = "http://127.0.0.1:4194/hub/api/v1/chat/completions";
const PROJECT_ID = "mbti-persona-compass";
const PROJECT_PATH = "/mbti";

type Fetcher = typeof fetch;
type RuntimeOptions = {
  env?: NodeJS.ProcessEnv;
  fetcher?: Fetcher;
  timeoutMs?: number;
};

export interface HubRuntime {
  provider: "openai";
  model: string;
  models: string[];
  chatUrl: string;
  projectId: string;
  projectPath: string;
  projectToken: string;
}

export class HubRuntimeError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HubRuntimeError";
  }
}

export function isGptModel(value: unknown): value is string {
  return typeof value === "string" && /^gpt-/i.test(value.trim());
}

export async function resolveHubRuntime(options: RuntimeOptions = {}): Promise<HubRuntime> {
  const env = options.env || process.env;
  const identity = runtimeIdentity(env);
  let response: Response;
  try {
    response = await (options.fetcher || fetch)(
      env.HUB_MODEL_CONFIG_URL?.trim() || DEFAULT_CONFIG_URL,
      {
        headers: hubHeaders({ Accept: "application/json" }, identity),
        signal: AbortSignal.timeout(options.timeoutMs || 10_000),
      },
    );
  } catch {
    throw new HubRuntimeError(502, "HUB_CONFIG_UNAVAILABLE", "无法读取 AI Hub 统一模型配置。");
  }

  const payload = await response.json().catch(() => ({})) as {
    providers?: Array<{
      id?: string;
      model?: string;
      models?: string[];
      enabledModels?: string[];
      enabled?: boolean;
      configured?: boolean;
    }>;
  };
  if (!response.ok) {
    throw new HubRuntimeError(response.status, "HUB_CONFIG_UNAVAILABLE", "AI Hub 统一模型配置不可用。");
  }

  const provider = (payload.providers || []).find((candidate) => candidate.id === "openai");
  const enabledModels = uniqueStrings(provider?.enabledModels || []).filter(isGptModel);
  const catalogModels = uniqueStrings(provider?.models || []).filter(isGptModel);
  const selectedModel = isGptModel(provider?.model) ? provider.model.trim() : "";
  const models = uniqueStrings([...enabledModels, selectedModel, ...catalogModels]).filter(isGptModel);
  if (provider?.enabled !== true || provider?.configured !== true || !selectedModel || models.length === 0) {
    throw new HubRuntimeError(
      503,
      "HUB_PROVIDER_NOT_CONFIGURED",
      "请先在 AI Hub 配置 AI Routing Key，并为本项目选择 GPT 型号。",
    );
  }

  return {
    provider: "openai",
    model: selectedModel,
    models,
    chatUrl: env.HUB_CHAT_COMPLETIONS_URL?.trim() || DEFAULT_CHAT_URL,
    ...identity,
  };
}

export async function readHubModelSelection(options: RuntimeOptions = {}) {
  return requestHubModelSelection("GET", undefined, options);
}

export async function writeHubModelSelection(model: unknown, options: RuntimeOptions = {}) {
  const normalized = String(model || "").trim();
  if (!isGptModel(normalized)) {
    throw new HubRuntimeError(400, "PROJECT_MODEL_INVALID", "本项目只允许选择 gpt-* 型号。");
  }
  return requestHubModelSelection("PUT", normalized, options);
}

export function hubProviderPayload(runtime: HubRuntime | null) {
  const fallbackModel = "gpt-5.4";
  return {
    providers: [{
      id: "openai",
      label: "GPT · AI Routing",
      model: runtime?.model || fallbackModel,
      defaultModel: runtime?.model || fallbackModel,
      models: runtime?.models || [fallbackModel],
      enabledModels: runtime?.models || [],
      enabled: Boolean(runtime),
      configured: Boolean(runtime),
    }],
    configured: Boolean(runtime),
    defaultProvider: "openai",
    source: "hub",
  };
}

export function hubChatHeaders(runtime: HubRuntime): Record<string, string> {
  return hubHeaders({ "Content-Type": "application/json" }, runtime);
}

async function requestHubModelSelection(method: "GET" | "PUT", model: string | undefined, options: RuntimeOptions) {
  const env = options.env || process.env;
  const configUrl = env.HUB_MODEL_CONFIG_URL?.trim() || DEFAULT_CONFIG_URL;
  const url = new URL(configUrl);
  url.pathname = url.pathname.replace(/\/model-config$/, "/project-model-selection");
  let response: Response;
  try {
    response = await (options.fetcher || fetch)(url, {
      method,
      headers: hubHeaders({
        Accept: "application/json",
        ...(method === "PUT" ? { "Content-Type": "application/json" } : {}),
      }, runtimeIdentity(env)),
      body: method === "PUT" ? JSON.stringify({ model }) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs || 10_000),
    });
  } catch {
    throw new HubRuntimeError(502, "HUB_MODEL_SELECTION_UNAVAILABLE", "无法连接 Hub 项目型号配置。");
  }

  const payload = await response.json().catch(() => ({})) as {
    error?: { code?: string; message?: string };
    model?: string;
  };
  if (!response.ok) {
    throw new HubRuntimeError(
      response.status,
      payload.error?.code || "HUB_MODEL_SELECTION_FAILED",
      payload.error?.message || "无法保存项目型号选择。",
    );
  }
  if (method === "GET" && payload.model && !isGptModel(payload.model)) {
    throw new HubRuntimeError(502, "HUB_MODEL_SELECTION_INVALID", "Hub 返回了非 GPT 项目型号。");
  }
  return payload;
}

function runtimeIdentity(env: NodeJS.ProcessEnv) {
  return {
    projectId: env.HUB_PROJECT_ID?.trim() || PROJECT_ID,
    projectPath: env.HUB_PROJECT_PATH?.trim() || PROJECT_PATH,
    projectToken: env.HUB_PROJECT_TOKEN?.trim() || "",
  };
}

function hubHeaders(
  initial: Record<string, string>,
  identity: { projectId: string; projectPath: string; projectToken: string },
) {
  return {
    ...initial,
    "X-Hub-Project-Id": identity.projectId,
    "X-Hub-Project-Path": identity.projectPath,
    ...(identity.projectToken ? { "X-Hub-Project-Token": identity.projectToken } : {}),
  };
}

function uniqueStrings(values: unknown[]) {
  return Array.from(new Set(
    values
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
      .map((value) => value.trim()),
  ));
}
