import { createPlanId, summarizeExecutionState } from "./execution-state.mjs";

const PLAN_HISTORY_STORAGE_KEY = "ai-cooking-plan-history:v1";
const DEFAULT_HISTORY_LIMIT = 12;

export function createPlanHistoryStorageKey() {
  return PLAN_HISTORY_STORAGE_KEY;
}

export function buildPlanHistoryEntry(plan, executionState, savedAt = new Date().toISOString()) {
  const summary = summarizeWeeklyReview(plan, executionState);
  return {
    planId: summary.planId,
    title: summary.title,
    savedAt: String(savedAt),
    dayCount: Array.isArray(plan?.days) ? plan.days.length : 0,
    mealCount: summary.mealsTotal,
    completionRate: summary.completionRate,
    mealsDone: summary.mealsDone,
    mealsTotal: summary.mealsTotal,
    replacementsTotal: summary.replacementsTotal,
    plan,
    executionState
  };
}

export function mergePlanHistory(history, entry, limit = DEFAULT_HISTORY_LIMIT) {
  const entries = Array.isArray(history) ? history.filter(isHistoryEntry) : [];
  const merged = [
    entry,
    ...entries.filter((candidate) => candidate.planId !== entry.planId)
  ];

  return merged
    .sort((left, right) => timestamp(right.savedAt) - timestamp(left.savedAt))
    .slice(0, Math.max(1, Number(limit) || DEFAULT_HISTORY_LIMIT));
}

export function deletePlanHistoryEntry(history, planId) {
  return (Array.isArray(history) ? history : []).filter((entry) => entry?.planId !== planId);
}

export function summarizeWeeklyReview(plan, executionState = {}) {
  const executionSummary = summarizeExecutionState(executionState);
  const mealStatuses = Object.values(executionState.meals || {});
  const mealsCooked = mealStatuses.filter((status) => status === "cooked").length;
  const mealsSkipped = mealStatuses.filter((status) => status === "skipped").length;
  const mealsReplaced = mealStatuses.filter((status) => status === "replaced").length;
  const mealsPending = mealStatuses.filter((status) => status === "pending").length;
  const replacements = Array.isArray(executionState.replacements) ? executionState.replacements : [];

  return {
    planId: String(executionState.planId || createPlanId(plan || {})),
    title: String(plan?.title || "AI Cooking Coach 周计划"),
    summary: String(plan?.summary || ""),
    shoppingDone: executionSummary.shoppingDone,
    shoppingTotal: executionSummary.shoppingTotal,
    prepDone: executionSummary.prepDone,
    prepTotal: executionSummary.prepTotal,
    mealsDone: executionSummary.mealsDone,
    mealsTotal: executionSummary.mealsTotal,
    mealsCooked,
    mealsSkipped,
    mealsReplaced,
    mealsPending,
    replacementsTotal: replacements.length,
    completionRate: percent(executionSummary.totalDone, executionSummary.totalCount),
    mealCompletionRate: percent(executionSummary.mealsDone, executionSummary.mealsTotal),
    shoppingCompletionRate: percent(executionSummary.shoppingDone, executionSummary.shoppingTotal),
    prepCompletionRate: percent(executionSummary.prepDone, executionSummary.prepTotal),
    replacementNames: replacements.map((record) =>
      `${record.originalName || "原餐"} -> ${record.replacementName || record.replacement?.name || "替代餐"}`
    )
  };
}

export function buildWeeklyReviewMarkdown(plan, executionState, feedback = "", suggestion = {}) {
  const summary = summarizeWeeklyReview(plan, executionState);
  const lines = [
    `# ${summary.title} 周复盘`,
    "",
    `- 完成率：${summary.completionRate}%`,
    `- 采购：${summary.shoppingDone}/${summary.shoppingTotal}`,
    `- 备餐：${summary.prepDone}/${summary.prepTotal}`,
    `- 餐食：${summary.mealsDone}/${summary.mealsTotal}`,
    `- 完成：${summary.mealsCooked}`,
    `- 跳过：${summary.mealsSkipped}`,
    `- 替换：${summary.replacementsTotal}`,
    "",
    "## 替换记录",
    ...(summary.replacementNames.length ? summary.replacementNames.map((name) => `- ${name}`) : ["- 无"]),
    "",
    "## 主观反馈",
    cleanText(feedback, "未填写"),
    "",
    "## AI/本地建议",
    cleanText(suggestion.summary, "暂无建议"),
    "",
    "### 做得好的地方",
    ...markdownList(suggestion.wins),
    "",
    "### 卡点",
    ...markdownList(suggestion.frictions),
    "",
    "### 下周调整",
    ...markdownList(suggestion.nextWeekAdjustments),
    "",
    "### 下周 Prompt 提示",
    ...markdownList(suggestion.promptHints)
  ];

  return `${lines.join("\n")}\n`;
}

function markdownList(values) {
  return Array.isArray(values) && values.length ? values.map((value) => `- ${value}`) : ["- 无"];
}

function cleanText(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function percent(done, total) {
  if (!total) return 0;
  return Math.round((Number(done) / Number(total)) * 100);
}

function timestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isHistoryEntry(entry) {
  return entry && typeof entry === "object" && entry.planId && entry.plan && entry.executionState;
}
