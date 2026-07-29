import {
  CoachOutputSchema,
  isGptModel,
  type CoachOutput,
  type CoachTask,
  type EvidenceKind,
  type GeneratePaperCoachInput,
  type GeneratePaperCoachRequest
} from "../src/shared/contracts.js";
import { callHubChat, HubModelError, type HubChatRequest } from "./hubModels.js";

const MAX_OUTPUT_TOKENS = 2_800;

export class ProviderError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(code: string, message: string, status = 502, details?: unknown) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export async function generatePaperCoachOutput(
  request: GeneratePaperCoachRequest,
  options: { callModel?: (request: HubChatRequest) => Promise<string> } = {}
) {
  const hubRequest = buildHubChatRequest(request);
  const callModel = options.callModel || callHubChat;
  const text = await callModel(hubRequest).catch((error) => {
    if (error instanceof HubModelError) {
      throw new ProviderError(error.code, error.message, error.status);
    }

    throw new ProviderError("HUB_MODEL_ERROR", "Hub 模型代理请求失败，请稍后再试。", 502, String(error));
  });

  if (!text) {
    throw new ProviderError("EMPTY_MODEL_OUTPUT", "模型没有返回可用内容。", 502);
  }

  return normalizeCoachOutput(extractJson(text), request.task);
}

export function buildHubChatRequest(request: GeneratePaperCoachRequest): HubChatRequest {
  if (request.provider !== "openai") {
    throw new ProviderError("INVALID_PROVIDER", "本项目只接受 Hub 的 GPT 路由。", 422);
  }
  if (!isGptModel(request.model)) {
    throw new ProviderError("INVALID_MODEL", "本项目只允许调用 gpt-* 型号。", 422);
  }
  const prompt = buildCoachPrompt(request.task, request.input);

  return {
    provider: request.provider,
    model: request.model,
    temperature: 0.2,
    maxTokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ]
  };
}

export function buildCoachPrompt(task: CoachTask, input: GeneratePaperCoachInput) {
  const language = input.outputLanguage === "zh-CN" ? "中文" : "English";
  const levelGuide = {
    beginner: "新手版：像老师讲课，解释术语，不跳步骤。",
    graduate: "研究生版：保留术语、方法细节和实验逻辑。",
    reviewer: "同行评审版：重点审视假设、实验设计、统计证据和局限。"
  }[input.userLevel];
  const taskGuide = {
    paper_map:
      "生成论文地图：blocks 依次覆盖 研究问题、核心贡献、方法路线、实验设计、主要结论、局限性、适合谁读。每个 body 先给一句话结论，再解释为什么用户要关心。",
    section_explain:
      "解释选中段落：blocks 依次覆盖 一句话结论、这段在讲什么、关键概念、为什么重要、可能的坑、建议追问。必须紧扣选中文本，不要泛泛介绍整篇论文。",
    qa:
      "回答用户问题：blocks 依次覆盖 直接回答、论文证据、解释与边界、下一步阅读建议。能回答就先短答；证据不足时明确说缺什么，不要编造。",
    quiz:
      "生成复习包：cards 必须放 10 个概念卡片，questions 必须放 5 个理解题，interviewQuestions 必须放 3 个面试式问题，notesMarkdown 必须放 1 份中文笔记。概念卡 body 包含 定义、本文作用、易混点；理解题最好带参考答案或作答提示。"
  }[task];

  const system = [
    "你是 AI · 论文阅读教练，不是论文总结器。",
    "你的任务是带用户读懂论文：预习、拆结构、解释段落、追问、复习。",
    "输出要像教练：先给一句话结论，再拆原因，再提示用户下一步看哪里或该追问什么。",
    "避免空泛套话。每个 heading 要具体，body 要能帮助用户复述、判断证据或继续阅读。",
    "证据纪律：每个结论都要标记 evidence 为 based_on_text、inferred 或 uncertain。",
    "展示给用户时这三个 evidence 分别代表：基于论文文本、推测、不确定。",
    "若 evidence 是 based_on_text，refs 至少写一个段落 ID，例如 S1-P1；不要编造论文没有提供的信息。",
    "输出必须是严格 JSON，不要 Markdown 代码围栏。",
    "JSON shape: {\"title\":\"\",\"summary\":\"\",\"blocks\":[{\"heading\":\"\",\"body\":\"\",\"evidence\":\"based_on_text|inferred|uncertain\",\"refs\":[\"\"]}],\"cards\":[],\"questions\":[],\"interviewQuestions\":[],\"notesMarkdown\":\"\",\"uncertainty\":[]}.",
    `输出语言：${language}。`,
    levelGuide,
    taskGuide
  ].join("\n");

  const sectionContext = input.sectionSummaries
    .map((section) => `- ${section.id} ${section.title} (${section.role}): ${section.summary}`)
    .join("\n");

  const user = [
    `论文标题：${input.paperMeta.title}`,
    input.paperMeta.authors.length ? `作者：${input.paperMeta.authors.join(", ")}` : "",
    sectionContext ? `章节摘要：\n${sectionContext}` : "",
    input.selectedText ? `选中文本：\n${input.selectedText}` : "",
    input.surroundingContext ? `相关上下文（带引用 ID）：\n${input.surroundingContext}` : "",
    input.userQuestion ? `用户问题：${input.userQuestion}` : "",
    "请基于以上论文文本完成任务。若证据不足，把 evidence 设为 uncertain，并在 uncertainty 中说明缺口。"
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, user };
}

export function extractJson(text: unknown) {
  if (typeof text !== "string") return text;
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const objectMatch = candidate.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {
        return candidate;
      }
    }
    return candidate;
  }
}

export function normalizeCoachOutput(value: unknown, task: CoachTask): CoachOutput {
  if (typeof value === "string") {
    return {
      title: fallbackTitle(task),
      summary: value,
      blocks: [
        {
          heading: "模型回答",
          body: value,
          evidence: "uncertain",
          refs: []
        }
      ],
      cards: [],
      questions: [],
      interviewQuestions: [],
      notesMarkdown: "",
      uncertainty: ["模型没有返回结构化 JSON，已作为纯文本展示。"]
    };
  }

  const result = CoachOutputSchema.safeParse(value);
  if (result.success) return result.data;

  const record = isRecord(value) ? value : {};
  return {
    title: stringField(record, "title") || fallbackTitle(task),
    summary: stringField(record, "summary") || "模型返回内容不完整，已做安全兜底。",
    blocks: normalizeBlocks(record.blocks, "要点"),
    cards: normalizeBlocks(record.cards, "概念卡片"),
    questions: normalizeBlocks(record.questions, "理解题"),
    interviewQuestions: normalizeBlocks(record.interviewQuestions, "面试式问题"),
    notesMarkdown: stringField(record, "notesMarkdown"),
    uncertainty: arrayOfStrings(record.uncertainty)
  };
}

function normalizeBlocks(value: unknown, fallbackHeading: string) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (typeof item === "string") {
      return {
        heading: `${fallbackHeading} ${index + 1}`,
        body: item.trim(),
        evidence: "uncertain" as EvidenceKind,
        refs: []
      };
    }

    const record = isRecord(item) ? item : {};
    const evidence = stringField(record, "evidence");
    const normalizedEvidence: EvidenceKind =
      evidence === "based_on_text" || evidence === "inferred" || evidence === "uncertain"
        ? evidence
        : "uncertain";
    return {
      heading:
        stringField(record, "heading") ||
        stringField(record, "title") ||
        stringField(record, "concept") ||
        `${fallbackHeading} ${index + 1}`,
      body: blockBody(record) || "模型没有提供正文，请结合引用段落重新生成或追问。",
      evidence: normalizedEvidence,
      refs: refsFromRecord(record)
    };
  });
}

function blockBody(record: Record<string, unknown>) {
  const direct = stringField(record, "body") || stringField(record, "text") || stringField(record, "content");
  if (direct) return direct;

  const parts = [
    labeledPart("问题", stringField(record, "question")),
    labeledPart("提示", stringField(record, "prompt")),
    labeledPart("答案", stringField(record, "answer")),
    labeledPart("定义", stringField(record, "definition")),
    labeledPart("解释", stringField(record, "explanation")),
    labeledPart("为什么重要", stringField(record, "whyItMatters") || stringField(record, "why_it_matters")),
    labeledPart("易混点", stringField(record, "pitfall") || stringField(record, "gotcha")),
    labeledPart("建议追问", stringField(record, "followUp") || stringField(record, "follow_up"))
  ].filter(Boolean);
  return parts.join("\n");
}

function labeledPart(label: string, value: string) {
  return value ? `${label}：${value}` : "";
}

function refsFromRecord(record: Record<string, unknown>) {
  return arrayOfStrings(record.refs || record.ref || record.citation || record.source);
}

function fallbackTitle(task: CoachTask) {
  return {
    paper_map: "论文地图",
    section_explain: "段落解释",
    qa: "问题回答",
    quiz: "复习包"
  }[task];
}

function stringField(source: unknown, key: string) {
  return isRecord(source) && typeof source[key] === "string" ? source[key].trim() : "";
}

function arrayOfStrings(value: unknown) {
  if (typeof value === "string") {
    const ids = value.match(/S\d+-P\d+/gi);
    if (ids?.length) return ids;
    return value
      .split(/[\s,，、;；·]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
