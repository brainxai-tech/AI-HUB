import assert from "node:assert/strict";
import test from "node:test";

import { generatePlanWithDeepSeek } from "../src/server/deepseek-client.mjs";
import {
  formatMenuLibraryContext,
  groundPlanWithMenuLibrary,
  loadLocalMenuLibrary,
  retrieveMenuLibraryRecipes,
} from "../src/server/menu-library-index.mjs";

test("local menu library loads 500 structured recipes", () => {
  const library = loadLocalMenuLibrary();
  assert.equal(library.itemCount, 500);
  assert.equal(library.items.length, 500);
  assert.ok(library.items.every((item) => item.id && item.name && item.ingredientsText && item.method));
});

test("menu retrieval injects source ids and grounds matching meals", () => {
  const recipes = retrieveMenuLibraryRecipes(
    { cuisine: "川湘菜", goal: "健康减脂", allergies: "", dislikes: "" },
    fixtureLibrary(),
    2,
  );
  const context = formatMenuLibraryContext(recipes);
  assert.match(context, /\[menu:1\] 麻婆豆腐/);
  const plan = groundPlanWithMenuLibrary({
    days: [{ day: "第 1 天", meals: [{ name: "少油麻婆豆腐", ingredients: ["北豆腐500g"] }] }],
  }, recipes);
  assert.equal(plan.days[0].meals[0].recipeRag.sourceId, "menu:1");
  assert.deepEqual(plan.recipeRag.matches.map(({ sourceId }) => sourceId), ["menu:1"]);
});

test("menu retrieval removes allergy suffixes and compound one-character allergens", () => {
  const recipes = retrieveMenuLibraryRecipes({ allergies: "花生过敏，虾蟹", dislikes: "葱" }, {
    items: [
      recipeFixture(1, "宫保鸡丁", "鸡肉100g；花生20g"),
      recipeFixture(2, "虾仁蒸蛋", "虾仁80g；鸡蛋2个"),
      recipeFixture(3, "清炒西兰花", "西兰花300g；蒜5g"),
      recipeFixture(4, "葱油拌面", "面条200g；葱20g"),
    ],
  });
  assert.deepEqual(recipes.map(({ sourceId }) => sourceId), ["menu:3"]);
});

test("meal grounding refuses weak character-overlap provenance", () => {
  const recipes = [
    publicRecipeFixture(1, "罗汉斋", "豆腐；木耳；胡萝卜"),
    publicRecipeFixture(2, "麻婆豆腐", "豆腐；牛肉末；豆瓣酱"),
    publicRecipeFixture(3, "红烧狮子头", "肉馅420g；荸荠80g；姜3g"),
    publicRecipeFixture(4, "玛格丽特披萨", "披萨饼底320g；番茄酱80g；芝士180g；橄榄油14g"),
  ];
  const plan = groundPlanWithMenuLibrary({
    days: [{ day: "第 1 天", meals: [
      { name: "燕麦酸奶杯", ingredients: ["燕麦", "酸奶"] },
      { name: "清蒸鲈鱼", ingredients: ["鲈鱼", "姜"] },
      { name: "鸡胸糙米西兰花便当", ingredients: ["鸡胸肉150g", "糙米80g", "姜3g"] },
      { name: "全麦鸡蛋菠菜卷", ingredients: ["全麦吐司2片", "鸡蛋2个", "菠菜100g", "橄榄油3ml"] },
    ] }],
  }, recipes);
  assert.ok(plan.days[0].meals.every((meal) => meal.recipeRag === undefined));
  assert.deepEqual(plan.recipeRag.matches, []);
});

test("live plan generation carries menu-library RAG provenance", async () => {
  let payload;
  const plan = await generatePlanWithDeepSeek({
    profile: { days: 1, familySize: 1, targetCalories: 1500, cuisine: "川湘菜", goal: "健康减脂" },
    menuLibrary: fixtureLibrary(),
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{ message: { content: JSON.stringify({
              days: [{ day: "第 1 天", meals: [{ name: "少油麻婆豆腐", calories: 450, protein: 25, ingredients: [], steps: ["准备", "切配", "炒香", "焖煮", "收汁"] }] }],
              shoppingList: [],
              batchPrep: [],
            }) } }],
          };
        },
      };
    },
  });
  assert.match(payload.messages[1].content, /menu-library-rag/);
  assert.match(payload.messages[1].content, /\[menu:1\] 麻婆豆腐/);
  assert.equal(plan.recipeRag.matches[0].sourceId, "menu:1");
  assert.equal(plan.days[0].meals[0].recipeRag.source, "menu-library-rag");
});

function fixtureLibrary() {
  return {
    items: [
      {
        id: 1,
        name: "麻婆豆腐",
        category: "川湘及麻辣菜",
        technique: "焖烧",
        servings: "2人份",
        ingredientsText: "北豆腐500g；牛肉末80g",
        method: "少油炒香后加入豆腐焖煮。",
        searchText: "麻婆豆腐 川湘菜 北豆腐 牛肉末 健康减脂",
        calorieEstimate: { perServingKcal: 450 },
      },
      {
        id: 2,
        name: "清蒸鲈鱼",
        category: "海鲜河鲜",
        technique: "清蒸",
        servings: "2人份",
        ingredientsText: "鲈鱼500g；姜10g",
        method: "水开后上锅清蒸。",
        searchText: "清蒸鲈鱼 海鲜 鲈鱼 姜",
        calorieEstimate: { perServingKcal: 300 },
      },
    ],
  };
}

function recipeFixture(id, name, ingredientsText) {
  return {
    id,
    name,
    category: "家常菜",
    technique: "炒",
    servings: "2人份",
    ingredientsText,
    ingredients: ingredientsText.split("；").map((namePart) => ({ name: namePart.replace(/[0-9].*$/, "") })),
    method: "按步骤烹饪至熟。",
    searchText: `${name} ${ingredientsText}`,
  };
}

function publicRecipeFixture(id, name, ingredientsText) {
  return {
    sourceId: `menu:${id}`,
    id,
    name,
    category: "家常菜",
    technique: "炒",
    servings: "2人份",
    ingredientsText,
    method: "按步骤烹饪至熟。",
  };
}
