export function extractJsonObject(content) {
  if (typeof content !== "string") {
    throw new Error("模型返回内容不是文本。");
  }

  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : extractBalancedObject(trimmed);

  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new Error(`模型返回的 JSON 无法解析: ${error.message}`);
  }
}

function extractBalancedObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("模型返回中没有找到 JSON 对象。");
  }
  return text.slice(start, end + 1);
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  if (Number.isFinite(number)) {
    return number;
  }
  const match = String(value).match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function formatCurrency(value) {
  if (value === null) {
    return "";
  }
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

function normalizeShoppingItem(item) {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const name = String(item.name || item.ingredient || item.item || "未命名食材").trim() || "未命名食材";
    const amount = String(item.amount || item.quantity || item.qty || "").trim();
    const estimatedCost = numberOrNull(item.estimatedCost ?? item.cost ?? item.price);
    const display = [
      name,
      amount,
      estimatedCost === null ? "" : `约 ${formatCurrency(estimatedCost)} 元`
    ].filter(Boolean).join(" ");

    return {
      name,
      amount,
      estimatedCost,
      display
    };
  }

  const display = String(item ?? "").trim() || "未命名食材";
  return {
    name: display,
    amount: "",
    estimatedCost: null,
    display
  };
}

const SLOT_LABELS = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "加餐",
  snacks: "加餐",
  brunch: "早午餐"
};

function slotLabel(value) {
  const raw = String(value || "").trim();
  return SLOT_LABELS[raw] || SLOT_LABELS[raw.toLowerCase()] || raw || "餐次";
}

function normalizeMeal(meal, index) {
  const calories = Math.round(numberOrZero(meal.calories));
  const protein = Math.round(numberOrZero(meal.protein));
  return {
    slot: String(meal.slot || `餐次 ${index + 1}`),
    name: String(meal.name || "未命名餐食"),
    calories,
    protein,
    time: String(meal.time || "时间未估算"),
    leftovers: String(meal.leftovers || "按需现做"),
    ingredients: arrayOrEmpty(meal.ingredients).map(String),
    steps: arrayOrEmpty(meal.steps).map(String)
  };
}

function normalizeDay(day, dayIndex) {
  const meals = arrayOrEmpty(day.meals).map(normalizeMeal);
  const totalCalories = meals.reduce((sum, meal) => sum + meal.calories, 0);
  const totalProtein = meals.reduce((sum, meal) => sum + meal.protein, 0);
  return {
    day: String(day.day || `第 ${dayIndex + 1} 天`),
    theme: String(day.theme || "均衡减脂"),
    meals,
    totalCalories,
    totalProtein
  };
}

function dayNumberFromKey(key, fallback) {
  const match = String(key).match(/(?:day|第)?\s*(\d+)/i);
  return match ? Number(match[1]) : fallback;
}

function isMealLike(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value.name || value.ingredients || value.steps || value.calories || value.protein)
  );
}

function normalizeWeeklyDay(day, dayKey, dayIndex) {
  const preferredSlots = ["breakfast", "lunch", "dinner", "snack", "snacks", "早餐", "午餐", "晚餐", "加餐"];
  const seen = new Set();
  const meals = [];

  for (const slot of preferredSlots) {
    if (isMealLike(day?.[slot])) {
      seen.add(slot);
      meals.push(normalizeMeal({ ...day[slot], slot: day[slot].slot || slotLabel(slot) }, meals.length));
    }
  }

  for (const [slot, meal] of Object.entries(day || {})) {
    if (!seen.has(slot) && isMealLike(meal)) {
      meals.push(normalizeMeal({ ...meal, slot: meal.slot || slotLabel(slot) }, meals.length));
    }
  }

  const totalCalories = meals.reduce((sum, meal) => sum + meal.calories, 0);
  const totalProtein = meals.reduce((sum, meal) => sum + meal.protein, 0);
  return {
    day: String(day?.day || `第 ${dayNumberFromKey(dayKey, dayIndex + 1)} 天`),
    theme: String(day?.theme || "中式减脂备餐"),
    meals,
    totalCalories,
    totalProtein
  };
}

function normalizeWeeklyPlanDays(weeklyPlan) {
  if (Array.isArray(weeklyPlan)) {
    return weeklyPlan.map((day, index) => normalizeWeeklyDay(day, `day${index + 1}`, index));
  }
  if (!weeklyPlan || typeof weeklyPlan !== "object") {
    return [];
  }
  return Object.entries(weeklyPlan)
    .filter(([, day]) => day && typeof day === "object" && !Array.isArray(day))
    .sort(([aKey], [bKey]) => dayNumberFromKey(aKey, 999) - dayNumberFromKey(bKey, 999))
    .map(([dayKey, day], index) => normalizeWeeklyDay(day, dayKey, index));
}

function normalizePlanDays(plan) {
  if (Array.isArray(plan.days) && plan.days.length) {
    return plan.days.map(normalizeDay);
  }
  return normalizeWeeklyPlanDays(plan.weeklyPlan);
}

function normalizeShoppingList(shoppingList) {
  const entries = arrayOrEmpty(shoppingList);
  if (!entries.length) {
    return [];
  }

  if (entries.some((entry) => entry && typeof entry === "object" && Array.isArray(entry.items))) {
    return entries.map((group) => ({
      category: String(group?.category || "其他"),
      items: arrayOrEmpty(group?.items).map(normalizeShoppingItem)
    }));
  }

  const groups = new Map();
  for (const item of entries) {
    const category = item && typeof item === "object" && item.category
      ? String(item.category)
      : "采购清单";
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category).push(normalizeShoppingItem(item));
  }

  return Array.from(groups, ([category, items]) => ({ category, items }));
}

function normalizePrepTask(task, fallbackTime, fallbackDuration) {
  if (task && typeof task === "object" && !Array.isArray(task)) {
    return {
      time: String(task.time || fallbackTime),
      task: String(task.task || task.name || "备餐任务"),
      duration: String(task.duration || fallbackDuration)
    };
  }

  const text = String(task || "备餐任务").trim();
  const match = text.match(/^([^:：]+)[：:]\s*(.+)$/);
  return {
    time: match ? match[1] : fallbackTime,
    task: match ? match[2] : text,
    duration: fallbackDuration
  };
}

function normalizeMealPrepGuide(guide) {
  if (!guide || typeof guide !== "object") {
    return [];
  }

  const tasks = [];
  const sundayPrep = guide.sundayPrep;
  if (sundayPrep && typeof sundayPrep === "object") {
    const duration = String(sundayPrep.duration || "按周日备餐时间");
    for (const task of arrayOrEmpty(sundayPrep.tasks)) {
      tasks.push(normalizePrepTask(task, "周日批量备餐", duration));
    }
  }

  const weekdayReheat = guide.weekdayReheat;
  if (weekdayReheat && typeof weekdayReheat === "object") {
    for (const [slot, instruction] of Object.entries(weekdayReheat)) {
      tasks.push({
        time: `工作日${slotLabel(slot)}`,
        task: String(instruction || "按需复热"),
        duration: "快速复热"
      });
    }
  } else if (typeof weekdayReheat === "string") {
    tasks.push({
      time: "工作日复热",
      task: weekdayReheat,
      duration: "快速复热"
    });
  }

  return tasks;
}

function normalizeBatchPrep(plan) {
  const legacy = arrayOrEmpty(plan.batchPrep);
  if (legacy.length) {
    return legacy.map((item) => ({
      time: String(item.time || "待安排"),
      task: String(item.task || "备餐任务"),
      duration: String(item.duration || "时间未估算")
    }));
  }
  return normalizeMealPrepGuide(plan.mealPrepGuide);
}

export function normalizeMealPlan(plan) {
  if (!plan || typeof plan !== "object") {
    throw new Error("计划必须是 JSON 对象。");
  }

  const days = normalizePlanDays(plan);
  if (days.length < 1) {
    throw new Error("计划至少包含 1 天。");
  }

  return {
    title: String(plan.title || "中式家庭减脂备餐计划"),
    summary: String(plan.summary || "按家庭口味、热量目标、预算和厨房设备生成。"),
    days,
    shoppingList: normalizeShoppingList(plan.shoppingList),
    batchPrep: normalizeBatchPrep(plan),
    guardrails: arrayOrEmpty(plan.guardrails).length
      ? plan.guardrails.map(String)
      : ["热量和营养为估算值；如有疾病、孕期或特殊医学需求，请咨询医生或注册营养师。"]
  };
}
