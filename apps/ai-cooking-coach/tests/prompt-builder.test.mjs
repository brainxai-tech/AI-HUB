import test from "node:test";
import assert from "node:assert/strict";

import { buildCookingPrompt, calculateBodyMetrics, validateProfile } from "../src/domain/prompt-builder.mjs";

test("calculateBodyMetrics derives BMI and protein targets from height and weight", () => {
  const metrics = calculateBodyMetrics({ heightCm: 170, weightKg: 70 });

  assert.equal(metrics.bmi, 24.2);
  assert.equal(metrics.bmiLabel, "偏高");
  assert.equal(metrics.proteinMinG, 84);
  assert.equal(metrics.proteinMaxG, 112);
});

test("validateProfile accepts a realistic family weight-loss profile", () => {
  const result = validateProfile({
    days: 7,
    familySize: 3,
    targetCalories: 1600,
    heightCm: 168,
    weightKg: 62,
    goal: "减脂，午餐适合带饭",
    cuisine: "中式家常，少油",
    allergies: "花生",
    dislikes: "肥肉, 动物内脏",
    budget: "每周 500 元以内",
    prepTime: "周日 2 小时，工作日 30 分钟",
    equipment: "电饭煲, 空气炸锅",
    pantry: "鸡胸肉, 鸡蛋, 西兰花"
  });

  assert.equal(result.valid, true);
  assert.equal(result.profile.days, 7);
  assert.equal(result.profile.familySize, 3);
  assert.equal(result.profile.heightCm, 168);
  assert.equal(result.profile.weightKg, 62);
  assert.equal(result.profile.allergies, "花生");
});

test("validateProfile rejects unsafe calorie and household values", () => {
  const result = validateProfile({
    days: 15,
    familySize: 0,
    targetCalories: 600,
    heightCm: 90,
    weightKg: 20
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.days, /1 到 14 天/);
  assert.match(result.errors.familySize, /1 到 8 人/);
  assert.match(result.errors.targetCalories, /1000 到 3200/);
  assert.match(result.errors.heightCm, /120 到 230 cm/);
  assert.match(result.errors.weightKg, /35 到 220 kg/);
});

test("buildCookingPrompt asks DeepSeek for strict Chinese JSON meal prep output", () => {
  const prompt = buildCookingPrompt({
    days: 7,
    familySize: 2,
    targetCalories: 1500,
    heightCm: 170,
    weightKg: 70,
    goal: "减脂，高蛋白",
    cuisine: "中式和日式",
    allergies: "虾蟹",
    dislikes: "香菜",
    budget: "每周 400 元",
    prepTime: "周末 2 小时",
    equipment: "电饭煲",
    pantry: "糙米, 鸡蛋"
  });

  assert.match(prompt, /只输出 JSON/);
  assert.match(prompt, /7 天/);
  assert.match(prompt, /家庭人数: 2/);
  assert.match(prompt, /每日目标热量: 1500/);
  assert.match(prompt, /主用户身高: 170 cm/);
  assert.match(prompt, /主用户体重: 70 kg/);
  assert.match(prompt, /主用户 BMI: 24\.2（偏高）/);
  assert.match(prompt, /主用户每日蛋白目标: 84-112 g/);
  assert.match(prompt, /虾蟹/);
  assert.match(prompt, /weeklyPlan/);
  assert.match(prompt, /shoppingList/);
  assert.match(prompt, /mealPrepGuide/);
  assert.match(prompt, /每天每道菜都必须给出细致做法/);
  assert.match(prompt, /steps 至少 5 步/);
  assert.match(prompt, /切配形态、调味比例、锅具或设备、火候、时长、熟成判断/);
  assert.match(prompt, /看到什么状态算完成/);
  assert.match(prompt, /estimatedCost/);
  assert.match(prompt, /每个食材都必须给出预计费用/);
  assert.match(prompt, /身高、体重、BMI 和蛋白目标/);
  assert.match(prompt, /采购清单中的每个 name 必须是一个单一、标准食材名/);
  assert.match(prompt, /优先使用能被本地食材营养 RAG 检索命中的名称/);
  assert.match(prompt, /未命中 RAG，也必须继续生成并保留该采购项/);
  assert.match(prompt, /每道菜 ingredients 只能使用采购清单 name 或现有食材中的食材/);
  assert.match(prompt, /禁止使用“优质蛋白 1 份”/);
});

test("buildCookingPrompt does not invent body metrics when height and weight are omitted", () => {
  const prompt = buildCookingPrompt({
    familySize: 2,
    targetCalories: 1500,
    goal: "减脂，高蛋白",
    cuisine: "中式家常"
  });

  assert.match(prompt, /7 天/);
  assert.doesNotMatch(prompt, /主用户身高/);
  assert.doesNotMatch(prompt, /主用户体重/);
  assert.doesNotMatch(prompt, /主用户 BMI/);
  assert.doesNotMatch(prompt, /每日蛋白目标/);
  assert.doesNotMatch(prompt, /身高、体重、BMI/);
});
