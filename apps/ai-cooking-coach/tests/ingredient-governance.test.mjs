import test from "node:test";
import assert from "node:assert/strict";

import { normalizeMealPlan } from "../src/domain/plan-schema.mjs";
import { applyIngredientGovernance, findRagIngredient } from "../src/domain/ingredient-governance.mjs";

const nutritionIndex = {
  items: [
    {
      name: "鸡胸肉",
      englishName: "Chicken breast, roasted",
      fdcId: "1001",
      searchText: "鸡胸肉 chicken breast roasted"
    },
    {
      name: "糙米",
      englishName: "Rice, brown, dry",
      fdcId: "1002",
      searchText: "糙米 rice brown dry"
    },
    {
      name: "鸡蛋",
      englishName: "Egg, whole, raw",
      fdcId: "1003",
      searchText: "鸡蛋 egg whole raw"
    }
  ]
};

function planWith({ ingredients, shoppingItems }) {
  return normalizeMealPlan({
    weeklyPlan: {
      day1: {
        breakfast: {
          name: "鸡胸糙米饭",
          ingredients,
          steps: ["切鸡胸", "腌鸡胸", "煮糙米", "煎鸡胸", "分装复热"],
          calories: 500,
          protein: 35
        }
      }
    },
    shoppingList: shoppingItems,
    mealPrepGuide: {
      sundayPrep: { duration: "1小时", tasks: ["0-30分钟：处理鸡胸肉"] },
      weekdayReheat: { lunch: "微波炉加热2分钟" }
    }
  });
}

test("applyIngredientGovernance marks every shopping ingredient with a RAG match", () => {
  const governed = applyIngredientGovernance(
    planWith({
      ingredients: ["鸡胸肉丁100g", "糙米80g"],
      shoppingItems: [{ name: "鸡胸肉", amount: "800g", estimatedCost: 32 }]
    }),
    { nutritionIndex, pantry: "糙米500g" }
  );

  const item = governed.shoppingList[0].items[0];
  assert.equal(item.name, "鸡胸肉");
  assert.deepEqual(item.rag, {
    fdcId: "1001",
    name: "鸡胸肉",
    englishName: "Chicken breast, roasted"
  });
  assert.equal(item.nutritionStatus, "matched");
  assert.match(governed.guardrails.at(-1), /采购食材已匹配本地 RAG/);
});

test("applyIngredientGovernance keeps shopping ingredients outside the RAG index", () => {
  const governed = applyIngredientGovernance(
    planWith({
      ingredients: ["未知蛋白100g"],
      shoppingItems: [{ name: "未知蛋白", amount: "500g", estimatedCost: 20 }]
    }),
    { nutritionIndex, pantry: "" }
  );

  const item = governed.shoppingList[0].items[0];
  assert.equal(item.name, "未知蛋白");
  assert.equal(item.originalName, "未知蛋白");
  assert.equal(item.rag, null);
  assert.equal(item.nutritionStatus, "unmatched");
  assert.match(governed.guardrails.at(-1), /未命中项已保留：未知蛋白/);
});

test("applyIngredientGovernance auto-adds meal ingredients missing from shopping list or pantry", () => {
  const governed = applyIngredientGovernance(
    planWith({
      ingredients: ["鸡胸肉100g", "鸡蛋1个"],
      shoppingItems: [{ name: "鸡胸肉", amount: "800g", estimatedCost: 32 }]
    }),
    { nutritionIndex, pantry: "糙米500g" }
  );

  const autoGroup = governed.shoppingList.find((group) => group.category === "自动补充采购");
  assert.ok(autoGroup);
  assert.equal(autoGroup.items.length, 1);
  assert.equal(autoGroup.items[0].name, "鸡蛋");
  assert.equal(autoGroup.items[0].amount, "1个");
  assert.equal(autoGroup.items[0].autoAdded, true);
  assert.equal(autoGroup.items[0].nutritionStatus, "matched");
  assert.equal(autoGroup.items[0].rag.fdcId, "1003");
  assert.match(governed.guardrails.at(-1), /周计划缺失食材已自动补入采购清单：鸡蛋/);
});

test("findRagIngredient prefers basic raw ingredients over prepared composite dishes", () => {
  const match = findRagIngredient("鸡蛋", {
    items: [
      {
        name: "鸡蛋/蛋类、鸡肉、洋葱",
        englishName: "Livers, chicken, chopped, with eggs and onion",
        fdcId: "prepared",
        searchText: "鸡蛋/蛋类、鸡肉、洋葱 livers chicken eggs onion"
      },
      {
        name: "鸡蛋/蛋类",
        englishName: "Egg, whole, raw",
        fdcId: "raw",
        searchText: "鸡蛋/蛋类 egg whole raw"
      }
    ]
  });

  assert.equal(match.entry.fdcId, "raw");
});
