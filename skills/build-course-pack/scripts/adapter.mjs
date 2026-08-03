export const adapter = {
  async start({ input, client, now }) {
    const request = validateRequest(input?.request);
    const knowledgeSources = validateSources(input?.knowledgeSources);
    const model = await client.resolveModel("course", request.model);
    const groundedRequest = groundRequest({ ...request, model }, knowledgeSources);
    const generation = await generate(client, groundedRequest);
    const checks = checkBundle(generation?.bundle);
    return reviewTransition({
      request,
      groundedRequest,
      knowledgeSources,
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
          bundle: run.context.generation,
          checks: run.context.checks,
          citations: sourceCitations(run.context.knowledgeSources),
          revisions: run.context.revisions,
        },
      };
    }
    const revisionNotes = requiredText(input?.revisionNotes, "修改意见", 1000);
    const nextRequest = groundRequest(
      {
        ...run.context.request,
        model: run.context.groundedRequest.model,
        extraRequirements: [run.context.request.extraRequirements, `教师复核修改：${revisionNotes}`]
          .filter(Boolean)
          .join("\n")
          .slice(0, 1200),
      },
      run.context.knowledgeSources,
    );
    const generation = await generate(client, nextRequest);
    const checks = checkBundle(generation?.bundle);
    return reviewTransition({
      ...run.context,
      groundedRequest: nextRequest,
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
      citations: sourceCitations(context.knowledgeSources),
    },
    context,
    result: { bundle: context.generation, checks: context.checks },
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
  if (!sources.length) return request;
  const sourceText = sources
    .map((source) => `[${source.sourceId}] ${source.title}：${source.excerpt}`)
    .join("\n")
    .slice(0, 900);
  return {
    ...request,
    extraRequirements: [
      request.extraRequirements,
      "仅把以下资料作为课程事实依据；无法由资料支持的内容标为需人工复核。",
      sourceText,
    ].filter(Boolean).join("\n").slice(0, 1200),
  };
}

function checkBundle(bundle) {
  const warnings = [];
  const sections = bundle?.sections || {};
  const quiz = Array.isArray(sections.quiz) ? sections.quiz : [];
  const mistakes = Array.isArray(sections.mistakeAnalysis) ? sections.mistakeAnalysis : [];
  const activities = Array.isArray(sections.activities) ? sections.activities : [];
  if (!sections.lecture?.title || !sections.lecture?.objective) warnings.push("讲义缺少标题或可观察目标。");
  if (!quiz.length) warnings.push("教学包没有测验题。");
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
