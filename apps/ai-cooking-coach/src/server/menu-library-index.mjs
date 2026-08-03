import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MENU_LIBRARY_PATH = path.resolve(__dirname, "../../public/data/menu-library-rag.json");
const DEFAULT_LIMIT = 8;
const KNOWN_RESTRICTIONS = [
  "花生", "坚果", "腰果", "杏仁", "核桃", "牛奶", "奶", "乳糖", "鸡蛋", "蛋",
  "小麦", "麸质", "大豆", "豆类", "芝麻", "鱼", "虾", "蟹", "贝类", "海鲜",
  "香菜", "肥肉", "内脏",
];
const RESTRICTION_ALIASES = new Map([
  ["海鲜", ["鱼", "虾", "蟹", "贝"]],
  ["坚果", ["花生", "腰果", "杏仁", "核桃"]],
  ["乳制品", ["奶", "牛奶", "奶油", "芝士"]],
]);

let cachedMenuLibrary = null;

export function loadLocalMenuLibrary() {
  if (!cachedMenuLibrary) {
    cachedMenuLibrary = JSON.parse(readFileSync(MENU_LIBRARY_PATH, "utf8"));
  }
  return cachedMenuLibrary;
}

export function retrieveMenuLibraryRecipes(profile = {}, menuLibrary = loadLocalMenuLibrary(), limit = DEFAULT_LIMIT) {
  const items = Array.isArray(menuLibrary?.items) ? menuLibrary.items : [];
  if (!items.length) throw new Error("缺少本地菜谱 RAG，无法生成有菜谱依据的备餐计划。");
  const positiveTokens = tokens([
    profile.cuisine,
    profile.goal,
    profile.pantry,
    profile.equipment,
  ].filter(Boolean).join(" "));
  const allergyTerms = restrictionTerms(profile.allergies, { expandKnown: true });
  const dislikeTerms = restrictionTerms(profile.dislikes);
  const scored = items
    .filter((item) => !containsRestriction(item, allergyTerms))
    .filter((item) => !containsRestriction(item, dislikeTerms, { includeName: true }))
    .map((item, index) => ({ item, index, score: scoreRecipe(item, positiveTokens, profile) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const relevant = scored.filter(({ score }) => score > 0);
  return diversifyRecipes((relevant.length ? relevant : scored).map(({ item }) => item), limit)
    .map(publicRecipe);
}

export function formatMenuLibraryContext(recipes, maxLength = 6_000) {
  const lines = recipes.map((recipe) => [
    `[${recipe.sourceId}] ${recipe.name}`,
    `分类：${recipe.category}；技法：${recipe.technique}；份量：${recipe.servings}`,
    `配料：${recipe.ingredientsText}`,
    `做法：${recipe.method}`,
  ].join("\n"));
  return [
    "以下内容来自本地 menu-library-rag，仅作为菜名、配料与制作方法依据；使用时保留 sourceId，不得编造未提供的菜谱事实。",
    ...lines,
  ].join("\n\n").slice(0, maxLength);
}

export function groundPlanWithMenuLibrary(plan, recipes) {
  const used = new Map();
  const days = plan.days.map((day) => ({
    ...day,
    meals: day.meals.map((meal) => {
      const match = bestRecipeForMeal(meal, recipes);
      if (!match) return meal;
      used.set(match.sourceId, match);
      return { ...meal, recipeRag: recipeCitation(match) };
    }),
  }));
  return {
    ...plan,
    days,
    recipeRag: {
      source: "menu-library-rag",
      retrieved: recipes.map(recipeCitation),
      matches: [...used.values()].map(recipeCitation),
    },
  };
}

function scoreRecipe(item, positiveTokens, profile) {
  const text = String(item.searchText || `${item.name || ""} ${item.category || ""} ${item.ingredientsText || ""}`).toLowerCase();
  let score = 0;
  for (const token of positiveTokens) {
    if (text.includes(token)) score += token.length > 1 ? 4 : 1;
  }
  if (/减脂|控卡|低脂|健康/.test(String(profile.goal || ""))) {
    const calories = Number(item.calorieEstimate?.perServingKcal);
    if (Number.isFinite(calories) && calories <= 600) score += 3;
  }
  return score;
}

function diversifyRecipes(items, limit) {
  const selected = [];
  const seenNames = new Set();
  const categoryCounts = new Map();
  for (const item of items) {
    const name = String(item.name || "").trim();
    if (!name || seenNames.has(name)) continue;
    const category = String(item.category || "其他");
    const categoryCount = categoryCounts.get(category) || 0;
    if (categoryCount >= 3 && items.length > limit) continue;
    selected.push(item);
    seenNames.add(name);
    categoryCounts.set(category, categoryCount + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

function bestRecipeForMeal(meal, recipes) {
  const mealName = String(meal.name || "").trim();
  const mealTokens = matchingTokens(`${mealName} ${(meal.ingredients || []).join(" ")}`);
  const scored = recipes.map((recipe) => {
    const recipeName = String(recipe.name || "").trim();
    const recipeTokens = matchingTokens(`${recipeName} ${recipe.ingredientsText}`);
    let score = [...mealName].length >= 2 && [...recipeName].length >= 2
      && (mealName.includes(recipeName) || recipeName.includes(mealName)) ? 20 : 0;
    for (const token of mealTokens) if (recipeTokens.has(token)) score += token.length > 1 ? 3 : 1;
    return { recipe, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score >= 6 ? scored[0].recipe : null;
}

function publicRecipe(item) {
  return {
    sourceId: `menu:${item.id}`,
    id: item.id,
    name: String(item.name || ""),
    category: String(item.category || ""),
    technique: String(item.technique || ""),
    servings: String(item.servings || ""),
    ingredientsText: String(item.ingredientsText || "").slice(0, 800),
    method: String(item.method || "").slice(0, 1_200),
  };
}

function recipeCitation(recipe) {
  return {
    sourceId: recipe.sourceId,
    name: recipe.name,
    category: recipe.category,
    technique: recipe.technique,
    source: "menu-library-rag",
  };
}

function restrictionTerms(value, { expandKnown = false } = {}) {
  const phrases = String(value || "")
    .toLowerCase()
    .split(/[\s,，、;；/]+/)
    .map((term) => term.trim())
    .filter(Boolean);
  const terms = new Set();
  for (const phrase of phrases) {
    if (new Set(["没有", "无", "无过敏", "不忌口"]).has(phrase)) continue;
    const normalized = phrase
      .replace(/(?:不能吃|不喜欢|不吃|不要|避免|过敏原?|禁忌|忌口|对)/g, "")
      .replace(/[^\p{Script=Han}a-z0-9-]/gu, "");
    if (normalized) terms.add(normalized);
    if (expandKnown) {
      for (const known of KNOWN_RESTRICTIONS) {
        if (normalized.includes(known)) terms.add(known);
      }
      for (const [alias, expansions] of RESTRICTION_ALIASES) {
        if (normalized.includes(alias)) expansions.forEach((term) => terms.add(term));
      }
    }
  }
  return [...terms];
}

function containsRestriction(item, terms, { includeName = false } = {}) {
  if (!terms.length) return false;
  const ingredients = Array.isArray(item.ingredients)
    ? item.ingredients.map(({ name }) => name).filter(Boolean)
    : [];
  const ingredientText = [includeName ? item.name : "", item.ingredientsText, ...ingredients]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return terms.some((term) => ingredientText.includes(term));
}

function tokens(value) {
  const normalized = String(value || "").toLowerCase();
  const words = normalized.match(/[a-z0-9]{2,}|[\p{Script=Han}]/gu) || [];
  const han = (normalized.match(/[\p{Script=Han}]+/gu) || []).flatMap((text) =>
    Array.from({ length: Math.max(0, text.length - 1) }, (_, index) => text.slice(index, index + 2))
  );
  return new Set([...words, ...han]);
}

function matchingTokens(value) {
  const normalized = String(value || "").toLowerCase();
  const words = normalized.match(/[a-z0-9]{2,}/g) || [];
  const han = (normalized.match(/[\p{Script=Han}]+/gu) || []).flatMap((text) =>
    Array.from({ length: Math.max(0, text.length - 1) }, (_, index) => text.slice(index, index + 2))
  );
  return new Set([...words, ...han]);
}
