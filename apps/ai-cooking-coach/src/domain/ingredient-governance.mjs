const QUERY_ALIASES = [
  { names: ["鸡胸肉"], terms: ["chicken breast"], prefer: ["breast", "roasted", "meat only"], avoid: ["fried", "batter", "sandwich"] },
  { names: ["鸡腿"], terms: ["chicken leg"], prefer: ["leg", "roasted"], avoid: ["fried", "batter", "sandwich"] },
  { names: ["鸡肉"], terms: ["chicken"], prefer: ["broilers", "roasted"], avoid: ["sandwich", "soup", "fried"] },
  { names: ["虾仁", "虾"], terms: ["shrimp"], prefer: ["raw"], avoid: ["fried", "restaurant", "platter"] },
  { names: ["三文鱼", "鲑鱼"], terms: ["salmon"], prefer: ["raw"], avoid: ["oil", "sandwich"] },
  { names: ["鲈鱼", "鱼肉", "鱼"], terms: ["fish"], prefer: ["raw"], avoid: ["oil", "sandwich", "soup"] },
  { names: ["瘦牛肉", "牛肉"], terms: ["beef"], prefer: ["lean", "fresh"], avoid: ["sandwich", "soup", "gravy"] },
  { names: ["瘦猪肉", "猪肉"], terms: ["pork"], prefer: ["loin", "fresh"], avoid: ["gravy", "sausage", "sandwich"] },
  { names: ["鸡蛋", "蛋"], terms: ["egg"], prefer: ["egg, whole", "whole", "raw", "boiled", "poached", "eggs"], avoid: ["sandwich", "noodles", "babyfood", "roll", "burrito", "pizza", "quesadilla", "chicken", "onion", "with meat"] },
  { names: ["糙米"], terms: ["brown rice"], prefer: ["dry", "cereal"], avoid: ["biscuit", "babyfood"] },
  { names: ["米饭", "大米", "米"], terms: ["rice"], prefer: ["cooked", "dry"], avoid: ["biscuit", "babyfood"] },
  { names: ["燕麦"], terms: ["oats"], prefer: ["oats"], avoid: ["honey", "cereal ready-to-eat"] },
  { names: ["全麦吐司", "吐司", "面包"], terms: ["bread"], prefer: ["whole-wheat"], avoid: ["sweet", "cake"] },
  { names: ["红薯", "地瓜"], terms: ["sweet potatoes"], prefer: ["sweet potatoes"], avoid: ["babyfood"] },
  { names: ["土豆", "马铃薯"], terms: ["potato"], prefer: ["potato"], avoid: ["chips"] },
  { names: ["西兰花"], terms: ["broccoli"], prefer: ["broccoli"], avoid: ["sandwich"] },
  { names: ["番茄", "西红柿"], terms: ["tomato"], prefer: ["tomato"], avoid: ["soup", "sauce"] },
  { names: ["菠菜"], terms: ["spinach"], prefer: ["spinach"], avoid: ["noodles"] },
  { names: ["黄瓜"], terms: ["cucumber"], prefer: ["cucumber"], avoid: ["pickle"] },
  { names: ["胡萝卜"], terms: ["carrots"], prefer: ["carrots"], avoid: ["babyfood"] },
  { names: ["洋葱"], terms: ["onion"], prefer: ["onion"], avoid: ["rings"] },
  { names: ["白菜", "卷心菜"], terms: ["cabbage"], prefer: ["cabbage"], avoid: ["soup"] },
  { names: ["蘑菇", "香菇", "菌菇"], terms: ["mushroom"], prefer: ["mushroom"], avoid: ["soup"] },
  { names: ["豆腐"], terms: ["tofu soybean"], prefer: ["soy"], avoid: ["margarine", "oil"] },
  { names: ["豆浆"], terms: ["soy milk"], prefer: ["soy"], avoid: ["infant"] },
  { names: ["低钠酱油", "酱油", "生抽"], terms: ["soy sauce"], prefer: ["soy sauce"], avoid: ["margarine"] },
  { names: ["橄榄油", "食用油"], terms: ["olive oil"], prefer: ["olive"], avoid: ["spread"] },
  { names: ["醋"], terms: ["vinegar"], prefer: ["vinegar"], avoid: ["sauce"] },
  { names: ["黑胡椒", "胡椒"], terms: ["pepper"], prefer: ["pepper"], avoid: ["sauce"] },
  { names: ["姜"], terms: ["ginger"], prefer: ["ginger"], avoid: [] },
  { names: ["蒜", "大蒜"], terms: ["garlic"], prefer: ["garlic"], avoid: [] },
  { names: ["葱", "小葱"], terms: ["scallions"], prefer: ["onion"], avoid: [] }
];

const AMOUNT_PATTERN = /\d+(?:\.\d+)?\s*(?:kg|g|mg|克|千克|公斤|斤|ml|l|升|毫升|个|颗|根|盒|瓶|袋|份|片|勺|匙|茶匙|汤匙|杯|碗)/gi;
const SHAPE_SUFFIX_PATTERN = /(?:丁|丝|片|块|粒|末|段|条|泥|碎|小朵|小块|小丁|切片|切丝|切块)$/;
const GENERIC_INGREDIENTS = new Set(["优质蛋白", "全谷物", "薯类", "深色蔬菜", "蔬菜", "主食", "蛋白质"]);
const AUTO_SUPPLEMENT_CATEGORY = "自动补充采购";
const AUTO_SUPPLEMENT_AMOUNT = "按菜谱用量";

export function applyIngredientGovernance(plan, { nutritionIndex, pantry = "" } = {}) {
  if (!nutritionIndex || !Array.isArray(nutritionIndex.items)) {
    throw governanceError("缺少本地食材营养 RAG，无法校验采购食材。");
  }

  const sourceNames = new Set(parsePantryNames(pantry));
  const shoppingList = plan.shoppingList.map((group) => ({
    ...group,
    items: group.items.map((item) => anchorShoppingItemToRag(item, nutritionIndex, sourceNames))
  }));

  for (const group of shoppingList) {
    for (const item of group.items) {
      addSourceName(sourceNames, item.name);
      addSourceName(sourceNames, item.originalName);
      addSourceName(sourceNames, item.rag?.name);
      addSourceName(sourceNames, item.rag?.englishName);
    }
  }

  const autoAddedShoppingNames = addMissingMealIngredientsToShoppingList(
    shoppingList,
    collectMissingMealIngredients(plan.days, sourceNames),
    nutritionIndex,
    sourceNames
  );

  const unmatchedShoppingNames = shoppingList
    .flatMap((group) => group.items)
    .filter((item) => item.nutritionStatus === "unmatched")
    .map((item) => item.name);
  const sourceGuardrail = autoAddedShoppingNames.length
    ? `周计划缺失食材已自动补入采购清单：${autoAddedShoppingNames.join("、")}。`
    : "周计划食材已校验为来自采购清单或现有食材。";
  const ragGuardrail = unmatchedShoppingNames.length
    ? `采购食材已尝试匹配本地 RAG；未命中项已保留：${unmatchedShoppingNames.join("、")}。${sourceGuardrail}`
    : `采购食材已匹配本地 RAG；${sourceGuardrail}`;

  const guardrails = [
    ...plan.guardrails,
    ragGuardrail
  ];

  return {
    ...plan,
    shoppingList,
    guardrails: [...new Set(guardrails)]
  };
}

function anchorShoppingItemToRag(item, nutritionIndex, sourceNames) {
  const match = findRagIngredient(item.name, nutritionIndex);
  const originalName = item.name;
  if (!match) {
    const nextItem = {
      ...item,
      originalName,
      name: originalName,
      rag: null,
      nutritionStatus: "unmatched"
    };
    nextItem.display = shoppingItemDisplay(nextItem);
    addSourceName(sourceNames, originalName);
    return nextItem;
  }

  const nextItem = {
    ...item,
    originalName,
    name: originalName,
    nutritionStatus: "matched",
    rag: {
      fdcId: String(match.entry.fdcId || ""),
      name: String(match.entry.name || originalName),
      englishName: String(match.entry.englishName || "")
    }
  };
  nextItem.display = shoppingItemDisplay(nextItem);
  addSourceName(sourceNames, originalName);
  return nextItem;
}

function addMissingMealIngredientsToShoppingList(shoppingList, missingIngredients, nutritionIndex, sourceNames) {
  const addedNames = [];
  let autoGroup = shoppingList.find((group) => group.category === AUTO_SUPPLEMENT_CATEGORY);

  for (const missing of missingIngredients) {
    const name = missing.name;
    if (!name || sourceNamesHas(sourceNames, name)) {
      continue;
    }
    if (!autoGroup) {
      autoGroup = { category: AUTO_SUPPLEMENT_CATEGORY, items: [] };
      shoppingList.push(autoGroup);
    }
    const item = anchorShoppingItemToRag(
      {
        name,
        amount: missing.amount || AUTO_SUPPLEMENT_AMOUNT,
        estimatedCost: null,
        autoAdded: true,
        source: "weeklyPlan"
      },
      nutritionIndex,
      sourceNames
    );
    autoGroup.items.push(item);
    addedNames.push(item.name);
    addSourceName(sourceNames, item.rag?.name);
    addSourceName(sourceNames, item.rag?.englishName);
  }

  return addedNames;
}

export function findRagIngredient(name, nutritionIndex) {
  const query = buildQuery(name);
  if (!query.label || !Array.isArray(nutritionIndex?.items)) {
    return null;
  }

  const best = nutritionIndex.items
    .map((entry) => ({ entry, score: scoreEntry(entry, query) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  return best && best.score >= 10 ? best : null;
}

export function normalizeIngredientName(value) {
  return String(value ?? "")
    .replace(/[（(][^）)]*[）)]/g, " ")
    .replace(AMOUNT_PATTERN, " ")
    .replace(/[约左右适量少许生重熟重去皮去骨无糖低脂低钠]/g, "")
    .replace(/[，,、+＋/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(SHAPE_SUFFIX_PATTERN, "")
    .trim();
}

function buildQuery(name) {
  const label = normalizeIngredientName(name);
  const alias = QUERY_ALIASES.find((candidate) =>
    candidate.names.some((aliasName) => aliasMatches(label, aliasName))
  );
  const terms = [];
  if (label) {
    terms.push(label);
  }
  if (alias) {
    terms.push(...alias.names, ...alias.terms);
  }

  return {
    label,
    terms: [...new Set(terms.filter(Boolean).map((term) => term.toLowerCase()))],
    prefer: alias?.prefer || [],
    avoid: alias?.avoid || []
  };
}

function aliasMatches(label, aliasName) {
  if (!label || !aliasName) {
    return false;
  }
  if (aliasName.length < 2 || label.length < 2) {
    return label === aliasName;
  }
  return label.includes(aliasName) || aliasName.includes(label);
}

function scoreEntry(entry, query) {
  const name = String(entry.name || "").toLowerCase();
  const chineseHint = String(entry.chineseHint || "").toLowerCase();
  const englishName = String(entry.englishName || "").toLowerCase();
  const text = String(entry.searchText || `${name} ${chineseHint} ${englishName}`).toLowerCase();
  let score = 0;

  if (name === query.label.toLowerCase() || chineseHint === query.label.toLowerCase()) {
    score += 28;
  }
  if (name.includes(query.label.toLowerCase()) || query.label.toLowerCase().includes(name)) {
    score += 12;
  }
  if (/[、/]/.test(name) && name !== query.label.toLowerCase()) {
    score -= 4;
  }

  for (const term of query.terms) {
    if (text.includes(term)) {
      score += 9 + Math.min(term.length, 16) / 2;
      continue;
    }
    const tokens = term.split(/\s+/).filter(Boolean);
    score += tokens.filter((token) => text.includes(token)).length * 2.5;
  }

  for (const term of query.prefer) {
    if (text.includes(term.toLowerCase())) {
      score += 2.5;
    }
  }
  for (const term of query.avoid) {
    if (text.includes(term.toLowerCase())) {
      score -= 4;
    }
  }

  return score;
}

function collectMissingMealIngredients(days, sourceNames) {
  const missing = new Map();
  for (const day of days) {
    for (const meal of day.meals) {
      for (const raw of meal.ingredients) {
        const normalized = normalizeIngredientName(raw);
        const name = !normalized || GENERIC_INGREDIENTS.has(normalized)
          ? String(raw || "").trim()
          : normalized;
        if (!name) {
          continue;
        }
        if (!sourceNamesHas(sourceNames, name) && !missing.has(name)) {
          missing.set(name, {
            name,
            raw: String(raw || ""),
            amount: extractIngredientAmount(raw)
          });
        }
      }
    }
  }
  return [...missing.values()];
}

function extractIngredientAmount(value) {
  const text = String(value || "");
  const match = text.match(/\d+(?:\.\d+)?\s*(?:kg|g|mg|克|千克|公斤|斤|ml|l|升|毫升|个|颗|根|盒|瓶|袋|份|片|勺|匙|茶匙|汤匙|杯|碗)/i);
  return match ? match[0].replace(/\s+/g, "") : AUTO_SUPPLEMENT_AMOUNT;
}

function parsePantryNames(pantry) {
  return String(pantry || "")
    .split(/[\n,，、;；]+/)
    .map(normalizeIngredientName)
    .filter(Boolean);
}

function addSourceName(sourceNames, value) {
  const name = normalizeIngredientName(value);
  if (name) {
    sourceNames.add(name);
  }
}

function sourceNamesHas(sourceNames, ingredient) {
  for (const source of sourceNames) {
    if (source === ingredient) {
      return true;
    }
    if (source.length >= 2 && ingredient.length >= 2 && (source.includes(ingredient) || ingredient.includes(source))) {
      return true;
    }
  }
  return false;
}

function shoppingItemDisplay(item) {
  const cost = item.estimatedCost === null || item.estimatedCost === undefined
    ? ""
    : `约 ${formatCurrency(Number(item.estimatedCost))} 元`;
  return [item.name, item.amount, cost].filter(Boolean).join(" ");
}

function formatCurrency(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

function governanceError(message) {
  return Object.assign(new Error(message), { status: 422 });
}
