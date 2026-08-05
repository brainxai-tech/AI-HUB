const LEVELS = new Set(["beginner", "graduate", "reviewer"]);
const LANGUAGES = new Set(["zh-CN", "en"]);
const TASKS = new Set(["section_explain", "qa", "quiz"]);

export const adapter = {
  async start({ input, client }) {
    const source = validateSource(input?.source);
    const userLevel = LEVELS.has(input?.userLevel) ? input.userLevel : "beginner";
    const outputLanguage = LANGUAGES.has(input?.outputLanguage) ? input.outputLanguage : "zh-CN";
    const parsed = source.kind === "url"
      ? await client.requestJson("paper", "/api/import-link", { method: "POST", body: { url: source.value } })
      : await client.requestJson("paper", "/api/parse-text", {
          method: "POST",
          body: { text: source.value, sourceName: input?.sourceName || "workflow-pasted-text" },
        });
    const paper = parsed?.paper;
    if (!paper?.meta || !Array.isArray(paper.sections)) throw validationError("论文解析结果不完整。");
    const model = await client.resolveModel("paper", input?.model);
    const initialHits = selectParagraphs(paper, paper.meta.title || paper.rawText.slice(0, 500), 12, "", true);
    const rawPaperMap = await client.requestJson("paper", "/api/generate", {
      method: "POST",
      body: buildCoachRequest({
        task: "paper_map",
        paper,
        model,
        userLevel,
        outputLanguage,
        hits: initialHits,
      }),
    });
    const paperMap = enforceEvidenceBoundary(rawPaperMap, initialHits);
    return {
      status: "waiting",
      step: "evidence-session",
      checkpoint: {
        id: "paper-task",
        title: "继续证据阅读",
        instructions: "选择章节解释、证据问答或复习测验；完成后显式提交 finish=true。",
        requiredFields: ["task|finish"],
        tasks: [...TASKS],
        sections: paper.sections.map(({ id, title, role, summary }) => ({ id, title, role, summary })),
      },
      context: {
        source: { kind: source.kind, label: source.kind === "url" ? source.value : input?.sourceName || "pasted-text" },
        paper,
        model,
        userLevel,
        outputLanguage,
        paperMap,
        paperMapCitations: initialHits.map(toCitation),
        sessions: [],
      },
    };
  },

  async resume({ run, input, checkpointId, client, now }) {
    if (checkpointId !== "paper-task") throw validationError("未知的论文阅读检查点。");
    if (input?.finish === true) {
      return {
        status: "completed",
        step: "complete",
        context: run.context,
        result: {
          paperMeta: run.context.paper.meta,
          paperMap: run.context.paperMap,
          paperMapCitations: run.context.paperMapCitations,
          sessions: run.context.sessions,
        },
      };
    }
    if (!TASKS.has(input?.task)) throw validationError("论文任务必须是 section_explain、qa 或 quiz。");
    const question = optionalText(input?.question, 2000);
    if (input.task === "qa" && !question) throw validationError("问答任务需要 question。");
    const sectionId = optionalText(input?.sectionId, 160);
    if (sectionId && !run.context.paper.sections.some((section) => section.id === sectionId)) {
      throw validationError("选择的论文章节不存在。");
    }
    const hits = selectParagraphs(
      run.context.paper,
      [question, input?.sectionId, input?.focus].filter(Boolean).join(" "),
      8,
      sectionId,
      input.task !== "qa",
    );
    const rawResponse = await client.requestJson("paper", "/api/generate", {
      method: "POST",
      body: buildCoachRequest({
        task: input.task,
        paper: run.context.paper,
        model: run.context.model,
        userLevel: run.context.userLevel,
        outputLanguage: run.context.outputLanguage,
        hits,
        question,
      }),
    });
    const response = enforceEvidenceBoundary(rawResponse, hits);
    const session = {
      id: `session-${run.context.sessions.length + 1}`,
      at: now(),
      task: input.task,
      question,
      sectionId: optionalText(input?.sectionId, 160),
      citations: hits.map(toCitation),
      response,
    };
    const context = { ...run.context, sessions: [...run.context.sessions, session] };
    return {
      status: "waiting",
      step: "evidence-session",
      checkpoint: run.checkpoint,
      context,
      result: {
        paperMeta: context.paper.meta,
        paperMap: context.paperMap,
        latestSession: session,
        sessionCount: context.sessions.length,
      },
    };
  },
};

function buildCoachRequest({ task, paper, model, userLevel, outputLanguage, hits, question = "" }) {
  const selectedText = hits.map((paragraph) => `[${paragraph.citation}] ${paragraph.text}`).join("\n\n").slice(0, 20_000);
  const surroundingContext = hits
    .map((paragraph) => `${paragraph.sectionTitle}｜${paragraph.citation}\n${paragraph.text}`)
    .join("\n\n")
    .slice(0, 40_000);
  return {
    provider: "openai",
    model,
    task,
    input: {
      paperMeta: paper.meta,
      sectionSummaries: paper.sections.map(({ id, title, role, summary }) => ({ id, title, role, summary })),
      selectedText,
      surroundingContext,
      ...(question ? { userQuestion: question } : {}),
      userLevel,
      outputLanguage,
    },
  };
}

function selectParagraphs(paper, query, limit, sectionId = "", allowUnmatched = false) {
  const paragraphs = paper.sections.flatMap((section) => section.paragraphs || []);
  const scoped = sectionId ? paragraphs.filter((item) => item.sectionId === sectionId) : paragraphs;
  const queryTokens = tokens(query);
  const scored = scoped
    .map((paragraph) => ({
      paragraph,
      score: overlapScore(queryTokens, tokens(`${paragraph.sectionTitle} ${paragraph.summary} ${paragraph.text}`)),
    }))
    .sort((a, b) => b.score - a.score || a.paragraph.index - b.paragraph.index);
  const relevant = queryTokens.size ? scored.filter(({ score }) => score > 0) : scored;
  return (relevant.length || !allowUnmatched ? relevant : scored)
    .slice(0, limit)
    .map(({ paragraph }) => paragraph);
}

function enforceEvidenceBoundary(response, hits) {
  if (!response || typeof response !== "object") return response;
  const allowed = new Set(hits.flatMap((paragraph) => [paragraph.id, paragraph.citation]).filter(Boolean));
  const next = structuredClone(response);
  const data = next.data;
  if (!data || typeof data !== "object") return next;
  let removedRefs = 0;
  for (const key of ["blocks", "cards", "questions", "interviewQuestions"]) {
    if (!Array.isArray(data[key])) continue;
    for (const item of data[key]) {
      if (!item || typeof item !== "object") continue;
      const refs = Array.isArray(item.refs) ? item.refs.filter((ref) => typeof ref === "string") : [];
      const safeRefs = refs.filter((ref) => allowed.has(ref));
      removedRefs += refs.length - safeRefs.length;
      item.refs = safeRefs;
      if (item.evidence === "based_on_text" && !safeRefs.length) item.evidence = "uncertain";
    }
  }
  if (!allowed.size || removedRefs) {
    const uncertainty = Array.isArray(data.uncertainty) ? data.uncertainty : [];
    const message = !allowed.size
      ? "本次检索没有找到相关论文段落，回答不得声称由论文证据支持。"
      : "模型返回的越界引用已移除，请只使用本次检索命中的段落。";
    data.uncertainty = [...new Set([...uncertainty, message])];
  }
  return next;
}

function tokens(value) {
  const normalized = String(value || "").toLowerCase();
  const words = normalized.match(/[a-z0-9]{2,}|[\p{Script=Han}]/gu) || [];
  const han = (normalized.match(/[\p{Script=Han}]+/gu) || []).flatMap((text) =>
    Array.from({ length: Math.max(0, text.length - 1) }, (_, index) => text.slice(index, index + 2))
  );
  return new Set([...words, ...han]);
}

function overlapScore(query, document) {
  if (!query.size) return 1;
  let score = 0;
  for (const token of query) if (document.has(token)) score += token.length > 1 ? 3 : 1;
  return score;
}

function toCitation(paragraph) {
  return {
    paragraphId: paragraph.id,
    sectionId: paragraph.sectionId,
    sectionTitle: paragraph.sectionTitle,
    citation: paragraph.citation,
    summary: paragraph.summary,
  };
}

function validateSource(value) {
  if (!value || typeof value !== "object") throw validationError("缺少论文 source。");
  const kind = value.kind;
  const text = optionalText(value.value, kind === "text" ? 2_000_000 : 2000);
  if (!new Set(["text", "url"]).has(kind) || !text) throw validationError("论文 source 必须提供 text 或 url。");
  if (kind === "text" && text.length < 80) throw validationError("论文文本过短。");
  return { kind, value: text };
}

function optionalText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validationError(message) {
  const error = new Error(message);
  error.code = "VALIDATION_ERROR";
  error.status = 422;
  return error;
}
