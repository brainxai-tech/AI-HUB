import { realProviderSchema, villainCardSchema } from "../src/shared/contracts.js";
import { callHubChat, HubModelError } from "./hubModels.js";
import { buildRewritePrompt, buildSystemPrompt, buildUserPrompt, temperatureForTone } from "./prompt.js";
import { evaluateVillainCard, formatQualityIssues } from "./quality.js";
export class ProviderError extends Error {
    status;
    code;
    details;
    constructor(status, code, message, details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }
}
export async function generateWithProvider(input, options = {}) {
    const callModel = options.callModel || ((request) => callHubChat(request));
    const initialRequest = buildProviderChatRequest(input, buildUserPrompt(input));
    const rawText = await callModel(initialRequest).catch(mapProviderError);
    const draft = parseModelResult(rawText);
    const draftQuality = evaluateVillainCard(input, draft);
    if (draftQuality.passed) {
        return {
            data: draft,
            quality: draftQuality,
            rewritten: false
        };
    }
    const rewriteRequest = buildProviderChatRequest(input, buildRewritePrompt(input, draft, formatQualityIssues(draftQuality.issues)));
    const rewriteText = await callModel(rewriteRequest).catch(mapProviderError);
    const rewritten = parseModelResult(rewriteText);
    const rewrittenQuality = evaluateVillainCard(input, rewritten);
    return {
        data: rewritten,
        quality: rewrittenQuality,
        rewritten: true
    };
}
export function buildProviderChatRequest(input, userPrompt) {
    const provider = realProviderSchema.safeParse(input.provider);
    if (!provider.success) {
        throw new ProviderError(422, "INVALID_PROVIDER", "本项目只接受 Hub 的 GPT 路由。");
    }
    if (!/^gpt-/i.test(input.model)) {
        throw new ProviderError(422, "INVALID_MODEL", "本项目只允许调用 gpt-* 型号。");
    }
    const systemPrompt = buildSystemPrompt(input);
    return {
        provider: provider.data,
        model: input.model,
        systemPrompt,
        userPrompt,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        temperature: temperatureForTone(input.tone),
        maxTokens: 2600
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
    const result = villainCardSchema.safeParse(parsed);
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
