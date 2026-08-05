import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPlanHistoryEntry,
  buildWeeklyReviewMarkdown,
  createPlanHistoryStorageKey,
  deletePlanHistoryEntry,
  mergePlanHistory,
  summarizeWeeklyReview
} from "../public/weekly-memory.mjs";

const plan = {
  title: "家庭轻食一周计划",
  summary: "高蛋白、低油、适合周日备餐。",
  days: [
    {
      day: "Day 1",
      meals: [
        { slot: "早餐", name: "鸡蛋燕麦碗", calories: 360, protein: 24 },
        { slot: "午餐", name: "鸡胸肉糙米饭", calories: 520, protein: 42 }
      ]
    },
    {
      day: "Day 2",
      meals: [{ slot: "晚餐", name: "豆腐蔬菜汤", calories: 410, protein: 28 }]
    }
  ],
  shoppingList: [
    { category: "蛋白质", items: [{ name: "鸡胸肉" }, { name: "鸡蛋" }] }
  ],
  batchPrep: [
    { time: "周日", task: "腌制鸡胸肉" },
    { time: "周日", task: "焯蔬菜" }
  ]
};

const executionState = {
  planId: "abc123",
  shopping: [[true, false]],
  prep: [true, false],
  meals: {
    "day0-meal0": "cooked",
    "day0-meal1": "skipped",
    "day1-meal0": "replaced"
  },
  replacements: [
    {
      mealKey: "day1-meal0",
      reason: "缺少豆腐",
      originalName: "豆腐蔬菜汤",
      replacementName: "鸡蛋蔬菜汤",
      nutritionDelta: "蛋白 +6g",
      createdAt: "2026-06-05T08:00:00.000Z"
    }
  ]
};

test("buildPlanHistoryEntry snapshots plan execution progress", () => {
  const entry = buildPlanHistoryEntry(plan, executionState, "2026-06-05T09:00:00.000Z");

  assert.equal(entry.planId, "abc123");
  assert.equal(entry.title, "家庭轻食一周计划");
  assert.equal(entry.savedAt, "2026-06-05T09:00:00.000Z");
  assert.equal(entry.dayCount, 2);
  assert.equal(entry.mealCount, 3);
  assert.equal(entry.mealsDone, 3);
  assert.equal(entry.mealsTotal, 3);
  assert.equal(entry.replacementsTotal, 1);
  assert.equal(entry.completionRate, 71);
  assert.deepEqual(entry.plan, plan);
  assert.deepEqual(entry.executionState, executionState);
});

test("mergePlanHistory updates matching plans and keeps newest first", () => {
  const first = buildPlanHistoryEntry({ ...plan, title: "旧计划" }, { ...executionState, planId: "old" }, "2026-06-04T08:00:00.000Z");
  const updated = buildPlanHistoryEntry(plan, executionState, "2026-06-05T09:00:00.000Z");
  const duplicate = buildPlanHistoryEntry({ ...plan, title: "更新计划" }, executionState, "2026-06-05T10:00:00.000Z");

  const history = mergePlanHistory([first, updated], duplicate, 2);

  assert.equal(history.length, 2);
  assert.equal(history[0].title, "更新计划");
  assert.equal(history[0].savedAt, "2026-06-05T10:00:00.000Z");
  assert.equal(history[1].planId, "old");
});

test("deletePlanHistoryEntry removes only the requested plan", () => {
  const history = [
    buildPlanHistoryEntry(plan, executionState),
    buildPlanHistoryEntry({ ...plan, title: "另一个计划" }, { ...executionState, planId: "other" })
  ];

  assert.deepEqual(deletePlanHistoryEntry(history, "abc123").map((entry) => entry.planId), ["other"]);
});

test("summarizeWeeklyReview counts cooked skipped replaced and pending work", () => {
  const summary = summarizeWeeklyReview(plan, executionState);

  assert.equal(summary.planId, "abc123");
  assert.equal(summary.title, "家庭轻食一周计划");
  assert.equal(summary.mealsCooked, 1);
  assert.equal(summary.mealsSkipped, 1);
  assert.equal(summary.mealsReplaced, 1);
  assert.equal(summary.mealsPending, 0);
  assert.equal(summary.shoppingDone, 1);
  assert.equal(summary.shoppingTotal, 2);
  assert.equal(summary.prepDone, 1);
  assert.equal(summary.prepTotal, 2);
  assert.equal(summary.completionRate, 71);
  assert.deepEqual(summary.replacementNames, ["豆腐蔬菜汤 -> 鸡蛋蔬菜汤"]);
});

test("buildWeeklyReviewMarkdown exports feedback and AI suggestions", () => {
  const markdown = buildWeeklyReviewMarkdown(plan, executionState, "午餐有点重复。", {
    summary: "整体完成度不错。",
    wins: ["蛋白质执行稳定"],
    frictions: ["午餐重复"],
    nextWeekAdjustments: ["减少重复鸡胸肉饭"],
    promptHints: ["下周增加鱼虾"]
  });

  assert.match(markdown, /# 家庭轻食一周计划 周复盘/);
  assert.match(markdown, /完成率：71%/);
  assert.match(markdown, /替换：1/);
  assert.match(markdown, /午餐有点重复。/);
  assert.match(markdown, /减少重复鸡胸肉饭/);
  assert.match(markdown, /下周增加鱼虾/);
});

test("createPlanHistoryStorageKey is stable", () => {
  assert.equal(createPlanHistoryStorageKey(), "ai-cooking-plan-history:v1");
});
