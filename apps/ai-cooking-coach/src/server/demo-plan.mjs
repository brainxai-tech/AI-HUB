import { calculateBodyMetrics, validateProfile } from "../domain/prompt-builder.mjs";
import { applyIngredientGovernance } from "../domain/ingredient-governance.mjs";
import { normalizeMealPlan } from "../domain/plan-schema.mjs";
import { loadLocalNutritionIndex } from "./nutrition-index.mjs";

const mealTemplates = [
  {
    breakfast: ["燕麦鸡蛋番茄碗", 410, 28, ["燕麦50g", "鸡蛋1个", "番茄100g", "黑胡椒少许"]],
    lunch: ["鸡胸糙米西兰花便当", 560, 45, ["鸡胸肉150g", "糙米80g", "西兰花200g", "低钠酱油8ml", "姜3g"]],
    dinner: ["番茄豆腐虾仁汤配糙米", 520, 38, ["番茄150g", "豆腐150g", "虾仁120g", "糙米60g", "蒜3g"]]
  },
  {
    breakfast: ["全麦鸡蛋菠菜卷", 430, 30, ["全麦吐司2片", "鸡蛋2个", "菠菜100g", "橄榄油3ml"]],
    lunch: ["鸡胸糙米黄瓜便当", 600, 42, ["鸡胸肉160g", "糙米90g", "黄瓜150g", "低钠酱油8ml", "黑胡椒少许"]],
    dinner: ["香菇蒸鸡胸配凉拌黄瓜", 540, 40, ["鸡胸肉150g", "香菇120g", "黄瓜150g", "醋10ml", "姜3g"]]
  },
  {
    breakfast: ["燕麦水煮蛋配番茄", 390, 26, ["燕麦45g", "鸡蛋2个", "番茄120g", "黑胡椒少许"]],
    lunch: ["鱼肉红薯西兰花便当", 590, 39, ["鱼肉160g", "红薯180g", "西兰花180g", "低钠酱油6ml", "姜3g"]],
    dinner: ["番茄豆腐菠菜汤配糙米", 500, 35, ["番茄150g", "豆腐180g", "菠菜150g", "糙米60g", "蒜3g"]]
  },
  {
    breakfast: ["鸡蛋番茄全麦吐司", 420, 27, ["鸡蛋2个", "番茄120g", "全麦吐司2片", "黑胡椒少许"]],
    lunch: ["豆腐鸡蛋菠菜盖糙米", 550, 34, ["豆腐180g", "鸡蛋1个", "菠菜150g", "糙米80g", "低钠酱油8ml"]],
    dinner: ["鸡胸红薯西兰花盘", 560, 41, ["鸡胸肉160g", "红薯180g", "西兰花200g", "橄榄油5ml", "蒜3g"]]
  },
  {
    breakfast: ["燕麦鸡蛋菠菜粥", 400, 25, ["燕麦50g", "鸡蛋1个", "菠菜120g", "黑胡椒少许"]],
    lunch: ["虾仁糙米黄瓜便当", 570, 37, ["虾仁140g", "糙米85g", "黄瓜150g", "低钠酱油6ml", "蒜3g"]],
    dinner: ["鸡胸香菇糙米饭配番茄汤", 580, 39, ["鸡胸肉140g", "香菇120g", "糙米80g", "番茄150g", "姜3g"]]
  },
  {
    breakfast: ["红薯鸡蛋菠菜碗", 450, 24, ["红薯160g", "鸡蛋2个", "菠菜120g", "黑胡椒少许"]],
    lunch: ["鸡胸西兰花糙米饭", 600, 44, ["鸡胸肉170g", "西兰花200g", "糙米90g", "低钠酱油8ml", "姜3g"]],
    dinner: ["清蒸鱼肉配黄瓜红薯", 530, 42, ["鱼肉180g", "黄瓜150g", "红薯160g", "醋8ml", "姜3g"]]
  },
  {
    breakfast: ["鸡蛋番茄全麦三明治", 430, 31, ["鸡蛋2个", "番茄120g", "全麦吐司2片", "黑胡椒少许"]],
    lunch: ["低油豆腐配糙米", 580, 36, ["豆腐220g", "糙米90g", "菠菜120g", "低钠酱油8ml", "蒜3g"]],
    dinner: ["香菇鸡胸汤配凉拌菠菜", 520, 40, ["香菇150g", "鸡胸肉150g", "菠菜160g", "醋8ml", "姜3g"]]
  }
];

export function buildDemoPlan(profileInput = {}) {
  const { profile } = validateProfile(profileInput);
  const bodyMetrics = calculateBodyMetrics(profile);
  const summary = bodyMetrics
    ? `这是 AI Hub 暂不可用时的本地兜底计划；已读取主用户 ${profile.heightCm}cm / ${profile.weightKg}kg，BMI ${bodyMetrics.bmi}（${bodyMetrics.bmiLabel}）。Hub 恢复后会按你的身体指标和约束重新生成。`
    : "这是 AI Hub 暂不可用时的本地兜底计划；未提供身高体重，本地计划不会估算 BMI 或按体重生成蛋白目标。Hub 恢复后会按你的目标、热量和厨房约束重新生成。";
  const proteinGuardrail = bodyMetrics
    ? `主用户每日蛋白目标约 ${bodyMetrics.proteinMinG}-${bodyMetrics.proteinMaxG}g，正式生成时会按身高、体重和 BMI 调整餐食结构。`
    : "未提供身高体重时不估算 BMI 或体重蛋白目标；正式生成会按每日热量和高蛋白目标安排餐食结构。";
  const days = Array.from({ length: profile.days }, (_, index) => {
    const template = mealTemplates[index % mealTemplates.length];
    return {
    day: `第 ${index + 1} 天`,
    theme: index % 2 === 0 ? "高蛋白带饭日" : "轻负担家庭晚餐日",
    meals: [
      meal("早餐", template.breakfast, "15-20 分钟"),
      meal("午餐", template.lunch, "30 分钟", "适合前一晚装盒，冷藏 2 天"),
      meal("晚餐", template.dinner, "30-40 分钟")
    ]
    };
  });

  const normalized = normalizeMealPlan({
    title: `${profile.days} 天家庭减脂备餐演示计划`,
    summary,
    days,
    shoppingList: [
      {
        category: "蛋白质",
        items: [
          { name: "鸡胸肉", amount: "1kg", estimatedCost: 36 },
          { name: "鸡蛋", amount: "12 个", estimatedCost: 12 },
          { name: "豆腐", amount: "4 盒", estimatedCost: 16 },
          { name: "鱼肉", amount: "500g", estimatedCost: 40 },
          { name: "虾仁", amount: "300g", estimatedCost: 25 }
        ]
      },
      {
        category: "主食",
        items: [
          { name: "糙米", amount: "1kg", estimatedCost: 14 },
          { name: "燕麦", amount: "500g", estimatedCost: 12 },
          { name: "全麦吐司", amount: "1 袋", estimatedCost: 15 },
          { name: "红薯", amount: "1kg", estimatedCost: 9 }
        ]
      },
      {
        category: "蔬菜",
        items: [
          { name: "西兰花", amount: "3 颗", estimatedCost: 18 },
          { name: "番茄", amount: "8 个", estimatedCost: 16 },
          { name: "黄瓜", amount: "4 根", estimatedCost: 10 },
          { name: "香菇", amount: "600g", estimatedCost: 18 },
          { name: "菠菜", amount: "500g", estimatedCost: 10 }
        ]
      },
      {
        category: "调味",
        items: [
          { name: "低钠酱油", amount: "1 瓶", estimatedCost: 18 },
          { name: "黑胡椒", amount: "1 罐", estimatedCost: 12 },
          { name: "橄榄油", amount: "250ml", estimatedCost: 35 },
          { name: "醋", amount: "1 瓶", estimatedCost: 8 },
          { name: "姜", amount: "100g", estimatedCost: 4 },
          { name: "蒜", amount: "100g", estimatedCost: 5 }
        ]
      }
    ],
    batchPrep: [
      { time: "周日 10:00", task: "煮糙米和燕麦，按餐盒分装主食", duration: "35 分钟" },
      { time: "周日 10:40", task: "鸡胸肉分切腌制，空气炸锅或平底锅预熟一半", duration: "45 分钟" },
      { time: "周日 11:30", task: "清洗切配西兰花、黄瓜、番茄和香菇", duration: "30 分钟" },
      { time: "工作日前晚", task: "组合第二天午餐便当，晚餐保留现做蔬菜", duration: "15 分钟" }
    ],
    guardrails: [
      "热量和营养为估算值，减脂期间不要极端节食。",
      proteinGuardrail,
      "如果家庭成员有疾病、孕期或特殊医学需求，请先咨询专业人士。",
      "每周至少复盘一次饱腹感、体重趋势和执行难度。"
    ]
  });

  return applyIngredientGovernance(normalized, {
    nutritionIndex: loadLocalNutritionIndex(),
    pantry: profile.pantry
  });
}

function meal(slot, template, time, leftovers = "建议现做或冷藏 1 天") {
  const [name, calories, protein, ingredients = []] = template;
  const isBreakfast = slot === "早餐";
  const isLunch = slot === "午餐";
  return {
    slot,
    name,
    calories,
    protein,
    time,
    leftovers,
    ingredients,
    steps: [
      isBreakfast
        ? `按本餐 ingredients 称量：${ingredients.join("、")}；燕麦提前浸润，蔬菜切成1cm小段`
        : `按本餐 ingredients 称量：${ingredients.join("、")}；肉类切0.6-1cm厚片，蔬菜切成易熟小块`,
      "只使用本餐 ingredients 中列出的调味食材调味，肉类先抓匀腌制8-10分钟，避免额外加糖或重油酱汁",
      isLunch
        ? "炒锅中火预热30秒，按 ingredients 中的油量刷锅，先处理调味食材，再下主蛋白铺平加热"
        : "使用电饭煲、蒸锅或炒锅按食材选择少油烹调，保持中小火，避免外焦内生",
      isBreakfast
        ? "蛋液或主食混合物入锅后小火加热3-5分钟，看到中心凝固、边缘可推动即可出锅"
        : "蛋白质变白后加入蔬菜，继续翻炒或蒸煮2-5分钟，肉类中心无粉色、鱼肉可轻松拨开即熟",
      "出锅前再少量补盐或生抽，优先用醋、胡椒、葱姜蒜提味，避免额外加糖和重油酱汁",
      "按家庭人数分装，热菜完全放凉后加盖冷藏；带饭复热用微波炉中高火2-3分钟或蒸锅5分钟"
    ]
  };
}
