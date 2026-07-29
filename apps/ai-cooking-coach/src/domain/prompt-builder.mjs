const DEFAULT_PROFILE = {
  days: 7,
  familySize: 2,
  targetCalories: 1500,
  goal: "健康减脂，尽量高蛋白、高纤维、少油少糖",
  cuisine: "中式家常，适合带饭",
  allergies: "",
  dislikes: "",
  budget: "中等预算",
  prepTime: "周末 2 小时，工作日 30 分钟以内",
  equipment: "电饭煲, 炒锅",
  pantry: ""
};

function toInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hasInputValue(value) {
  return String(value ?? "").trim() !== "";
}

function toOptionalNumber(value) {
  if (!hasInputValue(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export function hasBodyMetrics(profile) {
  return Number.isFinite(profile.heightCm) && Number.isFinite(profile.weightKg);
}

export function calculateBodyMetrics(profile) {
  if (!hasBodyMetrics(profile)) {
    return null;
  }

  const heightM = profile.heightCm / 100;
  const bmi = heightM > 0 ? profile.weightKg / (heightM * heightM) : 0;
  const roundedBmi = Number(bmi.toFixed(1));
  const proteinMinG = Math.round(profile.weightKg * 1.2);
  const proteinMaxG = Math.round(profile.weightKg * 1.6);
  let bmiLabel = "正常范围";
  if (roundedBmi < 18.5) {
    bmiLabel = "偏低";
  } else if (roundedBmi >= 28) {
    bmiLabel = "肥胖范围";
  } else if (roundedBmi >= 24) {
    bmiLabel = "偏高";
  }

  return {
    bmi: roundedBmi,
    bmiLabel,
    proteinMinG,
    proteinMaxG
  };
}

export function validateProfile(input = {}) {
  const profile = {
    days: toInt(input.days, DEFAULT_PROFILE.days),
    familySize: toInt(input.familySize, DEFAULT_PROFILE.familySize),
    targetCalories: toInt(input.targetCalories, DEFAULT_PROFILE.targetCalories),
    heightCm: toOptionalNumber(input.heightCm),
    weightKg: toOptionalNumber(input.weightKg),
    goal: cleanText(input.goal, DEFAULT_PROFILE.goal),
    cuisine: cleanText(input.cuisine, DEFAULT_PROFILE.cuisine),
    allergies: cleanText(input.allergies, DEFAULT_PROFILE.allergies),
    dislikes: cleanText(input.dislikes, DEFAULT_PROFILE.dislikes),
    budget: cleanText(input.budget, DEFAULT_PROFILE.budget),
    prepTime: cleanText(input.prepTime, DEFAULT_PROFILE.prepTime),
    equipment: cleanText(input.equipment, DEFAULT_PROFILE.equipment),
    pantry: cleanText(input.pantry, DEFAULT_PROFILE.pantry)
  };

  const errors = {};
  if (profile.days < 1 || profile.days > 14) {
    errors.days = "计划天数必须是 1 到 14 天。";
  }
  if (profile.familySize < 1 || profile.familySize > 8) {
    errors.familySize = "家庭人数必须是 1 到 8 人。";
  }
  if (profile.targetCalories < 1000 || profile.targetCalories > 3200) {
    errors.targetCalories = "每日目标热量必须在 1000 到 3200 kcal 之间。";
  }
  if (profile.heightCm !== null && (!Number.isFinite(profile.heightCm) || profile.heightCm < 120 || profile.heightCm > 230)) {
    errors.heightCm = "身高必须在 120 到 230 cm 之间。";
  }
  if (profile.weightKg !== null && (!Number.isFinite(profile.weightKg) || profile.weightKg < 35 || profile.weightKg > 220)) {
    errors.weightKg = "体重必须在 35 到 220 kg 之间。";
  }

  return {
    valid: Object.keys(errors).length === 0,
    profile,
    errors
  };
}

function renderBodyMetricConstraint(profile, bodyMetrics) {
  if (!bodyMetrics) return "";

  return `- 主用户身高: ${profile.heightCm} cm
- 主用户体重: ${profile.weightKg} kg
- 主用户 BMI: ${bodyMetrics.bmi}（${bodyMetrics.bmiLabel}）
- 主用户每日蛋白目标: ${bodyMetrics.proteinMinG}-${bodyMetrics.proteinMaxG} g（按 1.2-1.6g/kg 估算）
`;
}

function renderMealStructureRequirement(bodyMetrics) {
  if (!bodyMetrics) {
    return "11. 方案需要根据用户目标、每日热量、家庭人数、口味、预算、备餐时间和厨房设备调整每日餐食结构；每日总蛋白应尽量体现高蛋白目标，若无法满足需在 mealPrepGuide 或 guardrails 中说明。";
  }

  return "11. 方案必须根据主用户身高、体重、BMI 和蛋白目标调整每日餐食结构；每日总蛋白应尽量落在主用户蛋白目标内，若无法满足需在 mealPrepGuide 或 guardrails 中说明。";
}

export function buildCookingPrompt(profileInput = {}) {
  const { valid, profile, errors } = validateProfile(profileInput);
  if (!valid) {
    const message = Object.values(errors).join(" ");
    throw new Error(message);
  }
  const bodyMetrics = calculateBodyMetrics(profile);

  return `请按 system prompt 中的“中式家庭减脂备餐规划师”角色，为用户生成 ${profile.days} 天中式家庭减脂备餐计划。

用户约束:
- 家庭人数: ${profile.familySize}
- 每日目标热量: ${profile.targetCalories} kcal/成人，允许上下浮动 10%
${renderBodyMetricConstraint(profile, bodyMetrics)}
- 目标: ${profile.goal}
- 菜系/口味: ${profile.cuisine}
- 过敏/禁忌: ${profile.allergies || "无"}
- 不喜欢: ${profile.dislikes || "无"}
- 预算: ${profile.budget}
- 可用备餐时间: ${profile.prepTime}
- 厨房设备: ${profile.equipment}
- 现有食材: ${profile.pantry || "未提供"}

要求:
1. 只输出 JSON，不要 Markdown，不要解释。
2. 不提供医疗诊断，不推荐极端节食。
3. 每天至少包含 breakfast、lunch、dinner，可按需要增加 snack。
4. 每餐给出 name、ingredients、steps、calories、protein。
5. 每天每道菜都必须给出细致做法：steps 至少 5 步，必须覆盖食材切配形态、调味比例、锅具或设备、火候、时长、熟成判断、分装保存或复热建议。
6. 优先设计可批量处理、适合带饭、少油少糖的中式家庭菜。
7. 采购清单里每个食材都必须给出预计费用，使用 estimatedCost 字段，单位为人民币元。
8. 采购清单不要包含用户现有食材，若必须补买，只列补买数量。
9. 备餐指南必须包含 sundayPrep 和 weekdayReheat。
10. weeklyPlan 必须从 day1 连续输出到 day${profile.days}，不要只输出示例中的 day1。
${renderMealStructureRequirement(bodyMetrics)}
12. steps 禁止使用“煎熟”“炒匀”“装盒”这类过短泛化表达；每一步都要写清楚操作细节，例如切成多大、加多少调味料、用什么火、几分钟、看到什么状态算完成。
13. 采购清单中的每个 name 必须是一个单一、标准食材名，优先使用能被本地食材营养 RAG 检索命中的名称；若常见调味料或必要食材暂未命中 RAG，也必须继续生成并保留该采购项，不要输出“鱼/虾仁”“杂蔬”“优质蛋白”这类组合项或模糊类别。
14. 每道菜 ingredients 只能使用采购清单 name 或现有食材中的食材；如需要葱、姜、蒜、生抽、醋、油、盐等调味，也必须写入 shoppingList 或来自现有食材，不能在菜谱里临时出现。
15. ingredients 中的每一项必须保留标准食材名并附用量，例如“鸡胸肉丁100g”“糙米80g”，禁止使用“优质蛋白 1 份”“深色蔬菜 2 份”等泛化写法。
16. shoppingList 不要把多个食材合并在一个 name 里；需要鱼和虾时拆成两个采购项，并分别给出 amount 与 estimatedCost。

JSON 结构必须是:
{
  "weeklyPlan": {
    "day1": {
      "breakfast": {
        "name": "string",
        "ingredients": ["食材 数量"],
        "steps": ["切配形态与预处理", "调味比例与腌制时间", "锅具/设备与火候", "烹饪时长与加料顺序", "熟成判断", "分装保存或复热建议"],
        "calories": 350,
        "protein": 25
      },
      "lunch": {
        "name": "string",
        "ingredients": ["食材 数量"],
        "steps": ["切配形态与预处理", "调味比例与腌制时间", "锅具/设备与火候", "烹饪时长与加料顺序", "熟成判断", "分装保存或复热建议"],
        "calories": 450,
        "protein": 30
      },
      "dinner": {
        "name": "string",
        "ingredients": ["食材 数量"],
        "steps": ["切配形态与预处理", "调味比例与腌制时间", "锅具/设备与火候", "烹饪时长与加料顺序", "熟成判断", "分装保存或复热建议"],
        "calories": 300,
        "protein": 28
      }
    }
  },
  "shoppingList": [
    { "name": "鸡胸肉", "amount": "800g", "estimatedCost": 32 }
  ],
  "mealPrepGuide": {
    "sundayPrep": {
      "duration": "2小时",
      "tasks": ["0-30分钟：清洗切配蔬菜", "30-100分钟：腌制肉类并分装", "100-120分钟：煮主食并冷藏"]
    },
    "weekdayReheat": {
      "lunch": "微波炉中高火加热2.5分钟",
      "dinner": "炒锅或空气炸锅快速复热"
    }
  }
}`;
}
