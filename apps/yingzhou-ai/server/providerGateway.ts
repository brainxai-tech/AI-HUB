import { analyzePoem, cleanPoemLine, countHanCharacters } from "../src/shared/analyzer.js";
import { buildDemoDrafts } from "../src/shared/demoGenerator.js";
import {
  styleOptions,
  type GeneratePoemsRequest,
  type GeneratePoemsResult,
  type PoemDraft,
} from "../src/shared/contracts.js";
import { buildGenerationPrompt, buildSystemPrompt } from "./prompt.js";
import { hubChatHeaders, isGptModel, type HubRuntime } from "./hubRuntime.js";

export class ProviderError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export async function generatePoems(
  request: GeneratePoemsRequest,
  runtime: HubRuntime,
): Promise<GeneratePoemsResult> {
  const raw = await callChatCompletions(request, runtime);
  return {
    drafts: normalizeDrafts(parseJson(raw), request),
    disclosure: "当前诗稿由 AI Hub 所选 GPT 型号生成，并由吟舟基础规则引擎重新检查；请继续人工修改和核对。",
  };
}

async function callChatCompletions(request: GeneratePoemsRequest, runtime: HubRuntime) {
  if (runtime.provider !== "openai" || !isGptModel(runtime.model)) {
    throw new ProviderError(422, "INVALID_HUB_MODEL", "吟舟 AI 只允许使用 Hub 的 GPT 型号。");
  }
  const response = await fetch(runtime.chatUrl, {
    method: "POST",
    headers: hubChatHeaders(runtime),
    body: JSON.stringify({
      provider: "openai",
      model: runtime.model,
      projectId: runtime.projectId,
      temperature: 0.82,
      max_tokens: 1800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildGenerationPrompt(request.input) },
      ],
    }),
  });

  const body = await readJson(response) as {
    choices?: Array<{ message?: { content?: unknown } }>;
    error?: { message?: unknown };
  } | null;
  if (!response.ok) {
    const message = typeof body?.error?.message === "string"
      ? body.error.message
      : `Hub GPT 请求失败：HTTP ${response.status}`;
    throw new ProviderError(response.status, "PROVIDER_ERROR", message, body);
  }
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new ProviderError(502, "EMPTY_PROVIDER_RESPONSE", "Hub GPT 没有返回可解析的诗稿。", body);
  }
  return content;
}

function normalizeDrafts(value: unknown, request: GeneratePoemsRequest): PoemDraft[] {
  const fallback = buildDemoDrafts(request.input);
  if (!value || typeof value !== "object" || !Array.isArray((value as { drafts?: unknown }).drafts)) {
    return fallback;
  }
  const candidates = (value as { drafts: unknown[] }).drafts;
  const expectedLength = request.input.genre === "five-quatrain" ? 5 : 7;

  return styleOptions.map((style, index) => {
    const raw = candidates[index];
    if (!raw || typeof raw !== "object") return fallback[index];
    const candidate = raw as Record<string, unknown>;
    const rawLines = Array.isArray(candidate.lines) ? candidate.lines : [];
    const lines = rawLines.slice(0, 4).map((line) =>
      cleanPoemLine(typeof line === "string" ? line : ""),
    );
    const structureValid =
      lines.length === 4 && lines.every((line) => countHanCharacters(line) === expectedLength);
    const acrosticValid =
      request.input.genre !== "acrostic" ||
      lines.map((line) => line[0] || "").join("") === request.input.acrostic;
    if (!structureValid || !acrosticValid) return fallback[index];

    return {
      id: fallback[index].id,
      style,
      title: safeText(candidate.title, fallback[index].title, 8),
      lines,
      interpretation: safeText(candidate.interpretation, fallback[index].interpretation, 180),
      imagery: safeStrings(candidate.imagery, fallback[index].imagery, 5),
      sources: [{
        label: "生成说明",
        note: "该稿由 Hub GPT 生成，未自动声称任何古诗出处；典故与化用请人工复核。",
      }],
      report: analyzePoem(lines, request.input),
    };
  });
}

function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/u);
    if (!match) {
      throw new ProviderError(502, "INVALID_JSON", "Hub GPT 返回的内容不是 JSON。", cleaned.slice(0, 800));
    }
    try {
      return JSON.parse(match[0]);
    } catch (error) {
      throw new ProviderError(
        502,
        "INVALID_JSON",
        "Hub GPT 返回 JSON 解析失败。",
        { error, text: cleaned.slice(0, 1200) },
      );
    }
  }
}

function safeText(value: unknown, fallback: string, limit: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : fallback;
}

function safeStrings(value: unknown, fallback: string[], limit: number) {
  if (!Array.isArray(value)) return fallback;
  const values = value
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim())
    .slice(0, limit);
  return values.length ? values : fallback;
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
