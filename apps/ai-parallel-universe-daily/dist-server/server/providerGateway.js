import { parallelDailyResultSchema, realProviderSchema } from "../src/shared/contracts.js";
import { callHubChat, HubModelError } from "./hubModels.js";
import { buildSystemPrompt, buildUserPrompt, maxTokensForTone, temperatureForTone } from "./prompt.js";
export class ProviderError extends Error {
    status;
    code;
    details;
    constructor(status, code, message, details) {
        super(message);
        this.name = "ProviderError";
        this.status = status;
        this.code = code;
        this.details = details;
    }
}
export async function generateWithProvider(input, options = {}) {
    const request = buildHubChatRequest(input);
    const callModel = options.callModel || callHubChat;
    const rawText = await callModel(request).catch(mapProviderError);
    return parseModelResult(rawText);
}
export function buildHubChatRequest(input) {
    const provider = realProviderSchema.safeParse(input.provider);
    if (!provider.success) {
        throw new ProviderError(422, "INVALID_PROVIDER", "本项目只接受 Hub 的 GPT 路由。");
    }
    if (provider.data !== "openai") {
        throw new ProviderError(422, "INVALID_PROVIDER", "本项目只接受 Hub 的 GPT 路由。");
    }
    if (!/^gpt-/i.test(input.model.trim())) {
        throw new ProviderError(422, "INVALID_MODEL", "本项目只允许调用 gpt-* 型号。");
    }
    return {
        provider: provider.data,
        model: input.model,
        messages: [
            { role: "system", content: buildSystemPrompt(input) },
            { role: "user", content: buildUserPrompt(input) }
        ],
        temperature: temperatureForTone(input.tone),
        maxTokens: maxTokensForTone(input.tone)
    };
}
export function parseModelResult(rawText) {
    const payload = extractJsonPayload(rawText);
    let parsed;
    try {
        parsed = JSON.parse(payload);
    }
    catch {
        throw new ProviderError(502, "JSON_PARSE_ERROR", "The model did not return valid JSON.");
    }
    const result = parallelDailyResultSchema.safeParse(parsed);
    if (!result.success) {
        throw new ProviderError(502, "SCHEMA_ERROR", "The model response is missing required fields.", result.error.flatten());
    }
    return result.data;
}
function mapProviderError(error) {
    if (error instanceof ProviderError)
        throw error;
    if (error instanceof HubModelError) {
        throw new ProviderError(error.status, error.code, error.message);
    }
    throw new ProviderError(502, "HUB_MODEL_ERROR", "Hub model gateway request failed.", String(error));
}
function extractJsonPayload(rawText) {
    const trimmed = rawText.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced)
        return fenced;
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start)
        return trimmed.slice(start, end + 1);
    return trimmed;
}
