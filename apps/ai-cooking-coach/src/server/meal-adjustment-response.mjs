import { extractJsonObject } from "../domain/plan-schema.mjs";
import { createHttpError } from "./plan-response.mjs";
import {
  defaultModelForProvider,
  defaultProvider,
  requestCompatibleChatCompletion
} from "./llm-compatible-client.mjs";

const DEFAULT_MODEL = "";

export async function createMealAdjustmentResponse(body = {}, { fetchImpl = globalThis.fetch } = {}) {
  const plan = normalizePlanInput(body.plan);
  const mealKey = String(body.mealKey || "").trim();
  const mealRef = findMealByKey(plan, mealKey);
  const reason = cleanText(body.reason, "临时调整");
  const constraints = cleanText(body.constraints, "尽量沿用当前计划目标和厨房约束");

  if (!mealRef) {
    throw createHttpError("找不到要调整的餐食。", 400, { mealKey });
  }

  try {
    const replacement = await requestCompatibleReplacement({
      model: body.model || DEFAULT_MODEL,
      provider: body.provider,
      apiBaseUrl: body.apiBaseUrl,
      plan,
      mealKey,
      mealRef,
      reason,
      constraints,
      fetchImpl
    });

    return {
      mode: "live",
      adjustment: buildAdjustmentRecord({ mealKey, mealRef, reason, replacement })
    };
  } catch (error) {
    console.warn("AI meal adjustment failed; using local fallback.", error?.message || error);
    return {
      mode: "fallback",
      adjustment: buildFallbackAdjustment({ mealKey, mealRef, reason, constraints }),
      warning: "AI Hub 暂时不可用，已生成不会覆盖原计划的本地替代餐。"
    };
  }
}

function normalizePlanInput(plan) {
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.days)) {
    throw createHttpError("调整餐食需要传入当前计划。", 400);
  }
  return plan;
}

function cleanText(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function findMealByKey(plan, mealKey) {
  const match = mealKey.match(/^day(\d+)-meal(\d+)$/);
  if (!match) return null;
  const dayIndex = Number(match[1]);
  const mealIndex = Number(match[2]);
  const meal = plan.days?.[dayIndex]?.meals?.[mealIndex];
  if (!meal) return null;

  return {
    dayIndex,
    mealIndex,
    day: plan.days[dayIndex],
    meal
  };
}

async function requestCompatibleReplacement({ model, provider = defaultProvider(), apiBaseUrl = "", plan, mealKey, mealRef, reason, constraints, fetchImpl }) {
  const payload = buildDeepSeekAdjustmentPayload({ model, plan, mealKey, mealRef, reason, constraints });
  const content = await requestCompatibleChatCompletion({
    provider,
    apiBaseUrl,
    model: model || defaultModelForProvider(provider),
    messages: payload.messages,
    temperature: 0.35,
    maxTokens: 2600,
    fetchImpl
  });
  const parsed = extractJsonObject(content);
  return normalizeReplacement(parsed.replacement || parsed);
}

function buildDeepSeekAdjustmentPayload({ model, plan, mealKey, mealRef, reason, constraints }) {
  const compactPlan = {
    title: plan.title,
    summary: plan.summary,
    day: mealRef.day?.day,
    theme: mealRef.day?.theme,
    originalMeal: mealRef.meal,
    shoppingList: plan.shoppingList,
    guardrails: plan.guardrails
  };

  return {
    model: model || DEFAULT_MODEL,
    messages: [
      {
        role: "system",
        content: [
          "你是中式家庭减脂备餐执行调整助手。",
          "用户已经有一份周备餐计划，现在只需要替换其中一餐。",
          "必须保持热量、蛋白、食材采购和复热可执行性，输出严格 JSON。",
          "不要改写整周计划，只返回 replacement 对象。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          mealKey,
          reason,
          constraints,
          currentPlanContext: compactPlan,
          requiredShape: {
            replacement: {
              name: "string",
              ingredients: ["食材和用量"],
              steps: ["至少 5 个可执行步骤"],
              calories: 450,
              protein: 30,
              leftovers: "保存或复热建议",
              nutritionDelta: "相对原餐的热量/蛋白变化",
              shoppingListDiff: ["新增或减少的采购项"],
              reasonSummary: "为什么这样替换"
            }
          }
        })
      }
    ],
    response_format: { type: "json_object" },
    thinking: { type: "disabled" },
    temperature: 0.35,
    max_tokens: 2600
  };
}

function buildFallbackAdjustment({ mealKey, mealRef, reason, constraints }) {
  const original = mealRef.meal;
  const replacement = normalizeReplacement({
    name: chooseFallbackName(original, constraints),
    ingredients: chooseFallbackIngredients(original, constraints),
    steps: [
      "把可用蛋白食材切成 1.5cm 小块或打散备用，蔬菜洗净后切成适合入口的小段。",
      "主食沿用原计划份量，若已经煮熟则只需分装；若未煮熟，按电饭煲常规水量提前煮好。",
      "炒锅刷油约 3ml，中小火先处理蛋白食材 2-4 分钟，看到表面定型或完全变色。",
      "加入蔬菜和少量生抽、醋或黑胡椒调味，继续翻炒 60-90 秒，避免过度出水。",
      "和主食分区装盒，完全放凉后冷藏；复热时中高火 2 分钟，中途翻动一次。"
    ],
    calories: Math.max(260, Math.round(Number(original.calories || 420) * 0.92)),
    protein: Math.max(16, Math.round(Number(original.protein || 28) * 0.85)),
    leftovers: "冷藏 24 小时内食用；复热时补 1 汤匙水保持口感。",
    nutritionDelta: "本地规则估算：热量略低，蛋白可能略低，请按实际食材微调。",
    shoppingListDiff: ["优先使用现有食材；必要时补 1 份高蛋白食材"],
    reasonSummary: `根据“${reason}”做本地应急替代，约束：${constraints}`
  });

  return buildAdjustmentRecord({
    mealKey,
    mealRef,
    reason,
    replacement
  });
}

function buildAdjustmentRecord({ mealKey, mealRef, reason, replacement }) {
  return {
    mealKey,
    reason,
    originalName: String(mealRef.meal?.name || "原餐食"),
    replacementName: replacement.name,
    nutritionDelta: replacement.nutritionDelta,
    createdAt: new Date().toISOString(),
    replacement
  };
}

function chooseFallbackName(original, constraints) {
  const text = `${constraints} ${original?.name || ""}`;
  if (/豆腐/.test(text)) return "豆腐蔬菜应急饭";
  if (/鸡蛋|蛋/.test(text)) return "鸡蛋蔬菜应急饭";
  return `${original?.slot || "餐食"}应急替代餐`;
}

function chooseFallbackIngredients(original, constraints) {
  if (/豆腐/.test(constraints)) {
    return ["豆腐200g", "现有蔬菜150g", "原计划主食1份"];
  }
  if (/鸡蛋|蛋/.test(constraints)) {
    return ["鸡蛋2个", "现有蔬菜150g", "原计划主食1份"];
  }
  return (original?.ingredients || []).slice(0, 3).concat("可用高蛋白食材1份");
}

function normalizeReplacement(input = {}) {
  const calories = Number(input.calories);
  const protein = Number(input.protein);

  return {
    name: cleanText(input.name, "应急替代餐"),
    ingredients: Array.isArray(input.ingredients) ? input.ingredients.map(String) : [],
    steps: Array.isArray(input.steps) ? input.steps.map(String) : [],
    calories: Number.isFinite(calories) ? Math.round(calories) : 0,
    protein: Number.isFinite(protein) ? Math.round(protein) : 0,
    leftovers: cleanText(input.leftovers, "按原计划冷藏或复热。"),
    nutritionDelta: cleanText(input.nutritionDelta, "营养变化为估算值。"),
    shoppingListDiff: Array.isArray(input.shoppingListDiff) ? input.shoppingListDiff.map(String) : [],
    reasonSummary: cleanText(input.reasonSummary, "按当前约束替换。")
  };
}
