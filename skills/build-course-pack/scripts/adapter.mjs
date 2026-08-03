export const adapter = {
  async start({ input, client, now }) {
    const request = validateRequest(input?.request);
    const knowledgeSources = validateSources(input?.knowledgeSources);
    const model = await client.resolveModel("course", request.model);
    const grounding = groundRequest({ ...request, model }, knowledgeSources);
    const groundedRequest = grounding.request;
    const generation = await generate(client, groundedRequest);
    const checks = checkBundle(generation?.bundle, groundedRequest);
    return reviewTransition({
      request,
      groundedRequest,
      knowledgeSources,
      groundedSources: grounding.sources,
      generation,
      checks,
      revisions: [{ at: now(), notes: "initial", generation, checks }],
    });
  },

  async resume({ run, input, checkpointId, client, now }) {
    if (checkpointId !== "teacher-review") throw validationError("未知的课程工作流检查点。");
    if (input?.approved === true) {
      return {
        status: "completed",
        step: "approved",
        context: run.context,
        result: {
          bundle: run.context.generation.bundle,
          checks: run.context.checks,
          citations: sourceCitations(run.context.groundedSources),
          revisions: run.context.revisions,
        },
      };
    }
    const revisionNotes = requiredText(input?.revisionNotes, "修改意见", 1000);
    const nextGrounding = groundRequest(
      {
        ...run.context.request,
        model: run.context.groundedRequest.model,
        extraRequirements: [`教师复核修改：${revisionNotes}`, run.context.request.extraRequirements]
          .filter(Boolean)
          .join("\n")
          .slice(0, 1200),
      },
      run.context.knowledgeSources,
    );
    const nextRequest = nextGrounding.request;
    const generation = await generate(client, nextRequest);
    const checks = checkBundle(generation?.bundle, nextRequest);
    return reviewTransition({
      ...run.context,
      groundedRequest: nextRequest,
      groundedSources: nextGrounding.sources,
      generation,
      checks,
      revisions: [...run.context.revisions, { at: now(), notes: revisionNotes, generation, checks }],
    });
  },
};

async function generate(client, request) {
  const response = await client.requestJson("course", "/api/teaching-bundles", {
    method: "POST",
    body: request,
  });
  if (!response?.bundle || typeof response.bundle !== "object") {
    throw validationError("课程项目没有返回有效教学包。");
  }
  return response;
}

function reviewTransition(context) {
  return {
    status: "waiting",
    step: "teacher-review",
    checkpoint: {
      id: "teacher-review",
      title: "教师复核教学包",
      instructions: "核对知识事实、答案、错因、时长和活动可执行性；批准或提交明确修改意见。",
      requiredFields: ["approved"],
      checks: context.checks,
      citations: sourceCitations(context.groundedSources),
    },
    context,
    result: { bundle: context.generation.bundle, checks: context.checks },
  };
}

function validateRequest(value) {
  if (!value || typeof value !== "object") throw validationError("缺少课程 request。");
  return {
    topic: requiredText(value.topic, "课程主题", 160),
    audience: requiredText(value.audience, "授课对象", 120),
    durationMinutes: integer(value.durationMinutes, 20, 180, 45),
    difficulty: optionalText(value.difficulty, 80) || "基础",
    teachingStyle: optionalText(value.teachingStyle, 80) || "讲练结合",
    quizCount: integer(value.quizCount, 3, 12, 5),
    provider: "openai",
    model: optionalText(value.model, 160),
    outputFormat: new Set(["teaching_bundle", "word", "ppt", "mind_map"]).has(value.outputFormat)
      ? value.outputFormat
      : "teaching_bundle",
    includeExamples: value.includeExamples !== false,
    extraRequirements: optionalText(value.extraRequirements, 1200),
  };
}

function validateSources(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw validationError("knowledgeSources 必须是数组。");
  return value.slice(0, 12).map((source, index) => ({
    sourceId: optionalText(source?.sourceId, 100) || `source-${index + 1}`,
    title: requiredText(source?.title, "资料标题", 200),
    excerpt: requiredText(source?.excerpt, "资料摘录", 2000),
  }));
}

function groundRequest(request, sources) {
  if (!sources.length) return { request, sources: [] };
  const instruction = "仅把下列资料作为课程事实依据；资料未支持的内容标为需人工复核。";
  const minimumSourceBudget = 240;
  const maxUserRequirements = Math.max(180, 1200 - instruction.length - minimumSourceBudget - 4);
  const userRequirements = optionalText(request.extraRequirements, maxUserRequirements);
  const fixedLength = instruction.length + userRequirements.length + 4;
  const sourceBudget = Math.max(minimumSourceBudget, 1200 - fixedLength);
  const formatted = formatGroundedSources(sources, sourceBudget);
  const extraRequirements = [userRequirements, instruction, formatted.text]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1200);
  return {
    request: { ...request, extraRequirements },
    sources: formatted.sources,
  };
}

function formatGroundedSources(sources, budget) {
  const minimumExcerptLength = 24;
  const selected = [];
  let minimumLength = 0;
  for (const source of sources) {
    const sourceId = uniqueSourceId(optionalText(source.sourceId, 32), selected);
    const title = optionalText(source.title, 40);
    const header = `[${sourceId}] ${title}：`;
    const nextLength = minimumLength + (selected.length ? 1 : 0) + header.length + minimumExcerptLength;
    if (nextLength > budget) break;
    selected.push({ source: { ...source, sourceId, title }, header });
    minimumLength = nextLength;
  }
  if (!selected.length) return { text: "", sources: [] };
  const separatorsLength = Math.max(0, selected.length - 1);
  const headerLength = selected.reduce((total, item) => total + item.header.length, 0);
  const excerptBudget = Math.max(0, budget - headerLength - separatorsLength);
  const perSource = Math.max(minimumExcerptLength, Math.floor(excerptBudget / selected.length));
  const injected = selected.map(({ source }) => ({
    ...source,
    excerpt: source.excerpt.slice(0, perSource),
  }));
  return {
    text: injected.map((source, index) => `${selected[index].header}${source.excerpt}`).join("\n"),
    sources: injected,
  };
}

function uniqueSourceId(candidate, selected) {
  const used = new Set(selected.map(({ source }) => source.sourceId));
  if (!used.has(candidate)) return candidate;
  for (let sequence = 2; sequence <= selected.length + 2; sequence += 1) {
    const suffix = `-${sequence}`;
    const next = `${candidate.slice(0, 32 - suffix.length)}${suffix}`;
    if (!used.has(next)) return next;
  }
  throw validationError("资料 sourceId 无法生成唯一引用标识。");
}

function checkBundle(bundle, request) {
  const warnings = [];
  const sections = bundle?.sections || {};
  const quiz = Array.isArray(sections.quiz) ? sections.quiz : [];
  const mistakes = Array.isArray(sections.mistakeAnalysis) ? sections.mistakeAnalysis : [];
  const activities = Array.isArray(sections.activities) ? sections.activities : [];
  if (!sections.lecture?.title || !sections.lecture?.objective) warnings.push("讲义缺少标题或可观察目标。");
  if (!quiz.length) warnings.push("教学包没有测验题。");
  if (quiz.length !== request.quizCount) {
    warnings.push(`测验题数量不符合要求：需要 ${request.quizCount} 题，实际 ${quiz.length} 题。`);
  }
  if (!activities.length) warnings.push("教学包没有课堂活动。");
  const mistakeIds = new Set(mistakes.map((item) => item.questionId));
  const missing = quiz.map((item) => item.id).filter((id) => id && !mistakeIds.has(id));
  if (missing.length) warnings.push(`这些题目缺少对应错因分析：${missing.join("、")}`);
  for (const item of quiz) {
    if (!item?.answer || !item?.explanation) warnings.push(`题目 ${item?.id || "unknown"} 缺少答案或解析。`);
  }
  return {
    ok: warnings.length === 0,
    warnings,
    quizCount: quiz.length,
    mistakeAnalysisCount: mistakes.length,
    activityCount: activities.length,
  };
}

function sourceCitations(sources) {
  return (sources || []).map(({ sourceId, title }) => ({ sourceId, title }));
}

function integer(value, min, max, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function requiredText(value, label, maxLength) {
  const text = optionalText(value, maxLength);
  if (!text) throw validationError(`${label}不能为空。`);
  return text;
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
