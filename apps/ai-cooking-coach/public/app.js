import {
  addReplacement,
  buildExecutionState,
  createMealKey,
  createExecutionStorageKey,
  mergeExecutionState,
  summarizeExecutionState,
  updateMealStatus,
  updatePrepTask,
  updateSelectedDay,
  updateShoppingItem
} from "./execution-state.mjs";
import {
  buildPlanHistoryEntry,
  buildWeeklyReviewMarkdown,
  createPlanHistoryStorageKey,
  deletePlanHistoryEntry,
  mergePlanHistory,
  summarizeWeeklyReview
} from "./weekly-memory.mjs";
import {
  buildProcurementItems,
  buildShoppingCopyText,
  filterProcurementItems,
  summarizeProcurement
} from "./shopping-list.mjs";

const PLAN_HISTORY_STORAGE_KEY = createPlanHistoryStorageKey();
const PLAN_HISTORY_LIMIT = 12;
const LOCAL_APP_ORIGIN = "http://127.0.0.1:4317";
const LOCAL_APP_ORIGINS = new Set([LOCAL_APP_ORIGIN, "http://localhost:4317"]);
const NUTRITION_INDEX_URL = appUrl("/data/ingredient-nutrition-rag.json");
const MENU_LIBRARY_URL = appUrl("/data/menu-library-rag.json");
const MENU_RENDER_LIMIT = 48;
const NUTRIENT_DISPLAY_FIELDS = [
  ["energyKcal", "能量"],
  ["proteinG", "蛋白"],
  ["fatG", "脂肪"],
  ["carbsG", "碳水"],
  ["fiberG", "纤维"],
  ["sodiumMg", "钠"]
];
const NUTRITION_QUERY_ALIASES = [
  { names: ["鸡胸肉"], terms: ["chicken breast"], prefer: ["breast", "roasted", "meat only"], avoid: ["fried", "batter", "flour", "sandwich"] },
  { names: ["鸡腿"], terms: ["chicken leg"], prefer: ["leg", "roasted"], avoid: ["fried", "batter", "sandwich"] },
  { names: ["鸡肉"], terms: ["chicken"], prefer: ["broilers", "roasted"], avoid: ["sandwich", "soup", "fried"] },
  { names: ["虾仁", "虾"], terms: ["shrimp"], prefer: ["raw"], avoid: ["fried", "applebee", "denny", "restaurant", "platter"] },
  { names: ["三文鱼", "鲑鱼"], terms: ["salmon"], prefer: ["raw"], avoid: ["oil", "sandwich"] },
  { names: ["鲈鱼", "鱼肉", "鱼"], terms: ["fish"], prefer: ["raw"], avoid: ["oil", "sandwich", "soup"] },
  { names: ["瘦牛肉", "牛肉"], terms: ["beef"], prefer: ["lean", "roast", "fresh"], avoid: ["sandwich", "soup", "gravy"] },
  { names: ["瘦猪肉", "猪肉"], terms: ["pork"], prefer: ["loin", "fresh"], avoid: ["gravy", "sausage", "sandwich"] },
  { names: ["鸡蛋", "蛋"], terms: ["egg"], prefer: ["eggs"], avoid: ["sandwich", "noodles", "babyfood"] },
  { names: ["糙米"], terms: ["brown rice"], prefer: ["dry", "cereal"], avoid: ["biscuit", "babyfood"] },
  { names: ["米饭", "大米", "米"], terms: ["rice"], prefer: ["cooked", "dry"], avoid: ["biscuit", "babyfood"] },
  { names: ["燕麦"], terms: ["oats"], prefer: ["oats"], avoid: ["honey", "bunches", "cereal ready-to-eat"] },
  { names: ["全麦吐司", "吐司", "面包"], terms: ["bread"], prefer: ["whole-wheat"], avoid: ["sweet", "cake"] },
  { names: ["红薯", "地瓜"], terms: ["sweet potatoes"], prefer: ["sweet potatoes"], avoid: ["babyfood"] },
  { names: ["土豆", "马铃薯"], terms: ["potato"], prefer: ["potato"], avoid: ["chips"] },
  { names: ["西兰花"], terms: ["broccoli"], prefer: ["broccoli"], avoid: ["sandwich", "hot pockets"] },
  { names: ["番茄", "西红柿"], terms: ["tomato"], prefer: ["tomato"], avoid: ["soup", "sauce"] },
  { names: ["菠菜"], terms: ["spinach"], prefer: ["spinach"], avoid: ["noodles"] },
  { names: ["黄瓜"], terms: ["cucumber"], prefer: ["cucumber"], avoid: ["pickle"] },
  { names: ["胡萝卜"], terms: ["carrots"], prefer: ["carrots"], avoid: ["babyfood"] },
  { names: ["洋葱"], terms: ["onion"], prefer: ["onion"], avoid: ["rings"] },
  { names: ["白菜", "卷心菜"], terms: ["cabbage"], prefer: ["cabbage"], avoid: ["soup"] },
  { names: ["蘑菇", "香菇", "菌菇"], terms: ["mushroom"], prefer: ["mushroom"], avoid: ["soup"] },
  { names: ["豆腐"], terms: ["tofu soybean"], prefer: ["soy"], avoid: ["margarine", "oil"] },
  { names: ["豆浆"], terms: ["soy milk"], prefer: ["soy"], avoid: ["infant"] },
  { names: ["低钠酱油", "酱油"], terms: ["soy sauce"], prefer: ["soy sauce"], avoid: ["margarine"] },
  { names: ["橄榄油"], terms: ["olive oil"], prefer: ["olive"], avoid: ["spread"] },
  { names: ["醋"], terms: ["vinegar"], prefer: ["vinegar"], avoid: ["sauce"] },
  { names: ["黑胡椒", "胡椒"], terms: ["pepper"], prefer: ["pepper"], avoid: ["sauce"] }
];

const form = document.querySelector("#plannerForm");
const copyButton = document.querySelector("#copyButton");
const downloadButton = document.querySelector("#downloadButton");
const statusBanner = document.querySelector("#statusBanner");
const planTitle = document.querySelector("#planTitle");
const weekView = document.querySelector("#weekView");
const shoppingView = document.querySelector("#shoppingView");
const prepView = document.querySelector("#prepView");
const appScreens = document.querySelectorAll(".app-screen");
const screenControls = document.querySelectorAll("[data-screen]");
const menuButtons = document.querySelectorAll(".side-menu-link");
const agentTitle = document.querySelector("#agentTitle");
const agentProvider = document.querySelector("#agentProvider");
const agentReadiness = document.querySelector("#agentReadiness");
const agentModelPolicy = document.querySelector("#agentModelPolicy");
const menuSearchInput = document.querySelector("#menuSearchInput");
const menuTechniqueSelect = document.querySelector("#menuTechniqueSelect");
const menuFlavorSelect = document.querySelector("#menuFlavorSelect");
const menuIngredientChips = document.querySelector("#menuIngredientChips");
const menuRecipeGrid = document.querySelector("#menuRecipeGrid");
const menuLibraryCount = document.querySelector("#menuLibraryCount");
const menuLibraryShown = document.querySelector("#menuLibraryShown");
const menuLibraryStatus = document.querySelector("#menuLibraryStatus");
const menuClearFilters = document.querySelector("#menuClearFilters");
const commandCenterEmpty = document.querySelector("#commandCenterEmpty");
const commandCenterBoard = document.querySelector("#commandCenterBoard");
const commandCenterStatus = document.querySelector("#commandCenterStatus");
const commandMetricGrid = document.querySelector("#commandMetricGrid");
const commandNextTask = document.querySelector("#commandNextTask");
const commandDayTabs = document.querySelector("#commandDayTabs");
const todayCookingView = document.querySelector("#todayCookingView");
const replacementHistory = document.querySelector("#replacementHistory");
const historyReviewStatus = document.querySelector("#historyReviewStatus");
const planHistoryList = document.querySelector("#planHistoryList");
const planHistoryCount = document.querySelector("#planHistoryCount");
const weeklyReviewPanel = document.querySelector("#weeklyReviewPanel");
const weeklyReviewContent = document.querySelector("#weeklyReviewContent");
const weeklyFeedback = document.querySelector("#weeklyFeedback");
const weeklyReviewSuggestion = document.querySelector("#weeklyReviewSuggestion");
const generateWeekReviewButton = document.querySelector("#generateWeekReviewButton");
const exportWeekReviewButton = document.querySelector("#exportWeekReviewButton");

let currentPlan = null;
let currentMarkdown = "";
let currentSvg = "";
let executionState = null;
let executionStorageKey = "";
let planHistory = [];
let selectedHistoryPlanId = "";
let weeklyFeedbackDraft = "";
let weeklyReviewResult = null;
let activeProcurementFilter = "pending";
let nutritionIndex = null;
let nutritionIndexPromise = null;
let menuLibraryIndex = null;
let menuLibraryPromise = null;
let activeMenuIngredient = "";

planHistory = loadPlanHistory();
renderEmpty();
renderCommandCenter();
renderHistoryReviewScreen();
bindMetricMirrors();
bindScreenNavigation();
bindMenuLibraryControls();
loadAgentPanel().catch(() => {});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await requestPlan();
});

copyButton?.addEventListener("click", async () => {
  if (!currentMarkdown) return;
  await navigator.clipboard.writeText(currentMarkdown);
  setStatus("已复制", "Markdown 已复制。", "loading");
  setTimeout(() => setStatus("就绪", "结果可以继续调整。"), 1200);
});

downloadButton?.addEventListener("click", () => {
  if (!currentSvg) return;
  const blob = new Blob([currentSvg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "ai-cooking-plan.svg";
  anchor.click();
  URL.revokeObjectURL(url);
});

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.remove("active");
      tab.setAttribute("aria-selected", "false");
    });
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    button.classList.add("active");
    button.setAttribute("aria-selected", "true");
    document.querySelector(`#${button.dataset.view}View`)?.classList.add("active");
  });
});

shoppingView?.addEventListener("click", handleShoppingNutritionClick);
shoppingView?.addEventListener("click", handleShoppingCheckClick);
shoppingView?.addEventListener("click", handleProcurementFilterClick);
shoppingView?.addEventListener("click", handleProcurementCheckClick);
shoppingView?.addEventListener("click", handleShoppingCopyClick);
prepView?.addEventListener("click", handlePrepCheckClick);
commandDayTabs?.addEventListener("click", handleCommandDayClick);
todayCookingView?.addEventListener("click", handleMealStatusClick);
todayCookingView?.addEventListener("click", handleMealReplacementToggle);
todayCookingView?.addEventListener("submit", handleMealReplacementSubmit);
planHistoryList?.addEventListener("click", handlePlanHistoryClick);
weeklyFeedback?.addEventListener("input", () => {
  weeklyFeedbackDraft = weeklyFeedback.value;
});
generateWeekReviewButton?.addEventListener("click", handleGenerateWeekReview);
exportWeekReviewButton?.addEventListener("click", handleExportWeekReview);

function bindScreenNavigation() {
  screenControls.forEach((button) => {
    button.addEventListener("click", () => {
      switchScreen(button.dataset.screen);
    });
  });
}

function switchScreen(screenId) {
  appScreens.forEach((screen) => {
    const isActive = screen.id === screenId;
    screen.classList.toggle("active", isActive);
    screen.hidden = !isActive;
  });

  menuButtons.forEach((button) => {
    const isActive = button.dataset.screen === screenId;
    button.classList.toggle("active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  if (screenId === "menuLibraryScreen") {
    ensureMenuLibraryLoaded();
  }
  if (screenId === "commandCenterScreen") {
    renderCommandCenter();
  }
  if (screenId === "historyReviewScreen") {
    renderHistoryReviewScreen();
  }
}

function bindMenuLibraryControls() {
  menuSearchInput?.addEventListener("input", renderMenuLibrary);
  menuTechniqueSelect?.addEventListener("change", renderMenuLibrary);
  menuFlavorSelect?.addEventListener("change", renderMenuLibrary);
  menuClearFilters?.addEventListener("click", () => {
    activeMenuIngredient = "";
    if (menuSearchInput) menuSearchInput.value = "";
    if (menuTechniqueSelect) menuTechniqueSelect.value = "";
    if (menuFlavorSelect) menuFlavorSelect.value = "";
    renderMenuLibrary();
  });
  menuIngredientChips?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-menu-ingredient]");
    if (!button) return;
    const ingredient = button.dataset.menuIngredient || "";
    activeMenuIngredient = activeMenuIngredient === ingredient ? "" : ingredient;
    renderMenuLibrary();
  });
}

async function ensureMenuLibraryLoaded() {
  if (menuLibraryIndex) {
    renderMenuLibrary();
    return;
  }
  if (!menuRecipeGrid) return;
  menuRecipeGrid.innerHTML = `<div class="menu-empty-state"><strong>正在加载</strong><span>本地菜单库正在读取。</span></div>`;
  setMenuLibraryStatus("正在加载本地菜单库...");
  try {
    const index = await loadMenuLibraryIndex();
    hydrateMenuLibraryFilters(index);
    renderMenuLibrary();
  } catch (error) {
    setMenuLibraryStatus(`本地菜单库加载失败：${error.message}`);
    menuRecipeGrid.innerHTML = `<div class="menu-empty-state"><strong>加载失败</strong><span>${escapeHtml(error.message)}</span></div>`;
  }
}

function loadMenuLibraryIndex() {
  if (menuLibraryIndex) {
    return Promise.resolve(menuLibraryIndex);
  }
  if (!menuLibraryPromise) {
    menuLibraryPromise = fetch(MENU_LIBRARY_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((index) => {
        menuLibraryIndex = index;
        return index;
      });
  }
  return menuLibraryPromise;
}

function hydrateMenuLibraryFilters(index) {
  if (menuLibraryCount) {
    menuLibraryCount.textContent = String(index.itemCount || index.items?.length || 0);
  }
  hydrateSelect(menuTechniqueSelect, index.facets?.techniques || [], "全部技法");
  hydrateSelect(menuFlavorSelect, index.facets?.flavors || [], "全部风味");
  if (menuIngredientChips) {
    menuIngredientChips.innerHTML = (index.facets?.topIngredients || [])
      .slice(0, 18)
      .map((ingredient) => `<button class="ingredient-chip" type="button" data-menu-ingredient="${escapeHtml(ingredient)}">${escapeHtml(ingredient)}</button>`)
      .join("");
  }
}

function hydrateSelect(select, values, emptyLabel) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = [`<option value="">${escapeHtml(emptyLabel)}</option>`]
    .concat(values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`))
    .join("");
  select.value = values.includes(current) ? current : "";
}

function renderMenuLibrary() {
  if (!menuLibraryIndex || !menuRecipeGrid) return;
  const items = filterMenuRecipes(menuLibraryIndex.items || []);
  const visibleItems = pickRandomItems(items, MENU_RENDER_LIMIT);
  if (menuLibraryShown) {
    menuLibraryShown.textContent = String(items.length);
  }
  setMenuLibraryStatus(`${items.length} 道匹配菜品${items.length > MENU_RENDER_LIMIT ? `，随机显示 ${MENU_RENDER_LIMIT} 道` : ""}`);
  updateIngredientChips();
  menuRecipeGrid.innerHTML = visibleItems.length
    ? visibleItems.map(renderRecipeCard).join("")
    : `<div class="menu-empty-state"><strong>没有匹配菜品</strong><span>换一个食材、风味或技法。</span></div>`;
}

function filterMenuRecipes(items) {
  const keyword = (menuSearchInput?.value || "").trim().toLowerCase();
  const technique = menuTechniqueSelect?.value || "";
  const flavor = menuFlavorSelect?.value || "";
  return items.filter((item) => {
    if (technique && item.technique !== technique) return false;
    if (flavor && item.flavor !== flavor) return false;
    if (activeMenuIngredient && !recipeHasIngredient(item, activeMenuIngredient)) return false;
    if (!keyword) return true;
    return String(item.searchText || "").includes(keyword) ||
      String(item.name || "").toLowerCase().includes(keyword);
  });
}

function recipeHasIngredient(item, ingredient) {
  return (item.ingredients || []).some((entry) => entry.name === ingredient);
}

function updateIngredientChips() {
  menuIngredientChips?.querySelectorAll("[data-menu-ingredient]").forEach((button) => {
    button.classList.toggle("active", button.dataset.menuIngredient === activeMenuIngredient);
  });
}

function renderRecipeCard(recipe) {
  const ingredientLine = (recipe.ingredients || [])
    .slice(0, 7)
    .map((item) => item.amount ? `${item.name}${item.amount}` : item.name)
    .join(" / ");
  return `
    <article class="recipe-card">
      <div class="recipe-card-top">
        <span>${escapeHtml(String(recipe.id).padStart(4, "0"))}</span>
        <div>
          <strong>${escapeHtml(recipe.name)}</strong>
          <small>${escapeHtml(recipe.servings || "按菜谱份量")}</small>
        </div>
      </div>
      <div class="recipe-tags">
        <span>${escapeHtml(recipe.technique || "技法")}</span>
        <span>${escapeHtml(recipe.flavor || "风味")}</span>
      </div>
      ${renderRecipeCalories(recipe)}
      <p class="recipe-ingredients">${escapeHtml(ingredientLine)}</p>
      <details class="recipe-method">
        <summary>制作方式</summary>
        <p>${escapeHtml(recipe.method)}</p>
      </details>
    </article>
  `;
}

function renderRecipeCalories(recipe) {
  const estimate = recipe.calorieEstimate;
  if (!estimate) return "";

  return `
    <div class="recipe-calories" aria-label="热量估算">
      <span><strong>${escapeHtml(estimate.totalKcal)}</strong> 整道 kcal</span>
      <span><strong>${escapeHtml(estimate.perServingKcal)}</strong> 每人 kcal</span>
    </div>
  `;
}

function setMenuLibraryStatus(text) {
  if (menuLibraryStatus) {
    menuLibraryStatus.textContent = text;
  }
}

function pickRandomItems(items, limit) {
  if (!Array.isArray(items)) return [];
  const normalizedLimit = Math.max(0, Number(limit) || 0);
  if (items.length <= normalizedLimit) return items.slice();

  const pool = items.slice();
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, normalizedLimit);
}

async function requestPlan() {
  const profile = collectProfile();

  setLoading(true);
  setStatus("正在规划", "正在生成备餐计划。", "loading");

  try {
    const response = await fetch(appUrl("/api/plan"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile
      })
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || "生成失败");
    }
    currentPlan = body.plan;
    currentMarkdown = toMarkdown(currentPlan);
    currentSvg = toSvg(currentPlan);
    renderPlan(currentPlan);
    saveCurrentPlanToHistory();
    setStatus("计划已生成", currentPlan.summary || "计划已生成。");
  } catch (error) {
    setStatus("生成失败", formatRequestError(error), "error");
  } finally {
    setLoading(false);
  }
}

function appUrl(path) {
  if (LOCAL_APP_ORIGINS.has(location.origin)) {
    return path;
  }
  const basePath = getHostedBasePath();
  if (basePath) {
    return `${basePath}${path}`;
  }
  if (location.protocol === "file:" || isLocalHost(location.hostname)) {
    return `${LOCAL_APP_ORIGIN}${path}`;
  }
  return path;
}

function getHostedBasePath() {
  const firstSegment = location.pathname.split("/").filter(Boolean)[0];
  return firstSegment ? `/${firstSegment}` : "";
}

function isLocalHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

async function loadAgentPanel() {
  const response = await fetch(appUrl("/api/agent"));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const agent = await response.json();
  if (agentTitle && agent.name) {
    agentTitle.textContent = agent.name;
  }
  if (agentProvider) {
    agentProvider.textContent = "智能规划";
  }
  if (agentReadiness) {
    agentReadiness.textContent = "执行清单已就绪";
  }
  if (agentModelPolicy && Array.isArray(agent.modelOptions)) {
    agentModelPolicy.textContent = "周计划 / 采购 / 备餐";
  }
}

function formatRequestError(error) {
  const message = String(error?.message || error || "生成失败");
  if (/failed to fetch|load failed|networkerror/i.test(message)) {
    return "智能规划服务暂时不可用，请稍后再试。";
  }
  if (/hub|api|key|provider|model|模型|供应商|密钥|deepseek|openai/i.test(message)) {
    return "智能规划服务暂时不可用，请稍后再试。";
  }
  return message;
}

function collectProfile() {
  const data = new FormData(form);
  return {
    days: 7,
    familySize: Number(data.get("familySize")),
    targetCalories: Number(data.get("targetCalories")),
    goal: data.get("goal"),
    cuisine: data.get("cuisine"),
    allergies: data.get("allergies"),
    dislikes: data.get("dislikes"),
    budget: data.get("budget"),
    prepTime: data.get("prepTime"),
    equipment: data.get("equipment"),
    pantry: data.get("pantry")
  };
}

function renderEmpty() {
  if (!weekView || !shoppingView || !prepView) return;
  weekView.innerHTML = `<div class="empty-state"><div><h3>等待生成</h3><p>周计划会显示在这里。</p></div></div>`;
  shoppingView.innerHTML = `<div class="empty-state"><div><h3>等待生成</h3><p>采购清单会显示在这里。</p></div></div>`;
  prepView.innerHTML = `<div class="empty-state"><div><h3>等待生成</h3><p>备餐流程会显示在这里。</p></div></div>`;
}

function renderPlan(plan) {
  if (!planTitle || !weekView || !shoppingView || !prepView) return;
  planTitle.textContent = plan.title;
  if (copyButton) copyButton.disabled = false;
  if (downloadButton) downloadButton.disabled = false;

  loadExecutionState(plan);
  weekView.innerHTML = `<div class="day-grid">${plan.days.map(renderDay).join("")}</div>${renderGuardrails(plan)}`;
  shoppingView.innerHTML = renderShoppingWorkspace(plan);
  prepView.innerHTML = `<div class="prep-list">${plan.batchPrep.map(renderPrep).join("")}</div>${renderGuardrails(plan)}`;
  renderCommandCenter();
  renderHistoryReviewScreen();
}

function loadExecutionState(plan) {
  executionStorageKey = createExecutionStorageKey(plan);
  try {
    const saved = localStorage.getItem(executionStorageKey);
    executionState = saved ? mergeExecutionState(plan, JSON.parse(saved)) : buildExecutionState(plan);
  } catch {
    executionState = buildExecutionState(plan);
  }
}

function persistExecutionState() {
  if (!executionStorageKey || !executionState) return;
  localStorage.setItem(executionStorageKey, JSON.stringify(executionState));
  saveCurrentPlanToHistory();
}

function rerenderExecutionViews() {
  if (!currentPlan || !executionState || !shoppingView || !prepView) return;
  shoppingView.innerHTML = renderShoppingWorkspace(currentPlan);
  prepView.innerHTML = `<div class="prep-list">${currentPlan.batchPrep.map(renderPrep).join("")}</div>${renderGuardrails(currentPlan)}`;
  renderCommandCenter();
  renderHistoryReviewScreen();
}

function loadPlanHistory() {
  try {
    const raw = localStorage.getItem(PLAN_HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePlanHistory() {
  localStorage.setItem(PLAN_HISTORY_STORAGE_KEY, JSON.stringify(planHistory));
}

function saveCurrentPlanToHistory() {
  if (!currentPlan || !executionState) return;
  const entry = buildPlanHistoryEntry(currentPlan, executionState);
  planHistory = mergePlanHistory(planHistory, entry, PLAN_HISTORY_LIMIT);
  if (!selectedHistoryPlanId) {
    selectedHistoryPlanId = entry.planId;
  }
  savePlanHistory();
  renderHistoryReviewScreen();
}

function renderHistoryReviewScreen() {
  if (!planHistoryList || !weeklyReviewContent) return;
  if (planHistoryCount) {
    planHistoryCount.textContent = String(planHistory.length);
  }
  if (historyReviewStatus) {
    historyReviewStatus.textContent = planHistory.length
      ? `已本地保存 ${planHistory.length} 份计划`
      : "生成计划后会自动保存到本机历史";
  }

  planHistoryList.innerHTML = planHistory.length
    ? planHistory.map(renderPlanHistoryCard).join("")
    : `<div class="history-empty"><strong>还没有计划历史</strong><span>先生成一份周计划，系统会自动保存本地快照。</span></div>`;

  const context = getReviewContext();
  if (!context) {
    weeklyReviewContent.innerHTML = `<div class="history-empty"><strong>等待复盘</strong><span>选择一份历史计划，或先生成当前周计划。</span></div>`;
    if (weeklyReviewSuggestion) weeklyReviewSuggestion.innerHTML = "";
    if (generateWeekReviewButton) generateWeekReviewButton.disabled = true;
    if (exportWeekReviewButton) exportWeekReviewButton.disabled = true;
    return;
  }

  if (generateWeekReviewButton) generateWeekReviewButton.disabled = false;
  if (exportWeekReviewButton) exportWeekReviewButton.disabled = false;
  weeklyReviewContent.innerHTML = renderWeeklyReviewSummary(context.plan, context.executionState);
  if (weeklyReviewSuggestion) {
    weeklyReviewSuggestion.innerHTML = renderWeeklyReviewSuggestion();
  }
}

function renderPlanHistoryCard(entry) {
  const isActive = entry.planId === getReviewContext()?.planId;
  return `
    <article class="${isActive ? "plan-history-card active" : "plan-history-card"}">
      <div>
        <strong>${escapeHtml(entry.title)}</strong>
        <span>${escapeHtml(formatRecordTime(entry.savedAt))} · ${entry.dayCount} 天 · ${entry.mealCount} 餐</span>
      </div>
      <div class="history-progress">
        <span>${entry.completionRate}%</span>
        <small>${entry.mealsDone}/${entry.mealsTotal} 餐 · ${entry.replacementsTotal} 次替换</small>
      </div>
      <div class="history-card-actions">
        <button type="button" data-history-action="open" data-plan-id="${escapeHtml(entry.planId)}">打开</button>
        <button type="button" data-history-action="review" data-plan-id="${escapeHtml(entry.planId)}">复盘</button>
        <button type="button" data-history-action="delete" data-plan-id="${escapeHtml(entry.planId)}">删除</button>
      </div>
    </article>
  `;
}

function renderWeeklyReviewSummary(plan, state) {
  const summary = summarizeWeeklyReview(plan, state);
  return `
    <div class="review-summary-grid">
      ${renderReviewMetric("完成率", `${summary.completionRate}%`, `${summary.mealsDone}/${summary.mealsTotal} 餐已处理`)}
      ${renderReviewMetric("采购", `${summary.shoppingDone}/${summary.shoppingTotal}`, `${summary.shoppingCompletionRate}%`)}
      ${renderReviewMetric("备餐", `${summary.prepDone}/${summary.prepTotal}`, `${summary.prepCompletionRate}%`)}
      ${renderReviewMetric("替换", `${summary.replacementsTotal}`, `${summary.mealsSkipped} 餐跳过`)}
    </div>
    <div class="review-replacement-list">
      <strong>${escapeHtml(summary.title)}</strong>
      ${(summary.replacementNames.length ? summary.replacementNames : ["暂无替换记录"]).map((name) => `<span>${escapeHtml(name)}</span>`).join("")}
    </div>
  `;
}

function renderReviewMetric(label, value, meta) {
  return `
    <article>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(meta)}</small>
    </article>
  `;
}

function renderWeeklyReviewSuggestion() {
  if (!weeklyReviewResult) {
    return `<div class="review-suggestion-empty">生成建议后，这里会显示下周可直接放进 prompt 的调整方向。</div>`;
  }

  return `
    <article>
      <strong>${escapeHtml(weeklyReviewResult.summary)}</strong>
      ${renderSuggestionSection("做得好的地方", weeklyReviewResult.wins)}
      ${renderSuggestionSection("卡点", weeklyReviewResult.frictions)}
      ${renderSuggestionSection("下周调整", weeklyReviewResult.nextWeekAdjustments)}
      ${renderSuggestionSection("Prompt 提示", weeklyReviewResult.promptHints)}
    </article>
  `;
}

function renderSuggestionSection(title, items) {
  return `
    <div>
      <span>${escapeHtml(title)}</span>
      <ul>${(items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>
  `;
}

function getReviewContext() {
  const selected = planHistory.find((entry) => entry.planId === selectedHistoryPlanId);
  if (selected) {
    return {
      planId: selected.planId,
      plan: selected.plan,
      executionState: selected.executionState
    };
  }
  if (currentPlan && executionState) {
    return {
      planId: executionState.planId,
      plan: currentPlan,
      executionState
    };
  }
  return null;
}

function handlePlanHistoryClick(event) {
  const button = event.target.closest("[data-history-action]");
  if (!button) return;

  const planId = button.dataset.planId;
  const action = button.dataset.historyAction;
  const entry = planHistory.find((candidate) => candidate.planId === planId);

  if (action === "delete") {
    planHistory = deletePlanHistoryEntry(planHistory, planId);
    if (selectedHistoryPlanId === planId) selectedHistoryPlanId = "";
    savePlanHistory();
    renderHistoryReviewScreen();
    return;
  }

  if (!entry) return;
  selectedHistoryPlanId = entry.planId;
  weeklyReviewResult = null;

  if (action === "open") {
    currentPlan = entry.plan;
    currentMarkdown = toMarkdown(currentPlan);
    currentSvg = toSvg(currentPlan);
    executionStorageKey = createExecutionStorageKey(currentPlan);
    executionState = entry.executionState;
    localStorage.setItem(executionStorageKey, JSON.stringify(executionState));
    renderPlan(currentPlan);
    switchScreen("commandCenterScreen");
    return;
  }

  renderHistoryReviewScreen();
}

async function handleGenerateWeekReview() {
  const context = getReviewContext();
  if (!context) return;

  weeklyFeedbackDraft = weeklyFeedback?.value || weeklyFeedbackDraft;
  const originalText = generateWeekReviewButton?.textContent || "生成建议";
  try {
    if (generateWeekReviewButton) {
      generateWeekReviewButton.disabled = true;
      generateWeekReviewButton.textContent = "生成中";
    }
    const response = await fetch(appUrl("/api/review-week"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: context.plan,
        executionState: context.executionState,
        feedback: weeklyFeedbackDraft
      })
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || "周复盘生成失败");
    }
    weeklyReviewResult = body.review;
    setStatus(body.mode === "fallback" ? "本地复盘" : "智能复盘", "周复盘建议已生成。", "loading");
    renderHistoryReviewScreen();
  } catch (error) {
    setStatus("复盘失败", formatRequestError(error), "error");
  } finally {
    if (generateWeekReviewButton) {
      generateWeekReviewButton.disabled = false;
      generateWeekReviewButton.textContent = originalText;
    }
  }
}

function handleExportWeekReview() {
  const context = getReviewContext();
  if (!context) return;
  weeklyFeedbackDraft = weeklyFeedback?.value || weeklyFeedbackDraft;
  const markdown = buildWeeklyReviewMarkdown(context.plan, context.executionState, weeklyFeedbackDraft, weeklyReviewResult);
  downloadTextFile("ai-cooking-weekly-review.md", markdown, "text/markdown;charset=utf-8");
}

function downloadTextFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderCommandCenter() {
  if (!commandCenterEmpty || !commandCenterBoard) return;

  if (!currentPlan || !executionState) {
    commandCenterEmpty.hidden = false;
    commandCenterBoard.hidden = true;
    if (commandCenterStatus) {
      commandCenterStatus.textContent = "等待一份已生成的周计划";
    }
    return;
  }

  const selectedDay = currentPlan.days?.[executionState.selectedDayIndex] || currentPlan.days?.[0];
  commandCenterEmpty.hidden = true;
  commandCenterBoard.hidden = false;
  if (commandCenterStatus) {
    commandCenterStatus.textContent = `${currentPlan.title} · ${selectedDay?.day || "第 1 天"}`;
  }
  if (commandMetricGrid) {
    commandMetricGrid.innerHTML = renderCommandMetrics();
  }
  if (commandNextTask) {
    commandNextTask.innerHTML = renderNextTaskCard();
  }
  if (commandDayTabs) {
    commandDayTabs.innerHTML = renderCommandDayTabs();
  }
  if (todayCookingView) {
    todayCookingView.innerHTML = renderTodayCookingView();
  }
  if (replacementHistory) {
    replacementHistory.innerHTML = renderReplacementHistory();
  }
}

function renderCommandMetrics() {
  const summary = summarizeExecutionState(executionState);
  return [
    renderCommandMetric("总进度", `${summary.totalDone}/${summary.totalCount}`, `${completionRate(summary.totalDone, summary.totalCount)}%`),
    renderCommandMetric("采购", `${summary.shoppingDone}/${summary.shoppingTotal}`, "Shopping"),
    renderCommandMetric("备餐", `${summary.prepDone}/${summary.prepTotal}`, "Batch prep"),
    renderCommandMetric("餐食", `${summary.mealsDone}/${summary.mealsTotal}`, `${summary.replacementsTotal} 次调整`)
  ].join("");
}

function renderCommandMetric(label, value, meta) {
  return `
    <article>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(meta)}</small>
    </article>
  `;
}

function completionRate(done, total) {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}

function renderNextTaskCard() {
  const nextTask = findNextExecutionTask();
  return `
    <p class="eyebrow">Next Move</p>
    <h3>下一步</h3>
    <strong>${escapeHtml(nextTask.title)}</strong>
    <span>${escapeHtml(nextTask.detail)}</span>
  `;
}

function findNextExecutionTask() {
  for (const [groupIndex, group] of (currentPlan.shoppingList || []).entries()) {
    const itemIndex = (group.items || []).findIndex((_, index) => !executionState.shopping?.[groupIndex]?.[index]);
    if (itemIndex >= 0) {
      return {
        title: "先完成采购",
        detail: shoppingItemDisplay(group.items[itemIndex])
      };
    }
  }

  const prepIndex = (currentPlan.batchPrep || []).findIndex((_, index) => !executionState.prep?.[index]);
  if (prepIndex >= 0) {
    const task = currentPlan.batchPrep[prepIndex];
    return {
      title: "继续备餐",
      detail: `${task.time} · ${task.task}`
    };
  }

  for (const [dayIndex, day] of (currentPlan.days || []).entries()) {
    const mealIndex = (day.meals || []).findIndex((_, index) => executionState.meals?.[createMealKey(dayIndex, index)] === "pending");
    if (mealIndex >= 0) {
      return {
        title: `${day.day} 待完成餐食`,
        detail: day.meals[mealIndex].name
      };
    }
  }

  return {
    title: "本周执行完成",
    detail: "可以根据调整记录复盘下一轮计划。"
  };
}

function renderCommandDayTabs() {
  return (currentPlan.days || []).map((day, dayIndex) => {
    const isActive = dayIndex === executionState.selectedDayIndex;
    const done = (day.meals || []).filter((_, mealIndex) => executionState.meals?.[createMealKey(dayIndex, mealIndex)] !== "pending").length;
    return `
      <button class="${isActive ? "command-day-tab active" : "command-day-tab"}" type="button" data-command-day="${dayIndex}" aria-selected="${isActive}">
        <strong>${escapeHtml(day.day)}</strong>
        <span>${done}/${day.meals?.length || 0}</span>
      </button>
    `;
  }).join("");
}

function renderTodayCookingView() {
  const dayIndex = executionState.selectedDayIndex || 0;
  const day = currentPlan.days?.[dayIndex];
  if (!day) {
    return `<div class="command-empty inline"><strong>没有这一天的餐食</strong><span>请切换到其他日期。</span></div>`;
  }

  return (day.meals || [])
    .map((meal, mealIndex) => renderMealCommandCard(day, meal, dayIndex, mealIndex))
    .join("");
}

function renderMealCommandCard(day, meal, dayIndex, mealIndex) {
  const mealKey = createMealKey(dayIndex, mealIndex);
  const status = executionState.meals?.[mealKey] || "pending";
  const replacement = latestReplacementForMeal(mealKey);
  const displayMeal = replacement?.replacement || meal;
  const isReplaced = Boolean(replacement);
  const steps = Array.isArray(displayMeal.steps) ? displayMeal.steps : [];
  const ingredients = Array.isArray(displayMeal.ingredients) ? displayMeal.ingredients : [];

  return `
    <article class="meal-command-card ${statusClass(status)}">
      <div class="meal-command-head">
        <div>
          <span class="slot-pill">${escapeHtml(meal.slot)}</span>
          <h3>${escapeHtml(displayMeal.name || meal.name)}</h3>
        </div>
        <span class="meal-status-pill">${escapeHtml(mealStatusLabel(status))}</span>
      </div>
      ${isReplaced ? `<p class="replacement-note">替代原餐：${escapeHtml(meal.name)} · ${escapeHtml(replacement.nutritionDelta)}</p>` : ""}
      <div class="meal-meta">
        <span class="nutrition-chip"><strong>${Number(displayMeal.calories || meal.calories || 0)}</strong> kcal</span>
        <span class="nutrition-chip"><strong>${Number(displayMeal.protein || meal.protein || 0)}</strong> g 蛋白</span>
        <span class="nutrition-chip">${escapeHtml(displayMeal.leftovers || meal.leftovers || day.theme || "按计划执行")}</span>
      </div>
      <p class="ingredient-line">${ingredients.slice(0, 5).map(escapeHtml).join(" / ") || "按计划准备食材"}</p>
      <ul class="meal-steps compact">${steps.slice(0, 6).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ul>
      <div class="meal-command-actions">
        <button type="button" data-meal-status data-meal-key="${mealKey}" data-status="cooked">完成</button>
        <button type="button" data-meal-status data-meal-key="${mealKey}" data-status="skipped">跳过</button>
        <button type="button" data-meal-status data-meal-key="${mealKey}" data-status="pending">重置</button>
        <button class="accent" type="button" data-meal-replace data-meal-key="${mealKey}">应急替换</button>
      </div>
      <form class="replacement-form" data-replacement-form data-meal-key="${mealKey}" hidden>
        <label>
          <span>调整原因</span>
          <select name="reason">
            <option value="缺少关键食材">缺少关键食材</option>
            <option value="今天时间不够">今天时间不够</option>
            <option value="想换口味">想换口味</option>
            <option value="热量或蛋白需要调整">热量或蛋白需要调整</option>
          </select>
        </label>
        <label>
          <span>当前约束</span>
          <textarea name="constraints" rows="2" placeholder="例如：家里只有豆腐和鸡蛋，今晚只有 15 分钟"></textarea>
        </label>
        <button class="primary-button slim-button" type="submit">生成替代餐</button>
      </form>
    </article>
  `;
}

function latestReplacementForMeal(mealKey) {
  return [...(executionState.replacements || [])].reverse().find((record) => record.mealKey === mealKey);
}

function statusClass(status) {
  return `meal-status-${status}`;
}

function mealStatusLabel(status) {
  return {
    pending: "待执行",
    cooked: "已完成",
    skipped: "已跳过",
    replaced: "已替换"
  }[status] || "待执行";
}

function renderReplacementHistory() {
  const records = executionState.replacements || [];
  if (!records.length) {
    return `
      <p class="eyebrow">Adjustment Log</p>
      <h3>调整记录</h3>
      <div class="replacement-empty">临时替换会记录在这里，方便复盘下周菜单。</div>
    `;
  }

  return `
    <p class="eyebrow">Adjustment Log</p>
    <h3>调整记录</h3>
    <div class="replacement-list">
      ${records.slice().reverse().map((record) => `
        <article>
          <span>${escapeHtml(formatRecordTime(record.createdAt))}</span>
          <strong>${escapeHtml(record.originalName)} → ${escapeHtml(record.replacementName)}</strong>
          <small>${escapeHtml(record.reason)} · ${escapeHtml(record.nutritionDelta)}</small>
        </article>
      `).join("")}
    </div>
  `;
}

function formatRecordTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function handleCommandDayClick(event) {
  const button = event.target.closest("[data-command-day]");
  if (!button || !currentPlan || !executionState) return;

  executionState = updateSelectedDay(currentPlan, executionState, Number(button.dataset.commandDay));
  persistExecutionState();
  renderCommandCenter();
}

function handleMealStatusClick(event) {
  const button = event.target.closest("[data-meal-status]");
  if (!button || !executionState) return;

  executionState = updateMealStatus(executionState, button.dataset.mealKey, button.dataset.status);
  persistExecutionState();
  renderCommandCenter();
}

function handleMealReplacementToggle(event) {
  const button = event.target.closest("[data-meal-replace]");
  if (!button) return;

  const form = todayCookingView?.querySelector(`[data-replacement-form][data-meal-key="${button.dataset.mealKey}"]`);
  if (!form) return;
  form.hidden = !form.hidden;
}

async function handleMealReplacementSubmit(event) {
  const form = event.target.closest("[data-replacement-form]");
  if (!form || !currentPlan || !executionState) return;
  event.preventDefault();

  const mealKey = form.dataset.mealKey;
  const formData = new FormData(form);
  const submitButton = form.querySelector("button[type='submit']");
  const originalText = submitButton?.textContent || "生成替代餐";

  try {
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "生成中";
    }
    const response = await fetch(appUrl("/api/adjust-meal"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: currentPlan,
        mealKey,
        reason: formData.get("reason"),
        constraints: formData.get("constraints")
      })
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || "替换餐生成失败");
    }

    executionState = addReplacement(executionState, {
      ...body.adjustment,
      createdAt: body.adjustment.createdAt || new Date().toISOString()
    });
    persistExecutionState();
    setStatus(body.mode === "fallback" ? "规则替换" : "智能替换", "替代餐已加入执行中心。", "loading");
    renderCommandCenter();
  } catch (error) {
    setStatus("替换失败", formatRequestError(error), "error");
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  }
}

function renderDay(day) {
  return `
    <article class="day-card">
      <div class="day-head">
        <div>
          <strong>${escapeHtml(day.day)}</strong>
          <span>${escapeHtml(day.theme)}</span>
        </div>
        <div>${day.totalCalories} kcal / ${day.totalProtein}g protein</div>
      </div>
      <div class="meal-list">
        ${day.meals.map(renderMeal).join("")}
      </div>
    </article>
  `;
}

function renderMeal(meal) {
  return `
    <article class="meal-card">
      <div class="meal-card-head">
        <div class="slot-pill">${escapeHtml(meal.slot)}</div>
        <h3>${escapeHtml(meal.name)}</h3>
      </div>
      <div class="meal-meta">
        <span class="nutrition-chip"><strong>${meal.calories}</strong> kcal</span>
        <span class="nutrition-chip"><strong>${meal.protein}</strong> g 蛋白</span>
        <span class="nutrition-chip">${escapeHtml(meal.time)}</span>
      </div>
      <p class="meal-summary">${escapeHtml(meal.leftovers)}</p>
      <p class="ingredient-line">${meal.ingredients.slice(0, 4).map(escapeHtml).join(" / ")}</p>
      <ul class="meal-steps">${meal.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ul>
    </article>
  `;
}

function renderShoppingWorkspace(plan) {
  return `
    <div class="shopping-workspace">
      <div class="shopping-main-column">
        ${renderExecutionProgress()}
        ${renderProcurementModePanel(plan)}
        <div class="shopping-grid">${(plan.shoppingList || []).map(renderShoppingGroup).join("")}</div>
      </div>
      ${renderShoppingOverview(plan)}
    </div>
  `;
}

function renderProcurementModePanel(plan) {
  const items = buildProcurementItems(plan.shoppingList || [], executionState?.shopping || []);
  const visibleItems = filterProcurementItems(items, activeProcurementFilter);
  const summary = summarizeProcurement(items);
  const filterOptions = [
    ["pending", "未购"],
    ["all", "全部"],
    ["done", "已购"]
  ];

  return `
    <section class="procurement-mode-panel" aria-label="采购模式">
      <div class="procurement-mode-head">
        <div>
          <p class="eyebrow">Procurement Mode</p>
          <h3>手机采购模式</h3>
        </div>
        <button class="shopping-copy-button" type="button" data-shopping-copy>复制清单</button>
      </div>
      <div class="procurement-filter-row" role="group" aria-label="采购筛选">
        ${filterOptions.map(([value, label]) => `
          <button type="button" data-procurement-filter="${value}" aria-pressed="${activeProcurementFilter === value}">
            ${label}
          </button>
        `).join("")}
      </div>
      <div class="procurement-stats" aria-label="采购统计">
        <span><strong>${summary.pendingCount}</strong><small>未购</small></span>
        <span><strong>${summary.completedCount}</strong><small>已购</small></span>
        <span><strong>${formatCurrency(summary.pendingCost)}</strong><small>待买金额</small></span>
      </div>
      <div class="procurement-list">
        ${visibleItems.length ? visibleItems.map(renderProcurementItem).join("") : `<div class="procurement-empty">当前筛选下没有采购项。</div>`}
      </div>
    </section>
  `;
}

function renderProcurementItem(item) {
  const refs = item.sourceRefs
    .map((ref) => `${ref.groupIndex}:${ref.itemIndex}`)
    .join("|");
  const amount = item.amountText ? `<span>${escapeHtml(item.amountText)}</span>` : "";
  const cost = item.estimatedCost > 0 ? `<small>${escapeHtml(formatCurrency(item.estimatedCost))}</small>` : "";
  const categories = item.categories.join(" / ");
  return `
    <article class="${item.isComplete ? "procurement-item is-complete" : "procurement-item"}">
      <button type="button" data-procurement-check="${escapeHtml(refs)}" aria-pressed="${item.isComplete}">
        ${item.isComplete ? "已购" : "未购"}
      </button>
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        ${amount}
        <em>${escapeHtml(categories)}${item.sourceCount > 1 ? ` · 合并 ${item.sourceCount} 项` : ""}</em>
      </div>
      ${cost}
    </article>
  `;
}

function renderExecutionProgress() {
  if (!executionState) return "";
  const summary = summarizeExecutionState(executionState);
  return `
    <div class="execution-progress" aria-label="执行进度">
      <strong>${summary.totalDone}/${summary.totalCount}</strong>
      <span>已完成执行项</span>
      <small>采购 ${summary.shoppingDone}/${summary.shoppingTotal} · 备餐 ${summary.prepDone}/${summary.prepTotal}</small>
    </div>
  `;
}

function renderShoppingOverview(plan) {
  const stats = summarizeShoppingList(plan.shoppingList || []);
  const planDays = Array.isArray(plan.days) && plan.days.length ? plan.days.length : 7;

  return `
    <aside class="shopping-summary-panel" aria-label="采购总览">
      <div class="shopping-summary-head">
        <p class="eyebrow">Shopping Board</p>
        <h3>采购总览</h3>
        <span>${planDays} 天备餐</span>
      </div>
      <div class="shopping-metric-grid">
        <span><strong>${stats.itemCount}</strong><small>采购项</small></span>
        <span><strong>${stats.categoryCount}</strong><small>分类</small></span>
        <span><strong>${formatCurrency(stats.totalCost)}</strong><small>估算总价</small></span>
        <span><strong>${stats.nutritionMatchedCount}/${stats.itemCount}</strong><small>营养可查</small></span>
      </div>
      <div class="shopping-summary-note">
        <strong>采购整体营养</strong>
        <span>点击左侧“营养”后，只展开按购买克重估算的整体营养，底层匹配细节继续隐藏。</span>
      </div>
      <ul class="shopping-category-list">
        ${stats.categories.map((entry) => `
          <li>
            <span>${escapeHtml(entry.category)}</span>
            <strong>${entry.count} 项</strong>
          </li>
        `).join("")}
      </ul>
    </aside>
  `;
}

function summarizeShoppingList(groups = []) {
  const categories = groups.map((group) => ({
    category: group.category || "未分类",
    count: group.items?.length || 0
  }));
  const items = groups.flatMap((group) => group.items || []);

  return {
    categoryCount: groups.length,
    itemCount: items.length,
    totalCost: items.reduce((sum, item) => sum + numericCost(item.estimatedCost), 0),
    nutritionMatchedCount: items.filter((item) => item.nutritionStatus === "matched" || item.rag?.name).length,
    categories
  };
}

function numericCost(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatCurrency(value) {
  if (!Number.isFinite(value) || value <= 0) return "待估";
  return `¥${Math.round(value)}`;
}

function renderShoppingGroup(group, groupIndex) {
  return `
    <article class="list-card">
      <h3>${escapeHtml(group.category)}</h3>
      <ul class="shopping-list">
        ${group.items.map((item, itemIndex) => renderShoppingItem(item, groupIndex, itemIndex)).join("")}
      </ul>
    </article>
  `;
}

function renderShoppingItem(item, groupIndex, itemIndex) {
  const panelId = `nutrition-${groupIndex}-${itemIndex}`;
  const isChecked = Boolean(executionState?.shopping?.[groupIndex]?.[itemIndex]);
  return `
    <li class="${isChecked ? "shopping-item is-complete" : "shopping-item"}">
      <button class="shopping-check-button" type="button" data-shopping-check data-shopping-group="${groupIndex}" data-shopping-item="${itemIndex}" aria-pressed="${isChecked}">
        <span>${isChecked ? "已买" : "未买"}</span>
      </button>
      <button class="shopping-item-trigger" type="button" data-shopping-group="${groupIndex}" data-shopping-item="${itemIndex}" aria-expanded="false" aria-controls="${panelId}">
        <span>${escapeHtml(shoppingItemDisplay(item))}</span>
        <small>营养</small>
      </button>
      <div class="nutrition-panel" id="${panelId}" hidden></div>
    </li>
  `;
}

function renderPrep(item, taskIndex) {
  const isChecked = Boolean(executionState?.prep?.[taskIndex]);
  return `
    <article class="${isChecked ? "prep-card is-complete" : "prep-card"}">
      <button class="prep-check-button" type="button" data-prep-check data-prep-task="${taskIndex}" aria-pressed="${isChecked}">
        ${isChecked ? "完成" : "待做"}
      </button>
      <strong>${escapeHtml(item.time)}</strong>
      <span>${escapeHtml(item.task)}</span>
      <small>${escapeHtml(item.duration)}</small>
    </article>
  `;
}

function renderGuardrails(plan) {
  if (!plan.guardrails?.length) return "";
  return `
    <aside class="guardrail-card">
      <h3>营养边界</h3>
      <ul>${plan.guardrails.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </aside>
  `;
}

function toMarkdown(plan) {
  const lines = [`# ${plan.title}`, "", plan.summary || "", ""];
  for (const day of plan.days) {
    lines.push(`## ${day.day} - ${day.theme}`);
    lines.push(`总计：${day.totalCalories} kcal / ${day.totalProtein}g 蛋白`, "");
    for (const meal of day.meals) {
      lines.push(`### ${meal.slot}：${meal.name}`);
      lines.push(`- 热量：${meal.calories} kcal`);
      lines.push(`- 蛋白：${meal.protein}g`);
      lines.push(`- 时间：${meal.time}`);
      lines.push(`- 保存：${meal.leftovers}`);
      lines.push(`- 食材：${meal.ingredients.join("，") || "按需准备"}`);
      lines.push(`- 做法：${meal.steps.join("；") || "按常规少油烹调"}`, "");
    }
  }
  lines.push("## 采购清单");
  for (const group of plan.shoppingList) {
    lines.push(`- ${group.category}: ${group.items.map(shoppingItemDisplay).join("，")}`);
  }
  lines.push("", "## 备餐流程");
  for (const item of plan.batchPrep) {
    lines.push(`- ${item.time}: ${item.task} (${item.duration})`);
  }
  lines.push("", "## 营养边界");
  for (const item of plan.guardrails) {
    lines.push(`- ${item}`);
  }
  return lines.join("\n");
}

function toSvg(plan) {
  const width = 1400;
  const margin = 56;
  const cardWidth = width - margin * 2;
  const nodes = [];
  let y = 72;

  nodes.push(`<rect width="${width}" height="__HEIGHT__" fill="#f7f4ee"/>`);
  nodes.push(`<rect x="24" y="24" width="${width - 48}" height="__INNER_HEIGHT__" rx="18" fill="#fffdf8" stroke="#24302b" stroke-width="3"/>`);
  nodes.push(`<text x="${margin}" y="${y}" class="eyebrow">AI COOKING COACH</text>`);
  y += 48;
  nodes.push(`<text x="${margin}" y="${y}" class="title">${svgEscape(plan.title)}</text>`);
  y += 36;
  y = addWrappedText(nodes, plan.summary || "家庭减脂备餐计划", margin, y, 58, "summary", 28);
  y += 18;

  for (const day of plan.days) {
    const cardTop = y;
    const rectIndex = nodes.length;
    nodes.push("");
    y += 42;
    nodes.push(`<text x="${margin + 26}" y="${y}" class="day-title">${svgEscape(day.day)}  ${svgEscape(day.theme)}</text>`);
    nodes.push(`<text x="${width - margin - 280}" y="${y}" class="day-total">${day.totalCalories} kcal / ${day.totalProtein}g 蛋白</text>`);
    y += 34;

    for (const meal of day.meals) {
      nodes.push(`<text x="${margin + 30}" y="${y}" class="meal-slot">${svgEscape(meal.slot)}</text>`);
      nodes.push(`<text x="${margin + 112}" y="${y}" class="meal-name">${svgEscape(meal.name)}</text>`);
      nodes.push(`<text x="${width - margin - 320}" y="${y}" class="meal-meta">${meal.calories} kcal · ${meal.protein}g · ${svgEscape(meal.time)}</text>`);
      y += 28;
      const detail = `${meal.leftovers} / ${meal.ingredients.slice(0, 3).join(" / ")}`;
      y = addWrappedText(nodes, detail, margin + 112, y, 62, "meal-detail", 24);
      if (meal.steps.length) {
        y = addWrappedText(nodes, `做法：${meal.steps.slice(0, 2).join("；")}`, margin + 112, y, 62, "meal-step", 24);
      }
      y += 12;
    }

    const cardHeight = y - cardTop + 18;
    nodes[rectIndex] = `<rect x="${margin}" y="${cardTop}" width="${cardWidth}" height="${cardHeight}" rx="14" fill="#ffffff" stroke="#d9d5ca"/>`;
    y += 20;
  }

  y = addSvgSection(nodes, "采购清单", plan.shoppingList.map((group) => `${group.category}: ${group.items.map(shoppingItemDisplay).join("，")}`), margin, y);
  y = addSvgSection(nodes, "备餐流程", plan.batchPrep.map((item) => `${item.time}: ${item.task} (${item.duration})`), margin, y);

  const height = y + 56;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${svgEscape(plan.title)}">
  <style>
    .eyebrow{font:700 18px "Microsoft YaHei",sans-serif;letter-spacing:2px;fill:#f06a3e}
    .title{font:800 42px "Microsoft YaHei",sans-serif;fill:#24302b}
    .summary{font:400 22px "Microsoft YaHei",sans-serif;fill:#66736d}
    .day-title{font:800 27px "Microsoft YaHei",sans-serif;fill:#24302b}
    .day-total{font:700 22px "Microsoft YaHei",sans-serif;fill:#557c55}
    .meal-slot{font:800 20px "Microsoft YaHei",sans-serif;fill:#f06a3e}
    .meal-name{font:800 22px "Microsoft YaHei",sans-serif;fill:#24302b}
    .meal-meta{font:700 19px "Microsoft YaHei",sans-serif;fill:#3f6f8f}
    .meal-detail,.meal-step,.section-line{font:400 19px "Microsoft YaHei",sans-serif;fill:#66736d}
    .section-title{font:800 28px "Microsoft YaHei",sans-serif;fill:#24302b}
  </style>
  ${nodes.join("\n  ").replaceAll("__HEIGHT__", String(height)).replaceAll("__INNER_HEIGHT__", String(height - 48))}
</svg>`;
  return svg;
}

function addSvgSection(nodes, title, items, x, y) {
  nodes.push(`<text x="${x}" y="${y + 22}" class="section-title">${svgEscape(title)}</text>`);
  y += 58;
  for (const item of items.slice(0, 8)) {
    y = addWrappedText(nodes, `- ${item}`, x + 8, y, 70, "section-line", 24);
  }
  return y + 18;
}

function addWrappedText(nodes, text, x, y, maxChars, className, lineHeight) {
  const lines = wrapSvgText(text, maxChars);
  for (const line of lines) {
    nodes.push(`<text x="${x}" y="${y}" class="${className}">${svgEscape(line)}</text>`);
    y += lineHeight;
  }
  return y;
}

function wrapSvgText(value, maxChars) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return [""];
  const lines = [];
  let current = "";
  for (const char of text) {
    current += char;
    if (current.length >= maxChars || /[；。]/.test(char)) {
      lines.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

async function handleShoppingNutritionClick(event) {
  const button = event.target.closest(".shopping-item-trigger");
  if (!button) return;

  const panel = document.querySelector(`#${button.getAttribute("aria-controls")}`);
  if (!panel) return;

  const expanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!expanded));
  panel.hidden = expanded;
  if (expanded) return;

  const groupIndex = Number(button.dataset.shoppingGroup);
  const itemIndex = Number(button.dataset.shoppingItem);
  const item = currentPlan?.shoppingList?.[groupIndex]?.items?.[itemIndex];
  panel.innerHTML = `<div class="nutrition-loading">正在检索食材营养库...</div>`;

  try {
    const index = await loadNutritionIndex();
    const result = findNutritionMatch(item, index);
    panel.innerHTML = renderNutritionResult(result, item, index);
  } catch (error) {
    panel.innerHTML = `<div class="nutrition-empty">营养索引暂时无法加载：${escapeHtml(error.message)}</div>`;
  }
}

function handleShoppingCheckClick(event) {
  const button = event.target.closest("[data-shopping-check]");
  if (!button || !executionState) return;

  const groupIndex = Number(button.dataset.shoppingGroup);
  const itemIndex = Number(button.dataset.shoppingItem);
  const checked = button.getAttribute("aria-pressed") !== "true";

  executionState = updateShoppingItem(executionState, groupIndex, itemIndex, checked);
  persistExecutionState();
  rerenderExecutionViews();
}

function handleProcurementFilterClick(event) {
  const button = event.target.closest("[data-procurement-filter]");
  if (!button) return;

  activeProcurementFilter = button.dataset.procurementFilter || "pending";
  rerenderExecutionViews();
}

function handleProcurementCheckClick(event) {
  const button = event.target.closest("[data-procurement-check]");
  if (!button || !executionState) return;

  const checked = button.getAttribute("aria-pressed") !== "true";
  const refs = String(button.dataset.procurementCheck || "")
    .split("|")
    .map((value) => value.split(":").map(Number))
    .filter(([groupIndex, itemIndex]) => Number.isInteger(groupIndex) && Number.isInteger(itemIndex));

  for (const [groupIndex, itemIndex] of refs) {
    executionState = updateShoppingItem(executionState, groupIndex, itemIndex, checked);
  }
  persistExecutionState();
  rerenderExecutionViews();
}

async function handleShoppingCopyClick(event) {
  const button = event.target.closest("[data-shopping-copy]");
  if (!button || !currentPlan) return;

  const items = buildProcurementItems(currentPlan.shoppingList || [], executionState?.shopping || []);
  const text = buildShoppingCopyText(items, {
    title: `${currentPlan.title || "AI Cooking Coach"} 采购清单`,
    filter: activeProcurementFilter
  });

  try {
    await navigator.clipboard.writeText(text);
    setStatus("采购清单已复制", "采购清单已复制，可以粘贴到微信或备忘录。", "loading");
  } catch {
    setStatus("复制失败", "当前浏览器不允许直接复制，请使用页面导出或手动选择文本。", "error");
  }
}

function handlePrepCheckClick(event) {
  const button = event.target.closest("[data-prep-check]");
  if (!button || !executionState) return;

  const taskIndex = Number(button.dataset.prepTask);
  const checked = button.getAttribute("aria-pressed") !== "true";

  executionState = updatePrepTask(executionState, taskIndex, checked);
  persistExecutionState();
  rerenderExecutionViews();
}

function loadNutritionIndex() {
  if (nutritionIndex) {
    return Promise.resolve(nutritionIndex);
  }
  if (!nutritionIndexPromise) {
    nutritionIndexPromise = fetch(NUTRITION_INDEX_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((index) => {
        nutritionIndex = index;
        return index;
      });
  }
  return nutritionIndexPromise;
}

function findNutritionMatch(item, index) {
  const query = buildNutritionQuery(item);
  if (!query.terms.length || !Array.isArray(index.items)) {
    return { status: "none", query, matches: [] };
  }

  const matches = index.items
    .map((entry) => ({ entry, score: scoreNutritionEntry(entry, query) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  if (!matches.length) {
    return { status: "none", query, matches: [] };
  }

  const status = matches[0].score >= 12 ? "matched" : "near";
  return { status, query, matches };
}

function buildNutritionQuery(item) {
  const display = shoppingItemDisplay(item);
  const rawName = String(item?.name || display || "").trim();
  const cleaned = rawName
    .replace(/\d+(?:\.\d+)?\s*(?:kg|g|克|千克|斤|个|颗|盒|瓶|袋|ml|l|升|份)/gi, "")
    .replace(/[，,、+＋/]/g, " ")
    .trim();
  const alias = NUTRITION_QUERY_ALIASES.find((candidate) =>
    candidate.names.some((name) => cleaned.includes(name))
  );

  if (alias) {
    return {
      label: alias.names[0],
      display,
      terms: alias.terms,
      prefer: alias.prefer || [],
      avoid: alias.avoid || []
    };
  }

  const englishTerms = cleaned
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((token) => token.length >= 3);
  const fallbackTerms = [...englishTerms];
  if (/[\u4e00-\u9fff]/.test(cleaned)) {
    fallbackTerms.unshift(cleaned);
  }
  if (!fallbackTerms.length && cleaned) {
    fallbackTerms.push(cleaned.toLowerCase());
  }

  return {
    label: cleaned || display,
    display,
    terms: [...new Set(fallbackTerms)],
    prefer: [],
    avoid: []
  };
}

function scoreNutritionEntry(entry, query) {
  const name = String(entry.name || "").toLowerCase();
  const text = String(entry.searchText || entry.name || "").toLowerCase();
  let score = 0;

  for (const term of query.terms) {
    const normalized = term.toLowerCase();
    if (text.includes(normalized)) {
      score += 9 + Math.min(normalized.length, 16) / 2;
    } else {
      const tokens = normalized.split(/\s+/).filter(Boolean);
      const tokenHits = tokens.filter((token) => text.includes(token)).length;
      score += tokenHits * 2.5;
    }
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
  if (query.terms.some((term) => name.startsWith(term.toLowerCase()))) {
    score += 3;
  }
  return score;
}

function renderNutritionResult(result, item, index) {
  const amountGrams = parseAmountGrams(item?.amount || shoppingItemDisplay(item));

  if (!result.matches.length) {
    return `
      <div class="nutrition-empty">
        <strong>采购整体营养暂不可估算</strong>
        <span>当前采购项没有足够接近的营养数据。</span>
      </div>
    `;
  }

  if (!amountGrams) {
    return `
      <div class="nutrition-empty">
        <strong>采购整体营养暂不可估算</strong>
        <span>请在采购数量里写明克或千克，例如 300g 或 0.5kg。</span>
      </div>
    `;
  }

  const [best] = result.matches;
  const entry = best.entry;

  return `
    <div class="nutrition-card nutrition-card-total-only">
      ${renderTotalNutrition(entry, amountGrams)}
    </div>
  `;
}

function renderTotalNutrition(entry, amountGrams) {
  return `
    <section class="nutrition-total-block" aria-label="按采购量估算的整体营养">
      <div class="nutrition-total-head">
        <strong>采购整体营养</strong>
        <span>每克营养 × ${formatNumber(amountGrams)}g</span>
      </div>
      <div class="nutrition-total-grid">
        ${NUTRIENT_DISPLAY_FIELDS.map(([key, label]) => renderTotalNutrientValue(entry, key, label, amountGrams)).join("")}
      </div>
    </section>
  `;
}

function renderTotalNutrientValue(entry, key, label, amountGrams) {
  const nutrient = entry.nutrients?.[key];
  if (!nutrient || nutrient.value === null || nutrient.value === undefined) {
    return `<span><strong>${label}</strong>NA</span>`;
  }
  return `<span><strong>${label}</strong>${estimateTotalNutrient(nutrient, amountGrams)}${escapeHtml(totalNutrientUnit(nutrient.unit))}</span>`;
}

function parseAmountGrams(value) {
  const text = String(value || "").toLowerCase();
  const kg = text.match(/(\d+(?:\.\d+)?)\s*(?:kg|千克|公斤)/i);
  if (kg) return Number(kg[1]) * 1000;
  const grams = text.match(/(\d+(?:\.\d+)?)\s*(?:g|克)/i);
  if (grams) return Number(grams[1]);
  return null;
}

function estimateTotalNutrient(nutrient, amountGrams) {
  if (!amountGrams || nutrient.value === null || nutrient.value === undefined) {
    return "NA";
  }
  return formatNumber(nutrient.value * amountGrams);
}

function totalNutrientUnit(unit) {
  return String(unit || "").replace(/\/g$/i, "");
}

function formatNumber(value) {
  if (!Number.isFinite(Number(value))) {
    return "NA";
  }
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(1)));
}

function shoppingItemDisplay(item) {
  if (typeof item === "string") {
    return item;
  }
  if (!item || typeof item !== "object") {
    return "";
  }
  if (item.display) {
    return item.display;
  }
  const cost = item.estimatedCost === null || item.estimatedCost === undefined
    ? ""
    : `约 ${item.estimatedCost} 元`;
  return [item.name, item.amount, cost].filter(Boolean).join(" ");
}

function svgEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function setStatus(title, text, variant = "") {
  if (!statusBanner) return;
  statusBanner.className = `status-banner ${variant}`.trim();
  statusBanner.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span>`;
}

function setLoading(isLoading) {
  form.querySelectorAll("button, input, textarea, select").forEach((element) => {
    element.disabled = isLoading;
  });
}

function bindMetricMirrors() {
  const pairs = [
    ["targetCalories", "metricCalories"],
    ["familySize", "metricFamily"]
  ];
  for (const [inputId, metricId] of pairs) {
    const input = document.querySelector(`#${inputId}`);
    const metric = document.querySelector(`#${metricId}`);
    input.addEventListener("input", () => {
      metric.textContent = input.value || "0";
    });
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
