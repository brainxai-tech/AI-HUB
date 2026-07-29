import test from "node:test";
import assert from "node:assert/strict";

import { extractJsonObject, normalizeMealPlan } from "../src/domain/plan-schema.mjs";

test("extractJsonObject parses fenced model JSON", () => {
  const parsed = extractJsonObject("```json\n{\"title\":\"计划\",\"days\":[]}\n```");
  assert.deepEqual(parsed, { title: "计划", days: [] });
});

test("normalizeMealPlan supplies stable arrays and totals", () => {
  const normalized = normalizeMealPlan({
    title: "家庭减脂备餐",
    days: [
      {
        day: "周一",
        meals: [
          { name: "鸡胸糙米饭", calories: 520, protein: 42, steps: ["煎鸡胸", "装盒"] }
        ]
      }
    ],
    shoppingList: [{ category: "蛋白质", items: ["鸡胸肉 600g"] }],
    batchPrep: [{ time: "周日", task: "处理鸡胸肉" }]
  });

  assert.equal(normalized.title, "家庭减脂备餐");
  assert.equal(normalized.days[0].totalCalories, 520);
  assert.equal(normalized.days[0].totalProtein, 42);
  assert.equal(normalized.shoppingList[0].items[0].display, "鸡胸肉 600g");
  assert.equal(normalized.guardrails.length > 0, true);
});

test("normalizeMealPlan rejects missing meal days", () => {
  assert.throws(
    () => normalizeMealPlan({ title: "bad", days: [] }),
    /至少包含 1 天/
  );
});

test("normalizeMealPlan preserves ingredient quantity and estimated cost in shopping list", () => {
  const normalized = normalizeMealPlan({
    title: "家庭减脂备餐",
    days: [
      {
        day: "周一",
        meals: [
          { name: "鸡胸糙米饭", calories: 520, protein: 42, steps: ["煎鸡胸", "装盒"] }
        ]
      }
    ],
    shoppingList: [
      {
        category: "蛋白质",
        items: [
          { name: "鸡胸肉", amount: "600g", estimatedCost: 24 },
          "鸡蛋 6 个 8 元"
        ]
      }
    ],
    batchPrep: []
  });

  assert.deepEqual(normalized.shoppingList[0].items[0], {
    name: "鸡胸肉",
    amount: "600g",
    estimatedCost: 24,
    display: "鸡胸肉 600g 约 24 元"
  });
  assert.equal(normalized.shoppingList[0].items[1].display, "鸡蛋 6 个 8 元");
});

test("normalizeMealPlan accepts weeklyPlan and mealPrepGuide from the cooking system prompt", () => {
  const normalized = normalizeMealPlan({
    weeklyPlan: {
      day1: {
        breakfast: {
          name: "杂粮鸡胸肉鸡蛋卷",
          ingredients: ["燕麦片50g", "鸡胸肉丁100g"],
          steps: ["焯燕麦", "煎蛋卷", "分装冷藏"],
          calories: 350,
          protein: 25
        },
        lunch: {
          name: "糙米鸡胸便当",
          ingredients: ["糙米100g", "鸡胸肉150g"],
          steps: ["煮糙米", "炒鸡胸", "装盒"],
          calories: 450,
          protein: 30
        }
      },
      day2: {
        dinner: {
          name: "清蒸鱼配西兰花",
          ingredients: ["鱼300g", "西兰花200g"],
          steps: ["处理鱼", "清蒸", "搭配蔬菜"],
          calories: 320,
          protein: 28
        }
      }
    },
    shoppingList: [
      { name: "鸡胸肉", amount: "800g", estimatedCost: 32 },
      { name: "糙米", amount: "500g", estimatedCost: 5 }
    ],
    mealPrepGuide: {
      sundayPrep: {
        duration: "2小时",
        tasks: ["0-30分钟：清洗切配蔬菜", "30-60分钟：腌制鸡胸肉"]
      },
      weekdayReheat: {
        lunch: "微波炉中高火加热2.5分钟",
        dinner: "炒锅快速复热"
      }
    }
  });

  assert.equal(normalized.days.length, 2);
  assert.equal(normalized.days[0].meals[0].slot, "早餐");
  assert.equal(normalized.days[0].totalCalories, 800);
  assert.equal(normalized.shoppingList[0].items[0].display, "鸡胸肉 800g 约 32 元");
  assert.equal(normalized.batchPrep[0].time, "0-30分钟");
  assert.equal(normalized.batchPrep.at(-1).time, "工作日晚餐");
});
