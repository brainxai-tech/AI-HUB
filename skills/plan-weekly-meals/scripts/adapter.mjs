export const adapter = {
  async start({ input, client }) {
    if (!input?.profile || typeof input.profile !== "object" || Array.isArray(input.profile)) {
      throw validationError("缺少备餐 profile。");
    }
    const planResponse = await client.requestJson("cooking", "/api/plan", {
      method: "POST",
      body: { profile: structuredClone(input.profile) },
    });
    if (!planResponse?.plan || typeof planResponse.plan !== "object") {
      throw validationError("备餐项目没有返回有效计划。");
    }
    return {
      status: "waiting",
      step: "weekly-execution",
      checkpoint: {
        id: "weekly-execution",
        title: "执行并记录本周备餐",
        instructions: "保留原计划，记录采购、预处理、每餐完成情况和真实反馈；需要替换时调用 adjust-meal。",
        requiredFields: ["executionState"],
        actions: ["adjust-meal"],
      },
      context: {
        profile: structuredClone(input.profile),
        planResponse,
        adjustments: [],
        ragCitations: collectRagCitations(planResponse.plan),
      },
    };
  },

  async resume({ run, input, checkpointId, client }) {
    if (checkpointId !== "weekly-execution") throw validationError("未知的备餐工作流检查点。");
    if (!input?.executionState || typeof input.executionState !== "object") {
      throw validationError("缺少 executionState。");
    }
    const reviewResponse = await client.requestJson("cooking", "/api/review-week", {
      method: "POST",
      body: {
        plan: run.context.planResponse.plan,
        executionState: structuredClone(input.executionState),
        feedback: optionalText(input.feedback, 4000),
      },
    });
    const context = {
      ...run.context,
      executionState: structuredClone(input.executionState),
      feedback: optionalText(input.feedback, 4000),
      reviewResponse,
    };
    return {
      status: "completed",
      step: "review",
      context,
      result: {
        plan: context.planResponse,
        adjustments: context.adjustments,
        review: reviewResponse,
        ragCitations: context.ragCitations,
      },
    };
  },

  async action({ run, actionId, input, client, now }) {
    if (actionId !== "adjust-meal") throw validationError("未知的备餐动作。");
    if (run.status !== "waiting" || run.checkpoint?.id !== "weekly-execution") {
      throw validationError("只有在本周执行阶段才能换餐。");
    }
    const mealKey = requiredText(input?.mealKey, "mealKey", 160);
    const reason = requiredText(input?.reason, "换餐原因", 1000);
    const response = await client.requestJson("cooking", "/api/adjust-meal", {
      method: "POST",
      body: {
        plan: run.context.planResponse.plan,
        mealKey,
        reason,
        constraints: optionalText(input?.constraints, 2000),
      },
    });
    const adjustment = { at: now(), mealKey, reason, response };
    const context = {
      ...run.context,
      adjustments: [...(run.context.adjustments || []), adjustment],
    };
    return {
      status: "waiting",
      step: run.step,
      checkpoint: run.checkpoint,
      context,
      actionResult: adjustment,
    };
  },
};

function collectRagCitations(value) {
  const citations = [];
  const seen = new Set();
  visit(value);
  return citations;

  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (node.rag && typeof node.rag === "object") {
      const citation = {
        name: node.rag.name || node.name || "",
        englishName: node.rag.englishName || "",
        source: node.rag.source || node.rag.sourceName || "ingredient-nutrition-rag",
      };
      const key = JSON.stringify(citation);
      if (!seen.has(key)) {
        seen.add(key);
        citations.push(citation);
      }
    }
    Object.values(node).forEach(visit);
  }
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
