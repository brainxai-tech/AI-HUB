const DEFAULT_CONFIG_URL = "http://127.0.0.1:4194/hub/api/model-config";
const DEFAULT_CHAT_URL = "http://127.0.0.1:4194/hub/api/v1/chat/completions";
const PROJECT_ID = "ai-ppt-report-coach";
const PROJECT_PATH = "/ppt-report-coach";

export class HubRuntimeError extends Error {
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.name = "HubRuntimeError";
        this.status = status;
        this.code = code;
    }
}

export function isGptModel(value) {
    return typeof value === "string" && /^gpt-/i.test(value.trim());
}

export async function resolveHubRuntime(options = {}) {
    const env = options.env || process.env;
    const configUrl = env.HUB_MODEL_CONFIG_URL?.trim() || DEFAULT_CONFIG_URL;
    const chatUrl = env.HUB_CHAT_COMPLETIONS_URL?.trim() || DEFAULT_CHAT_URL;
    const projectId = env.HUB_PROJECT_ID?.trim() || PROJECT_ID;
    const projectPath = env.HUB_PROJECT_PATH?.trim() || PROJECT_PATH;
    const projectToken = env.HUB_PROJECT_TOKEN?.trim() || "";
    let response;
    try {
        response = await (options.fetcher || fetch)(configUrl, {
            headers: hubHeaders({ Accept: "application/json" }, { projectId, projectPath, projectToken }),
            signal: AbortSignal.timeout(options.timeoutMs || 10_000),
            cache: "no-store"
        });
    }
    catch {
        throw new HubRuntimeError(502, "HUB_CONFIG_UNAVAILABLE", "无法读取 AI Hub 统一模型配置。");
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new HubRuntimeError(response.status, "HUB_CONFIG_UNAVAILABLE", "AI Hub 统一模型配置不可用。");
    }
    const providers = Array.isArray(payload?.providers) ? payload.providers : [];
    const provider = providers.find((candidate) => candidate?.id === "openai");
    const enabledModels = uniqueStrings(provider?.enabledModels || []).filter(isGptModel);
    const catalogModels = uniqueStrings(provider?.models || []).filter(isGptModel);
    const selectedModel = isGptModel(provider?.model) ? provider.model.trim() : "";
    const models = uniqueStrings([...enabledModels, selectedModel, ...catalogModels]).filter(isGptModel);
    if (provider?.enabled !== true || provider?.configured !== true || !selectedModel || !models.length) {
        throw new HubRuntimeError(503, "HUB_PROVIDER_NOT_CONFIGURED", "请先在 AI Hub 配置 AI Routing Key，并为本项目选择 GPT 型号。");
    }
    return {
        provider: "openai",
        model: selectedModel,
        models,
        chatUrl,
        projectId,
        projectPath,
        projectToken
    };
}

export async function readHubModelSelection(options = {}) {
    return requestHubModelSelection("GET", undefined, options);
}

export async function writeHubModelSelection(model, options = {}) {
    const normalized = String(model || "").trim();
    if (!isGptModel(normalized)) {
        throw new HubRuntimeError(400, "PROJECT_MODEL_INVALID", "本项目只允许选择 gpt-* 型号。");
    }
    return requestHubModelSelection("PUT", normalized, options);
}

export function hubProviderPayload(runtime) {
    return {
        providers: [{
                id: "openai",
                label: "GPT · AI Routing",
                model: runtime?.model || "gpt-5.4",
                defaultModel: runtime?.model || "gpt-5.4",
                models: runtime?.models || ["gpt-5.4"],
                enabledModels: runtime?.models || [],
                enabled: Boolean(runtime),
                configured: Boolean(runtime)
            }],
        configured: Boolean(runtime),
        defaultProvider: "openai",
        source: "hub"
    };
}

function uniqueStrings(values) {
    return Array.from(new Set(values.filter((value) => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim())));
}

async function requestHubModelSelection(method, model, options) {
    const env = options.env || process.env;
    const configUrl = env.HUB_MODEL_CONFIG_URL?.trim() || DEFAULT_CONFIG_URL;
    const identity = {
        projectId: env.HUB_PROJECT_ID?.trim() || PROJECT_ID,
        projectPath: env.HUB_PROJECT_PATH?.trim() || PROJECT_PATH,
        projectToken: env.HUB_PROJECT_TOKEN?.trim() || ""
    };
    const url = new URL(configUrl);
    url.pathname = url.pathname.replace(/\/model-config$/, "/project-model-selection");
    let response;
    try {
        response = await (options.fetcher || fetch)(url, {
            method,
            headers: hubHeaders({
                Accept: "application/json",
                ...(method === "PUT" ? { "Content-Type": "application/json" } : {})
            }, identity),
            body: method === "PUT" ? JSON.stringify({ model }) : undefined,
            signal: AbortSignal.timeout(options.timeoutMs || 10_000),
            cache: "no-store"
        });
    }
    catch {
        throw new HubRuntimeError(502, "HUB_MODEL_SELECTION_UNAVAILABLE", "无法连接 Hub 项目型号配置。");
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new HubRuntimeError(response.status, payload?.error?.code || "HUB_MODEL_SELECTION_FAILED", payload?.error?.message || "无法保存项目型号选择。");
    }
    if (method === "GET" && payload?.model && !isGptModel(payload.model)) {
        throw new HubRuntimeError(502, "HUB_MODEL_SELECTION_INVALID", "Hub 返回了非 GPT 项目型号。");
    }
    return payload;
}

function hubHeaders(initial, identity) {
    return {
        ...initial,
        "X-Hub-Project-Id": identity.projectId,
        "X-Hub-Project-Path": identity.projectPath,
        ...(identity.projectToken ? { "X-Hub-Project-Token": identity.projectToken } : {})
    };
}
