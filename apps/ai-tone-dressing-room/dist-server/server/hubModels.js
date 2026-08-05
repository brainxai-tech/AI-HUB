import { defaultModels, isGptModel } from "../src/shared/contracts.js";

const DEFAULT_TIMEOUT_MS = 90_000;
const CONFIG_TIMEOUT_MS = 10_000;
const DEFAULT_HUB_CONFIG_URL = "http://127.0.0.1:4194/hub/api/model-config";
const DEFAULT_HUB_CHAT_URL = "http://127.0.0.1:4194/hub/api/v1/chat/completions";
const PROJECT_ID = "ai-tone-dressing-room";
const PROJECT_PATH = "/tone";
const FALLBACK_PROVIDER = {
    id: "openai",
    name: "GPT · AI Routing",
    defaultModel: defaultModels.openai,
    models: [defaultModels.openai],
    enabledModels: [],
    enabled: false,
    configured: false
};

export class HubModelError extends Error {
    code;
    status;
    details;
    constructor(code, message, status = 502, details) {
        super(message);
        this.name = "HubModelError";
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

export async function getProviderCatalog(fetchImpl = fetch) {
    try {
        const response = await fetchImpl(process.env.HUB_MODEL_CONFIG_URL || DEFAULT_HUB_CONFIG_URL, {
            headers: hubProjectHeaders({ accept: "application/json" }),
            signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS),
            cache: "no-store"
        });
        const payload = await readJsonResponse(response);
        if (!response.ok) {
            throw new HubModelError("HUB_CONFIG_ERROR", `Hub 模型配置读取失败：${response.status}`, 502, payload);
        }
        return normalizeHubProviderCatalog(payload);
    }
    catch (error) {
        if (error instanceof HubModelError)
            throw error;
        throw new HubModelError("HUB_CONFIG_ERROR", "无法读取 Hub 模型配置，请稍后再试。", 502);
    }
}

export async function callHubChat({ provider, model, messages, temperature = 0.35, maxTokens = 1600, fetchImpl = fetch }) {
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
        throw new HubModelError("HUB_NETWORK_ERROR", "连接 Hub 项目级代理失败，请稍后再试。", 502);
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
        throw new HubModelError("HUB_MODEL_ERROR", hubErrorMessage(payload), response.status >= 500 ? 502 : response.status, payload);
    }
    const text = extractHubText(payload);
    if (!text) {
        throw new HubModelError("EMPTY_MODEL_OUTPUT", "Hub 项目级代理没有返回可解析文本。", 502, payload);
    }
    return text;
}

export function normalizeHubProviderCatalog(config) {
    const providers = isRecord(config) && Array.isArray(config.providers) ? config.providers : [];
    const provider = providers.filter(isRecord).find((item) => String(item.id) === "openai");
    const enabledModels = uniqueStrings(readArray(provider, "enabledModels")).filter(isGptModel);
    const catalogModels = uniqueStrings(readArray(provider, "models")).filter(isGptModel);
    const configuredModel = stringField(provider, "model");
    const selectedModel = isGptModel(configuredModel) ? configuredModel : "";
    const configuredModels = uniqueStrings([...enabledModels, selectedModel, ...catalogModels]).filter(isGptModel);
    const defaultModel = selectedModel || enabledModels[0] || catalogModels[0] || FALLBACK_PROVIDER.defaultModel;
    const ready = Boolean(provider && booleanField(provider, "enabled") && booleanField(provider, "configured") && configuredModels.length);
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

function assertHubRoute(provider, model) {
    if (provider !== "openai") {
        throw new HubModelError("INVALID_PROVIDER", "本项目只接受 Hub 的 GPT 路由。", 422);
    }
    if (!isGptModel(model)) {
        throw new HubModelError("INVALID_MODEL", "本项目只允许调用 gpt-* 型号。", 422);
    }
}

function hubProjectHeaders(initial = {}) {
    const token = process.env.HUB_PROJECT_TOKEN;
    return {
        ...initial,
        "x-hub-project-id": PROJECT_ID,
        "x-hub-project-path": PROJECT_PATH,
        ...(token ? { "x-hub-project-token": token } : {})
    };
}

async function readJsonResponse(response) {
    const text = await response.text();
    if (!text)
        return {};
    try {
        return JSON.parse(text);
    }
    catch {
        return { text };
    }
}

function extractHubText(payload) {
    if (!isRecord(payload))
        return "";
    if (typeof payload.output_text === "string")
        return payload.output_text.trim();
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const firstChoice = choices.find(isRecord);
    const content = isRecord(firstChoice?.message) ? firstChoice.message.content : undefined;
    if (typeof content === "string")
        return content.trim();
    return typeof firstChoice?.text === "string" ? firstChoice.text.trim() : "";
}

function hubErrorMessage(payload) {
    if (isRecord(payload) && isRecord(payload.error)) {
        return stringField(payload.error, "message") || "Hub 项目级代理请求失败。";
    }
    return isRecord(payload)
        ? stringField(payload, "error") || stringField(payload, "message") || "Hub 项目级代理请求失败。"
        : "Hub 项目级代理请求失败。";
}

function uniqueStrings(values) {
    return Array.from(new Set(values.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean)));
}

function readArray(source, key) {
    return isRecord(source) && Array.isArray(source[key]) ? source[key] : [];
}

function stringField(source, key) {
    return isRecord(source) && typeof source[key] === "string" ? source[key].trim() : "";
}

function booleanField(source, key) {
    return isRecord(source) ? Boolean(source[key]) : false;
}

function isRecord(value) {
    return typeof value === "object" && value !== null;
}
