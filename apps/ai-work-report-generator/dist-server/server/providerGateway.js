import { workReportSchema } from "../src/shared/contracts.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import { isGptModel } from "./hubRuntime.js";

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

export const DEFAULT_PROVIDER_TIMEOUT_MS = 120_000;

export async function generateWithProvider(request, options = {}) {
    const hubRuntime = options.hubRuntime;
    if (!hubRuntime) {
        throw new ProviderError(503, "HUB_RUNTIME_REQUIRED", "请先在 AI Hub 配置 AI Routing Key，并为本项目选择 GPT 型号。");
    }
    if (hubRuntime.provider !== "openai") {
        throw new ProviderError(422, "INVALID_PROVIDER", "本项目只接受 Hub 的 GPT 路由。");
    }
    if (!isGptModel(hubRuntime.model)) {
        throw new ProviderError(422, "INVALID_MODEL", "本项目只允许调用 gpt-* 型号。");
    }
    const headers = {
        "Content-Type": "application/json",
        "X-Hub-Project-Id": hubRuntime.projectId,
        "X-Hub-Project-Path": hubRuntime.projectPath,
        ...(hubRuntime.projectToken ? { "X-Hub-Project-Token": hubRuntime.projectToken } : {})
    };
    const response = await timedFetch(options.fetcher || fetch, hubRuntime.chatUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
            provider: "openai",
            model: hubRuntime.model,
            projectId: hubRuntime.projectId,
            temperature: request.style === "outcome" ? 0.25 : 0.35,
            max_tokens: 6000,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: buildSystemPrompt() },
                { role: "user", content: buildUserPrompt(request) }
            ]
        })
    }, options.timeoutMs || DEFAULT_PROVIDER_TIMEOUT_MS);
    const raw = await response.text();
    let payload;
    try {
        payload = raw ? JSON.parse(raw) : {};
    }
    catch {
        payload = { text: raw };
    }
    if (!response.ok) {
        throw new ProviderError(mapStatus(response.status), "PROVIDER_HTTP_ERROR", providerMessage(response.status, payload), sanitize(payload));
    }
    const content = extractResponseText(payload);
    if (!content) {
        throw new ProviderError(502, "EMPTY_MODEL_OUTPUT", "Hub 项目级代理没有返回可识别的模型内容。");
    }
    return parseReportPayload(content);
}

export function parseReportPayload(rawText) {
    const jsonText = extractJsonPayload(rawText);
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    }
    catch {
        throw new ProviderError(502, "JSON_PARSE_ERROR", "GPT 型号没有返回合法 JSON，请重试。");
    }
    const result = workReportSchema.safeParse(parsed);
    if (!result.success) {
        throw new ProviderError(502, "SCHEMA_ERROR", "GPT 型号返回的汇报结构不完整，请重试。", result.error.flatten());
    }
    return result.data;
}

function extractJsonPayload(value) {
    const trimmed = value.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced)
        return fenced;
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

function extractResponseText(payload) {
    if (!isRecord(payload))
        return "";
    if (typeof payload.output_text === "string")
        return payload.output_text.trim();
    if (typeof payload.text === "string")
        return payload.text.trim();
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const first = choices.find(isRecord);
    const message = first && isRecord(first.message) ? first.message : null;
    if (message && typeof message.content === "string")
        return message.content.trim();
    if (message && Array.isArray(message.content)) {
        return message.content
            .filter(isRecord)
            .map((part) => typeof part.text === "string" ? part.text : "")
            .filter(Boolean)
            .join("\n")
            .trim();
    }
    return first && typeof first.text === "string" ? first.text.trim() : "";
}

async function timedFetch(fetcher, url, init, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetcher(url, { ...init, signal: controller.signal });
    }
    catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new ProviderError(504, "HUB_TIMEOUT", "Hub GPT 生成超时，请稍后重试或缩短工作记录。");
        }
        throw new ProviderError(502, "HUB_NETWORK_ERROR", "无法连接 Hub 项目级代理，请稍后重试。", String(error));
    }
    finally {
        clearTimeout(timer);
    }
}

function providerMessage(status, payload) {
    const detail = isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
        ? payload.error.message.slice(0, 240)
        : "";
    if (status === 401 || status === 403)
        return "Hub 项目身份无效或没有访问该 GPT 型号的权限。";
    if (status === 429)
        return "Hub 路由额度不足或请求过于频繁，请稍后重试。";
    if (status === 404)
        return "Hub 项目级代理或 GPT 型号不存在。";
    return detail ? `Hub 返回错误：${detail}` : "Hub 项目级代理请求失败。";
}

function mapStatus(status) {
    if ([401, 403, 404, 429].includes(status))
        return status;
    return status >= 500 ? 502 : 400;
}

function sanitize(payload) {
    return JSON.stringify(payload).slice(0, 800).replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]");
}

function isRecord(value) {
    return typeof value === "object" && value !== null;
}
