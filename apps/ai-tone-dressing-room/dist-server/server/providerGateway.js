import { isGptModel, rewriteResultSchema } from "../src/shared/contracts.js";
import { callHubChat, HubModelError } from "./hubModels.js";
import { buildRewritePrompt } from "./prompt.js";
import { clampScore, estimateAfterScores, estimateBeforeScores } from "./scoring.js";

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

export async function generateRewrite(input, options = {}) {
    if (input.provider !== "openai") {
        throw new ProviderError(422, "INVALID_PROVIDER", "本项目只接受 Hub 的 GPT 路由。");
    }
    if (!isGptModel(input.model)) {
        throw new ProviderError(422, "INVALID_MODEL", "本项目只允许调用 gpt-* 型号。");
    }
    const model = input.model.trim();
    const { system, user } = buildRewritePrompt(input);
    const callModel = options.callModel || callHubChat;
    const rawText = await callModel({
        provider: "openai",
        model,
        messages: [
            { role: "system", content: system },
            { role: "user", content: user }
        ],
        temperature: 0.35,
        maxTokens: 1600
    }).catch(mapProviderError);
    const result = normalizeModelResult(rawText, input);
    return { result, model };
}

export function normalizeModelResult(text, input) {
    const parsed = parseJsonLoose(extractJsonObject(text));
    const beforeScores = estimateBeforeScores(input.text);
    const draft = {
        ...(typeof parsed === "object" && parsed ? parsed : {}),
        beforeScores: normalizeScores(getRecord(parsed).beforeScores, beforeScores),
        afterScores: normalizeScores(getRecord(parsed).afterScores, estimateAfterScores(input, beforeScores))
    };
    const result = rewriteResultSchema.safeParse(draft);
    if (!result.success) {
        throw new ProviderError(502, "INVALID_PROVIDER_OUTPUT", "模型返回内容无法解析。");
    }
    return result.data;
}

export function extractJsonObject(text) {
    const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start)
        return trimmed;
    return trimmed.slice(start, end + 1);
}

function mapProviderError(error) {
    if (error instanceof ProviderError)
        throw error;
    if (error instanceof HubModelError) {
        throw new ProviderError(error.status, error.code, error.message, error.details);
    }
    throw new ProviderError(502, "HUB_MODEL_ERROR", "Hub 模型代理请求失败，请稍后再试。", String(error));
}

function parseJsonLoose(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return {};
    }
}

function normalizeScores(value, fallback) {
    const record = getRecord(value);
    const normalized = {
        firm: clampScore(record.firm ?? fallback.firm),
        soft: clampScore(record.soft ?? fallback.soft),
        premium: clampScore(record.premium ?? fallback.premium),
        selfLike: clampScore(record.selfLike ?? fallback.selfLike),
        boundary: clampScore(record.boundary ?? fallback.boundary)
    };
    const modelReturnedAllZero = Object.values(normalized).every((score) => score === 0);
    return modelReturnedAllZero ? fallback : normalized;
}

function getRecord(value) {
    return typeof value === "object" && value !== null ? value : {};
}
