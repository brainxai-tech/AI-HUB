import test from "node:test";
import assert from "node:assert/strict";
import {
  addReplacement,
  buildExecutionState,
  createMealKey,
  createPlanId,
  createExecutionStorageKey,
  mergeExecutionState,
  summarizeExecutionState,
  updateMealStatus,
  updatePrepTask,
  updateSelectedDay,
  updateShoppingItem
} from "../public/execution-state.mjs";

const plan = {
  title: "家庭轻食一周计划",
  days: [
    {
      day: "第 1 天",
      meals: [
        { slot: "早餐", name: "鸡蛋燕麦碗" },
        { slot: "午餐", name: "鸡胸肉饭" }
      ]
    },
    {
      day: "第 2 天",
      meals: [{ slot: "晚餐", name: "豆腐蔬菜汤" }]
    }
  ],
  shoppingList: [
    {
      category: "蛋白质",
      items: [
        { name: "鸡胸肉", amount: "600g" },
        { name: "鸡蛋", amount: "10 个" }
      ]
    },
    {
      category: "蔬菜",
      items: [{ name: "西兰花", amount: "500g" }]
    }
  ],
  batchPrep: [
    { time: "周日", task: "腌制鸡胸肉", duration: "15 分钟" },
    { time: "周日", task: "焯西兰花", duration: "10 分钟" }
  ]
};

test("buildExecutionState mirrors shopping groups and prep tasks", () => {
  const state = buildExecutionState(plan);

  assert.match(state.planId, /^[a-z0-9]+$/);
  assert.equal(state.selectedDayIndex, 0);
  assert.deepEqual(state.shopping, [
    [false, false],
    [false]
  ]);
  assert.deepEqual(state.prep, [false, false]);
  assert.deepEqual(state.meals, {
    "day0-meal0": "pending",
    "day0-meal1": "pending",
    "day1-meal0": "pending"
  });
  assert.deepEqual(state.replacements, []);
});

test("updateShoppingItem returns a new state with one checked item", () => {
  const state = buildExecutionState(plan);
  const next = updateShoppingItem(state, 0, 1, true);

  assert.equal(state.shopping[0][1], false);
  assert.equal(next.shopping[0][1], true);
  assert.equal(next.shopping[1][0], false);
});

test("updatePrepTask returns a new state with one checked prep task", () => {
  const state = buildExecutionState(plan);
  const next = updatePrepTask(state, 1, true);

  assert.equal(state.prep[1], false);
  assert.equal(next.prep[1], true);
});

test("mergeExecutionState keeps saved checks that still fit the plan shape", () => {
  const saved = {
    selectedDayIndex: 1,
    shopping: [[true, true, true], [false], [true]],
    prep: [true, true, true],
    meals: {
      "day0-meal0": "cooked",
      "day1-meal0": "skipped",
      "day9-meal9": "replaced"
    },
    replacements: [
      {
        mealKey: "day0-meal0",
        reason: "缺食材",
        originalName: "鸡蛋燕麦碗",
        replacementName: "豆腐燕麦碗",
        nutritionDelta: "蛋白 +4g",
        createdAt: "2026-06-04T08:00:00.000Z"
      }
    ]
  };

  const merged = mergeExecutionState(plan, saved);

  assert.equal(merged.selectedDayIndex, 1);
  assert.deepEqual(merged.shopping, [[true, true], [false]]);
  assert.deepEqual(merged.prep, [true, true]);
  assert.equal(merged.meals["day0-meal0"], "cooked");
  assert.equal(merged.meals["day0-meal1"], "pending");
  assert.equal(merged.meals["day1-meal0"], "skipped");
  assert.equal(merged.meals["day9-meal9"], undefined);
  assert.equal(merged.replacements.length, 1);
});

test("summarizeExecutionState counts total and completed work", () => {
  const state = {
    shopping: [[true, false], [true]],
    prep: [true, false],
    meals: {
      "day0-meal0": "cooked",
      "day0-meal1": "pending",
      "day1-meal0": "replaced"
    },
    replacements: [{ mealKey: "day1-meal0" }]
  };

  assert.deepEqual(summarizeExecutionState(state), {
    shoppingDone: 2,
    shoppingTotal: 3,
    prepDone: 1,
    prepTotal: 2,
    mealsDone: 2,
    mealsTotal: 3,
    replacementsTotal: 1,
    totalDone: 5,
    totalCount: 8
  });
});

test("createExecutionStorageKey is stable for the same generated plan", () => {
  assert.equal(createExecutionStorageKey(plan), createExecutionStorageKey({ ...plan }));
  assert.match(createExecutionStorageKey(plan), /^ai-cooking-execution:/);
});

test("createPlanId is stable and ignores volatile replacement logs", () => {
  const withReplacement = {
    ...plan,
    replacements: [{ replacementName: "临时替代餐", createdAt: new Date().toISOString() }]
  };

  assert.equal(createPlanId(plan), createPlanId(withReplacement));
  assert.match(createPlanId(plan), /^[a-z0-9]+$/);
});

test("updateSelectedDay clamps the chosen day to the plan range", () => {
  const state = buildExecutionState(plan);

  assert.equal(updateSelectedDay(plan, state, 1).selectedDayIndex, 1);
  assert.equal(updateSelectedDay(plan, state, 10).selectedDayIndex, 1);
  assert.equal(updateSelectedDay(plan, state, -4).selectedDayIndex, 0);
});

test("updateMealStatus stores cooked skipped and replaced states immutably", () => {
  const state = buildExecutionState(plan);
  const mealKey = createMealKey(0, 1);
  const next = updateMealStatus(state, mealKey, "cooked");

  assert.equal(state.meals[mealKey], "pending");
  assert.equal(next.meals[mealKey], "cooked");
  assert.throws(() => updateMealStatus(state, mealKey, "burned"), /Meal status/);
});

test("addReplacement records an adjustment and marks the meal as replaced", () => {
  const state = buildExecutionState(plan);
  const mealKey = createMealKey(1, 0);
  const next = addReplacement(state, {
    mealKey,
    reason: "缺少豆腐",
    originalName: "豆腐蔬菜汤",
    replacementName: "鸡蛋蔬菜汤",
    nutritionDelta: "蛋白 +6g",
    createdAt: "2026-06-04T09:00:00.000Z"
  });

  assert.equal(next.meals[mealKey], "replaced");
  assert.equal(next.replacements.length, 1);
  assert.equal(next.replacements[0].replacementName, "鸡蛋蔬菜汤");
  assert.equal(state.replacements.length, 0);
});
