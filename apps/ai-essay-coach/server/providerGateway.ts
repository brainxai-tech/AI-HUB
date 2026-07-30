import type {
  AnalysisResult,
  AnalyzeRequest,
  ComposeRequest,
  EssayResult,
  OutlineRequest,
  OutlineResult
} from "../src/shared/contracts.js";
import { countEssayLength, fitEssayLength } from "../src/shared/contracts.js";
import { buildDemoAnalysis, buildDemoEssay, buildDemoOutlines } from "./demo.js";
import { buildAnalyzePrompt, buildComposePrompt, buildOutlinePrompt, buildSystemPrompt } from "./prompt.js";
import { hubChatHeaders, isGptModel, type HubRuntime } from "./hubRuntime.js";

export class ProviderError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export async function analyzeEssay(request: AnalyzeRequest, runtime: HubRuntime): Promise<AnalysisResult> {
  const value = await callModel(runtime, buildAnalyzePrompt(request));
  return normalizeAnalysis(parseJson(value), request);
}

export async function createOutlines(request: OutlineRequest, runtime: HubRuntime): Promise<OutlineResult> {
  const value = await callModel(runtime, buildOutlinePrompt(request));
  return normalizeOutlines(parseJson(value), request);
}

export async function composeEssay(request: ComposeRequest, runtime: HubRuntime): Promise<EssayResult> {
  const value = await callModel(runtime, buildComposePrompt(request));
  return normalizeEssay(parseJson(value), request);
}

async function callModel(runtime: HubRuntime, userPrompt: string) {
  if (runtime.provider !== "openai" || !isGptModel(runtime.model)) {
    throw new ProviderError(422, "INVALID_HUB_MODEL", "八百字 AI 只允许使用 Hub 的 GPT 型号。");
  }
  const response = await fetch(runtime.chatUrl, {
    method: "POST",
    headers: hubChatHeaders(runtime),
    body: JSON.stringify({
      provider: "openai",
      model: runtime.model,
      projectId: runtime.projectId,
      temperature: 0.72,
      max_tokens: 4200,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: userPrompt }
      ]
    })
  });

  const body = (await readJson(response)) as {
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
    throw new ProviderError(502, "EMPTY_PROVIDER_RESPONSE", "模型没有返回可解析的内容。", body);
  }
  return content;
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/u);
    if (!match) throw new ProviderError(502, "INVALID_JSON", "模型返回的内容不是 JSON。", cleaned.slice(0, 1000));
    try {
      return JSON.parse(match[0]);
    } catch (error) {
      throw new ProviderError(502, "INVALID_JSON", "模型返回 JSON 解析失败。", { error, text: cleaned.slice(0, 1400) });
    }
  }
}

function normalizeAnalysis(value: unknown, request: AnalyzeRequest): AnalysisResult {
  const fallback = buildDemoAnalysis(request.input);
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<AnalysisResult>;
  return {
    theme: text(candidate.theme, fallback.theme),
    task: text(candidate.task, fallback.task),
    requirements: strings(candidate.requirements, fallback.requirements, 3),
    avoid: strings(candidate.avoid, fallback.avoid, 2),
    angles: strings(candidate.angles, fallback.angles, 3),
    questions: strings(candidate.questions, fallback.questions, 3)
  };
}

function normalizeOutlines(value: unknown, request: OutlineRequest): OutlineResult {
  const fallback = buildDemoOutlines(request.input, request.materials);
  if (!value || typeof value !== "object") return fallback;
  const outlines = (value as Partial<OutlineResult>).outlines;
  if (!Array.isArray(outlines) || outlines.length < 3) return fallback;

  return {
    outlines: outlines.slice(0, 3).map((outline, index) => {
      const base = fallback.outlines[index];
      return {
        id: text(outline?.id, base.id),
        style: ["稳妥型", "个性型", "提分型"].includes(outline?.style) ? outline.style : base.style,
        title: text(outline?.title, base.title),
        thesis: text(outline?.thesis, base.thesis),
        highlight: text(outline?.highlight, base.highlight),
        sections: Array.isArray(outline?.sections) && outline.sections.length
          ? outline.sections.slice(0, 6).map((section, sectionIndex) => ({
              heading: text(section?.heading, base.sections[sectionIndex]?.heading || `第 ${sectionIndex + 1} 段`),
              purpose: text(section?.purpose, base.sections[sectionIndex]?.purpose || "推进文章"),
              targetLength: number(section?.targetLength, base.sections[sectionIndex]?.targetLength || 120)
            }))
          : base.sections
      };
    })
  };
}

function normalizeEssay(value: unknown, request: ComposeRequest): EssayResult {
  const fallback = buildDemoEssay(request);
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<EssayResult>;
  const rawEssay = text(candidate.essay, fallback.essay);
  const essay = fitEssayLength(rawEssay, request.input.targetLength, request.input.includePunctuation);
  const feedback = candidate.feedback && Array.isArray(candidate.feedback.dimensions)
    ? candidate.feedback
    : fallback.feedback;

  return {
    title: text(candidate.title, request.outline.title),
    essay,
    characterCount: countEssayLength(essay, request.input.includePunctuation),
    annotations: Array.isArray(candidate.annotations) ? candidate.annotations.slice(0, 5) : fallback.annotations,
    feedback,
    safetyNote: text(candidate.safetyNote, fallback.safetyNote)
  };
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function strings(value: unknown, fallback: string[], limit: number) {
  if (!Array.isArray(value)) return fallback;
  const output = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, limit);
  return output.length ? output : fallback;
}
