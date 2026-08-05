export const adapter = {
  async prepare({ type, input, actionId }) {
    if (type === "start") return { profile: normalizeProfile(input?.profile) };
    if (type === "resume") {
      return {
        executionState: normalizeExecutionState(input?.executionState),
        feedback: optionalText(input?.feedback, 4000),
      };
    }
    if (type === "action" && actionId === "adjust-meal") {
      return {
        mealKey: requiredText(input?.mealKey, "mealKey", 160),
        reason: requiredText(input?.reason, "换餐原因", 1000),
        constraints: normalizeConstraints(input?.constraints),
      };
    }
    return {};
  },

  async start({ input, client }) {
    const profile = normalizeProfile(input?.profile);
    const planResponse = await client.requestJson("cooking", "/api/plan", {
      method: "POST",
      body: { profile },
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
        profile,
        planResponse,
        adjustments: [],
        ragCitations: collectRagCitations(planResponse.plan),
      },
    };
  },

  async resume({ run, input, checkpointId, client }) {
    if (checkpointId !== "weekly-execution") throw validationError("未知的备餐工作流检查点。");
    const executionState = normalizeExecutionState(input?.executionState);
    const feedback = optionalText(input?.feedback, 4000);
    const reviewResponse = await client.requestJson("cooking", "/api/review-week", {
      method: "POST",
      body: {
        plan: run.context.planResponse.plan,
        executionState,
        feedback,
      },
    });
    const context = {
      ...run.context,
      executionState,
      feedback,
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
        constraints: normalizeConstraints(input?.constraints),
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

const PROFILE_TEXT_LIMITS = {
  goal: 500,
  cuisine: 300,
  allergies: 500,
  dislikes: 500,
  budget: 300,
  prepTime: 300,
  equipment: 300,
  pantry: 2000,
};
const MEAL_STATUSES = new Set(["pending", "cooked", "skipped", "replaced"]);

function normalizeProfile(value) {
  if (!isRecord(value)) throw validationError("缺少备餐 profile。");
  const profile = {
    days: requiredInteger(value.days, "days", 1, 14),
    familySize: requiredInteger(value.familySize, "familySize", 1, 8),
  };
  if (value.targetCalories !== undefined && value.targetCalories !== "") {
    profile.targetCalories = requiredInteger(value.targetCalories, "targetCalories", 1000, 3200);
  }
  for (const [field, [minimum, maximum]] of Object.entries({ heightCm: [120, 230], weightKg: [35, 220] })) {
    if (value[field] !== undefined && value[field] !== "") {
      profile[field] = requiredNumber(value[field], field, minimum, maximum);
    }
  }
  for (const [field, maxLength] of Object.entries(PROFILE_TEXT_LIMITS)) {
    const source = field === "pantry" ? value.pantry ?? value.availableIngredients : value[field];
    const normalized = listOrText(source, maxLength);
    if (normalized) profile[field] = normalized;
  }
  return profile;
}

function normalizeExecutionState(value) {
  if (!isRecord(value)) throw validationError("缺少 executionState。");
  const state = {};
  const planId = optionalText(value.planId, 160);
  if (planId) state.planId = planId;
  if (value.selectedDayIndex !== undefined) {
    state.selectedDayIndex = requiredInteger(value.selectedDayIndex, "selectedDayIndex", 0, 13);
  }
  if (value.shopping !== undefined) {
    if (!Array.isArray(value.shopping) || value.shopping.length > 50) {
      throw validationError("shopping 必须是最多 50 组的布尔数组。");
    }
    state.shopping = value.shopping.map((group) => {
      if (!Array.isArray(group) || group.length > 100) {
        throw validationError("每个 shopping 分组最多包含 100 项。");
      }
      return group.map(Boolean);
    });
  }
  if (value.prep !== undefined) {
    if (!Array.isArray(value.prep) || value.prep.length > 200) {
      throw validationError("prep 必须是最多 200 项的布尔数组。");
    }
    state.prep = value.prep.map(Boolean);
  }
  if (value.meals !== undefined) {
    if (!isRecord(value.meals) || Object.keys(value.meals).length > 100) {
      throw validationError("meals 必须是最多 100 项的状态对象。");
    }
    state.meals = Object.fromEntries(Object.entries(value.meals).map(([mealKey, status]) => {
      if (!/^day\d{1,2}-meal\d{1,2}$/.test(mealKey) || !MEAL_STATUSES.has(status)) {
        throw validationError("meals 包含无效的餐次标识或状态。");
      }
      return [mealKey, status];
    }));
  }
  if (value.replacements !== undefined) {
    if (!Array.isArray(value.replacements) || value.replacements.length > 100) {
      throw validationError("replacements 必须是最多 100 项的数组。");
    }
    state.replacements = value.replacements.map(normalizeReplacement);
  }
  return state;
}

function normalizeReplacement(value) {
  if (!isRecord(value)) throw validationError("replacement 必须是对象。");
  const mealKey = requiredText(value.mealKey, "replacement.mealKey", 40);
  if (!/^day\d{1,2}-meal\d{1,2}$/.test(mealKey)) {
    throw validationError("replacement.mealKey 无效。");
  }
  const replacementName = optionalText(value.replacementName ?? value.replacement?.name, 200);
  return {
    mealKey,
    reason: optionalText(value.reason, 1000),
    originalName: optionalText(value.originalName, 200),
    replacementName,
    nutritionDelta: optionalText(value.nutritionDelta ?? value.replacement?.nutritionDelta, 1000),
    createdAt: optionalText(value.createdAt, 64),
  };
}

function normalizeConstraints(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return optionalText(value, 2000);
  if (!isRecord(value) && !Array.isArray(value)) throw validationError("constraints 必须是文本或 JSON。");
  const serialized = JSON.stringify(value);
  if (!serialized || serialized.length > 2000) throw validationError("constraints 最多 2000 个字符。");
  return serialized;
}

function listOrText(value, maxLength) {
  if (Array.isArray(value)) {
    if (value.length > 50) throw validationError("列表字段最多包含 50 项。");
    return value.map((item) => optionalText(item, 100)).filter(Boolean).join(", ").slice(0, maxLength);
  }
  return optionalText(value, maxLength);
}

function requiredInteger(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw validationError(`${label} 必须是 ${minimum} 到 ${maximum} 之间的整数。`);
  }
  return number;
}

function requiredNumber(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw validationError(`${label} 必须是 ${minimum} 到 ${maximum} 之间的数字。`);
  }
  return number;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectRagCitations(value) {
  const citations = [];
  const seen = new Set();
  for (const match of value?.recipeRag?.matches || []) {
    addCitation({
      sourceId: match.sourceId || "",
      name: match.name || "",
      category: match.category || "",
      technique: match.technique || "",
      source: match.source || "menu-library-rag",
    });
  }
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
      addCitation(citation);
    }
    Object.values(node).forEach(visit);
  }

  function addCitation(citation) {
    const key = JSON.stringify(citation);
    if (seen.has(key)) return;
    seen.add(key);
    citations.push(citation);
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
