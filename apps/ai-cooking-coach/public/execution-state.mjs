const MEAL_STATUSES = new Set(["pending", "cooked", "skipped", "replaced"]);

export function buildExecutionState(plan) {
  return {
    planId: createPlanId(plan),
    selectedDayIndex: 0,
    shopping: (plan.shoppingList || []).map((group) => (group.items || []).map(() => false)),
    prep: (plan.batchPrep || []).map(() => false),
    meals: buildMealStatusMap(plan),
    replacements: []
  };
}

export function mergeExecutionState(plan, savedState) {
  const fresh = buildExecutionState(plan);
  const savedShopping = Array.isArray(savedState?.shopping) ? savedState.shopping : [];
  const savedPrep = Array.isArray(savedState?.prep) ? savedState.prep : [];
  const savedMeals = savedState?.meals && typeof savedState.meals === "object" ? savedState.meals : {};
  const mealKeys = new Set(Object.keys(fresh.meals));

  return {
    planId: fresh.planId,
    selectedDayIndex: clampDayIndex(plan, savedState?.selectedDayIndex ?? fresh.selectedDayIndex),
    shopping: fresh.shopping.map((group, groupIndex) =>
      group.map((_, itemIndex) => Boolean(savedShopping[groupIndex]?.[itemIndex]))
    ),
    prep: fresh.prep.map((_, taskIndex) => Boolean(savedPrep[taskIndex])),
    meals: Object.fromEntries(
      Object.keys(fresh.meals).map((mealKey) => [
        mealKey,
        MEAL_STATUSES.has(savedMeals[mealKey]) ? savedMeals[mealKey] : "pending"
      ])
    ),
    replacements: Array.isArray(savedState?.replacements)
      ? savedState.replacements.filter((record) => mealKeys.has(record?.mealKey)).map(normalizeReplacementRecord)
      : []
  };
}

export function updateShoppingItem(state, groupIndex, itemIndex, checked) {
  return {
    ...state,
    shopping: state.shopping.map((group, currentGroupIndex) =>
      currentGroupIndex === groupIndex
        ? group.map((value, currentItemIndex) => (currentItemIndex === itemIndex ? Boolean(checked) : value))
        : [...group]
    ),
    prep: [...state.prep]
  };
}

export function updatePrepTask(state, taskIndex, checked) {
  return {
    ...state,
    shopping: state.shopping.map((group) => [...group]),
    prep: state.prep.map((value, currentTaskIndex) => (currentTaskIndex === taskIndex ? Boolean(checked) : value))
  };
}

export function updateSelectedDay(plan, state, selectedDayIndex) {
  return {
    ...state,
    selectedDayIndex: clampDayIndex(plan, selectedDayIndex),
    shopping: state.shopping.map((group) => [...group]),
    prep: [...state.prep],
    meals: { ...state.meals },
    replacements: [...(state.replacements || [])]
  };
}

export function updateMealStatus(state, mealKey, status) {
  if (!MEAL_STATUSES.has(status)) {
    throw new Error(`Meal status must be one of: ${Array.from(MEAL_STATUSES).join(", ")}`);
  }
  if (!Object.hasOwn(state.meals || {}, mealKey)) {
    return cloneExecutionState(state);
  }

  return {
    ...state,
    shopping: state.shopping.map((group) => [...group]),
    prep: [...state.prep],
    meals: {
      ...state.meals,
      [mealKey]: status
    },
    replacements: [...(state.replacements || [])]
  };
}

export function addReplacement(state, record) {
  const normalized = normalizeReplacementRecord(record);
  const next = updateMealStatus(state, normalized.mealKey, "replaced");

  return {
    ...next,
    replacements: [...(state.replacements || []), normalized]
  };
}

export function summarizeExecutionState(state) {
  const shoppingValues = (state.shopping || []).flat();
  const prepValues = state.prep || [];
  const mealValues = Object.values(state.meals || {});
  const shoppingDone = shoppingValues.filter(Boolean).length;
  const prepDone = prepValues.filter(Boolean).length;
  const mealsDone = mealValues.filter((status) => status !== "pending").length;

  return {
    shoppingDone,
    shoppingTotal: shoppingValues.length,
    prepDone,
    prepTotal: prepValues.length,
    mealsDone,
    mealsTotal: mealValues.length,
    replacementsTotal: Array.isArray(state.replacements) ? state.replacements.length : 0,
    totalDone: shoppingDone + prepDone + mealsDone,
    totalCount: shoppingValues.length + prepValues.length + mealValues.length
  };
}

export function createExecutionStorageKey(plan) {
  return `ai-cooking-execution:${createPlanId(plan)}`;
}

export function createPlanId(plan) {
  const dayNames = (plan.days || []).map((day) => day.day).join("|");
  const mealNames = (plan.days || [])
    .flatMap((day) => (day.meals || []).map((meal) => `${meal.slot || ""}:${meal.name || ""}`))
    .join("|");
  const shoppingNames = (plan.shoppingList || [])
    .flatMap((group) => (group.items || []).map((item) => `${group.category}:${item.name || item.display || ""}`))
    .join("|");

  return hashString(`${plan.title || ""}|${dayNames}|${mealNames}|${shoppingNames}`);
}

export function createMealKey(dayIndex, mealIndex) {
  return `day${Number(dayIndex) || 0}-meal${Number(mealIndex) || 0}`;
}

function buildMealStatusMap(plan) {
  const entries = [];
  (plan.days || []).forEach((day, dayIndex) => {
    (day.meals || []).forEach((_, mealIndex) => {
      entries.push([createMealKey(dayIndex, mealIndex), "pending"]);
    });
  });
  return Object.fromEntries(entries);
}

function clampDayIndex(plan, value) {
  const max = Math.max(0, (plan.days || []).length - 1);
  const selected = Number.parseInt(value, 10);
  if (!Number.isFinite(selected)) return 0;
  return Math.max(0, Math.min(max, selected));
}

function cloneExecutionState(state) {
  return {
    ...state,
    shopping: (state.shopping || []).map((group) => [...group]),
    prep: [...(state.prep || [])],
    meals: { ...(state.meals || {}) },
    replacements: [...(state.replacements || [])]
  };
}

function normalizeReplacementRecord(record = {}) {
  return {
    mealKey: String(record.mealKey || ""),
    reason: String(record.reason || "临时调整"),
    originalName: String(record.originalName || "原餐食"),
    replacementName: String(record.replacementName || record.replacement?.name || "替代餐"),
    nutritionDelta: String(record.nutritionDelta || record.replacement?.nutritionDelta || "营养变化为估算值"),
    createdAt: String(record.createdAt || new Date().toISOString()),
    replacement: record.replacement && typeof record.replacement === "object" ? record.replacement : undefined
  };
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
