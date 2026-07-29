const DEFAULT_TIMEOUT_MS = 90_000;
const CONFIG_TIMEOUT_MS = 10_000;
const DEFAULT_HUB_CONFIG_URL = "http://127.0.0.1:4194/hub/api/model-config";
const DEFAULT_HUB_CHAT_URL = "http://127.0.0.1:4194/hub/api/v1/chat/completions";
const FALLBACK_PROVIDER = {
    id: "openai",
    name: "GPT · AI Routing",
    defaultModel: "gpt-5.4",
    models: ["gpt-5.4"],
    enabledModels: [],
    enabled: false,
    configured: false
};
export class HubModelError extends Error {
    code;
    status;
    constructor(code, message, status = 502) {
        super(message);
        this.name = "HubModelError";
        this.code = code;
        this.status = status;
    }
}
export async function getProviderCatalog() {
    try {
        const response = await fetch(process.env.HUB_MODEL_CONFIG_URL || DEFAULT_HUB_CONFIG_URL, {
            headers: hubProjectHeaders(),
            signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS),
            cache: "no-store"
        });
        if (!response.ok) {
            throw new HubModelError("HUB_CONFIG_ERROR", `Hub model config request failed: ${response.status}`, 502);
        }
        return normalizeHubProviderCatalog(await response.json());
    }
    catch (error) {
        if (error instanceof HubModelError)
            throw error;
        throw new HubModelError("HUB_CONFIG_ERROR", "Unable to read Hub model config.", 502);
    }
}
export async function callHubChat({ provider, model, messages, temperature = 0.42, maxTokens = 3200 }) {
    assertHubRoute(provider, model);
    const response = await fetch(process.env.HUB_CHAT_COMPLETIONS_URL || DEFAULT_HUB_CHAT_URL, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...hubProjectHeaders()
        },
        body: JSON.stringify({
            provider,
            model,
            projectId: "ai-parallel-universe-daily",
            messages,
            temperature,
            max_tokens: maxTokens,
            response_format: { type: "json_object" },
            stream: false
        }),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        cache: "no-store"
    }).catch(() => {
        throw new HubModelError("HUB_NETWORK_ERROR", "Unable to reach Hub model gateway.", 502);
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
        throw new HubModelError("HUB_MODEL_ERROR", hubErrorMessage(payload), response.status >= 500 ? 502 : response.status);
    }
    const text = extractHubText(payload);
    if (!text) {
        throw new HubModelError("EMPTY_MODEL_OUTPUT", "Hub model gateway returned empty content.", 502);
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
function hubProjectHeaders() {
    const token = process.env.HUB_PROJECT_TOKEN;
    return {
        "x-hub-project-id": "ai-parallel-universe-daily",
        "x-hub-project-path": "/parallel-daily",
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
    const choice = choices.find(isRecord);
    if (isRecord(choice?.message) && typeof choice.message.content === "string")
        return choice.message.content.trim();
    return typeof choice?.text === "string" ? choice.text.trim() : "";
}
function hubErrorMessage(payload) {
    if (isRecord(payload) && isRecord(payload.error)) {
        return stringField(payload.error, "message") || "Hub model gateway request failed.";
    }
    return isRecord(payload)
        ? stringField(payload, "error") || stringField(payload, "message") || "Hub model gateway request failed."
        : "Hub model gateway request failed.";
}
function uniqueStrings(values) {
    return Array.from(new Set(values.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean)));
}
function isGptModel(value) {
    return typeof value === "string" && /^gpt-/i.test(value.trim());
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
