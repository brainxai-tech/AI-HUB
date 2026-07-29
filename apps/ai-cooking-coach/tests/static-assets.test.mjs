import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("frontend keeps the core cooking planner form with the output panel", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(html, /id="plannerForm"/);
  assert.doesNotMatch(html, /id="apiKey"/);
  assert.doesNotMatch(html, /id="provider"/);
  assert.doesNotMatch(html, /id="apiBaseUrl"/);
  assert.match(html, /\/hub\/suite-shell\.js/);
  assert.doesNotMatch(html, /id="days"/);
  assert.doesNotMatch(html, /id="heightCm"/);
  assert.doesNotMatch(html, /id="weightKg"/);
  assert.doesNotMatch(html, /id="metricBmi"/);
  assert.match(html, /id="resultPanel"/);
  assert.match(html, /id="planTitle"/);
  assert.match(html, /id="weekView"/);
  assert.match(html, /id="shoppingView"/);
  assert.match(html, /id="prepView"/);
  assert.match(html, /id="copyButton"[\s\S]*disabled/);
  assert.match(html, /id="downloadButton"[\s\S]*disabled/);
  assert.doesNotMatch(app, /deepseekApiKey/);
  assert.doesNotMatch(app, /providerInput/);
  assert.doesNotMatch(app, /apiBaseUrlInput/);
  assert.match(app, /\/api\/plan/);
  assert.match(app, /days:\s*7/);
  assert.doesNotMatch(app, /data\.get\("days"\)/);
  assert.doesNotMatch(app, /heightCm:\s*Number\(data\.get\("heightCm"\)\)/);
  assert.doesNotMatch(app, /weightKg:\s*Number\(data\.get\("weightKg"\)\)/);
  assert.doesNotMatch(app, /updateBmi/);
});

test("sidebar menu keeps home first, planning second, execution third, history fourth, and menu library fifth", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  const homeScreenIndex = html.indexOf('id="homeScreen"');
  const plannerScreenIndex = html.indexOf('id="plannerScreen"');
  const commandCenterScreenIndex = html.indexOf('id="commandCenterScreen"');
  const historyReviewScreenIndex = html.indexOf('id="historyReviewScreen"');
  const menuLibraryScreenIndex = html.indexOf('id="menuLibraryScreen"');
  const menuIndex = html.indexOf('class="side-menu"');
  const firstMenuItemIndex = html.indexOf('data-screen="homeScreen"');
  const planningMenuItemIndex = html.indexOf('data-screen="plannerScreen"');
  const commandCenterItemIndex = html.indexOf('data-screen="commandCenterScreen"');
  const historyReviewItemIndex = html.indexOf('data-screen="historyReviewScreen"');
  const menuLibraryItemIndex = html.indexOf('data-screen="menuLibraryScreen"');

  assert.ok(homeScreenIndex >= 0, "home screen exists");
  assert.ok(plannerScreenIndex >= 0, "planning screen exists");
  assert.ok(commandCenterScreenIndex >= 0, "command center screen exists");
  assert.ok(historyReviewScreenIndex >= 0, "history review screen exists");
  assert.ok(menuLibraryScreenIndex >= 0, "menu library screen exists");
  assert.ok(menuIndex >= 0, "left menu exists");
  assert.ok(firstMenuItemIndex > menuIndex, "home menu item exists");
  assert.ok(planningMenuItemIndex > firstMenuItemIndex, "planning menu follows home");
  assert.ok(commandCenterItemIndex > planningMenuItemIndex, "execution menu follows planning");
  assert.ok(historyReviewItemIndex > commandCenterItemIndex, "history review follows execution");
  assert.ok(menuLibraryItemIndex > historyReviewItemIndex, "menu library follows history review");
  assert.match(html, /<strong>产品首页<\/strong>/);
  assert.match(html, /<strong>规划<\/strong>/);
  assert.match(html, /<strong>执行中心<\/strong>/);
  assert.match(html, /<strong>历史复盘<\/strong>/);
  assert.match(html, /<strong>菜单大全<\/strong>/);
  assert.doesNotMatch(html, /<strong>目标与厨房约束<\/strong>[\s\S]*<\/nav>/);
  assert.doesNotMatch(html, /<strong>周计划与采购<\/strong>[\s\S]*<\/nav>/);
  assert.match(html, /目标与厨房约束/);
  assert.doesNotMatch(html, /周计划与采购/);
  assert.doesNotMatch(html, /中式家庭减脂备餐/);
  assert.match(app, /function switchScreen/);
  assert.match(app, /data-screen/);
  assert.match(css, /\.app-screen/);
  assert.match(css, /\.app-screen\.active/);
  assert.match(css, /\.side-menu/);
  assert.match(css, /\.command-center-screen/);
  assert.match(css, /\.history-review-screen/);
  assert.match(css, /\.menu-library-screen/);
  assert.match(app, /commandCenterScreen/);
  assert.match(app, /historyReviewScreen/);
  assert.match(app, /menuLibraryScreen/);
});

test("product home screen introduces the cooking coach experience", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const homeMatch = html.match(/<section class="app-screen home-screen active" id="homeScreen"[^>]*>([\s\S]*?)<\/section>/);

  assert.ok(homeMatch, "home screen exists");
  assert.match(homeMatch[1], /class="home-copy"/);
  assert.match(homeMatch[1], /AI Cooking Coach/);
  assert.match(homeMatch[1], /一周菜单、采购清单和批量备餐节奏/);
  assert.match(homeMatch[1], /data-screen="plannerScreen"/);
  assert.match(homeMatch[1], /data-screen="menuLibraryScreen"/);
  assert.doesNotMatch(homeMatch[1], /data-screen="ingredientNutritionScreen"/);
  assert.match(homeMatch[1], /class="home-proof"/);
  assert.match(homeMatch[1], /本地营养库/);
  assert.match(homeMatch[1], /采购项营养估算/);
  assert.match(homeMatch[1], /assets\/meal-prep-board\.svg/);
  assert.doesNotMatch(homeMatch[1], /System Prompt/);
});

test("generation uses Hub-managed credentials and exposes no project-level key field", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.doesNotMatch(html, /无 Key 演示/);
  assert.doesNotMatch(html, /Demo ready/);
  assert.doesNotMatch(html, /不填 Key 也可以生成本地演示计划/);
  assert.doesNotMatch(html, /id="demoButton"/);
  assert.doesNotMatch(app, /demoButton/);
  assert.doesNotMatch(app, /forceDemo/);
  assert.doesNotMatch(app, /Demo plan/);
  assert.doesNotMatch(html, /id="apiKey"/);
  assert.doesNotMatch(app, /请输入模型 API Key/);
  assert.match(html, /\/hub\/suite-shell\.js/);
  assert.match(app, /智能规划服务暂时不可用/);
  assert.match(app, /LOCAL_APP_ORIGIN/);
  assert.match(app, /LOCAL_APP_ORIGINS/);
  assert.match(app, /function appUrl/);
  assert.match(app, /LOCAL_APP_ORIGINS\.has\(location\.origin\)/);
  assert.match(app, /location\.protocol === "file:"/);
  assert.match(app, /function isLocalHost/);
  assert.match(app, /`\$\{LOCAL_APP_ORIGIN\}\$\{path\}`/);
  assert.match(app, /return path;/);
});

test("planner screen keeps output views below the agent panel", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const plannerStart = html.indexOf('<section class="app-screen planner-screen" id="plannerScreen"');
  const formIndex = html.indexOf('id="plannerForm"');
  const agentIndex = html.indexOf('id="cookingAgentPanel"');
  const resultIndex = html.indexOf('id="resultPanel"');
  const plannerEnd = html.indexOf("</section>", plannerStart);

  assert.ok(plannerStart >= 0, "planner panel exists");
  assert.ok(formIndex > plannerStart, "form is inside planner panel");
  assert.ok(formIndex < plannerEnd, "form remains inside planner panel");
  assert.ok(agentIndex > formIndex, "agent panel follows form");
  assert.ok(resultIndex > agentIndex, "output panel follows agent panel");
  assert.match(html, /role="tablist"/);
  assert.match(html, /data-view="week"/);
  assert.match(html, /data-view="shopping"/);
  assert.match(html, /data-view="prep"/);
  assert.match(app, /copyButton\?\.addEventListener/);
  assert.match(app, /downloadButton\?\.addEventListener/);
  assert.match(app, /setAttribute\("aria-selected", "true"\)/);
});

test("nutrition RAG data remains available inside the shopping output view", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const rag = JSON.parse(await readFile(new URL("../public/data/ingredient-nutrition-rag.json", import.meta.url), "utf8"));

  assert.equal(rag.itemCount, 13693);
  assert.ok(rag.items.some((item) => item.englishName && item.nutrients?.energyKcal));
  assert.match(html, /id="shoppingView"/);
  assert.match(app, /class="shopping-item-trigger"/);
});

test("menu library screen loads the recipe RAG index", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  const rag = JSON.parse(await readFile(new URL("../public/data/menu-library-rag.json", import.meta.url), "utf8"));

  assert.equal(rag.source, "500道饭店常做菜品_配料热量制作方式_markdown.docx");
  assert.equal(rag.sourceFormat, "docx-markdown");
  assert.equal(rag.itemCount, 500);
  assert.equal(rag.items[0].name, "麻婆豆腐");
  assert.equal(rag.items[0].category, "川湘及麻辣菜");
  assert.equal(rag.items[0].technique, "焖烧");
  assert.ok(rag.facets.topIngredients.includes("盐"));
  assert.ok(rag.facets.flavors.includes("家常小炒与素菜"));
  assert.ok(rag.facets.techniques.includes("小炒"));
  assert.equal(rag.calorieEstimateSource, "500道饭店常做菜品_配料热量制作方式_markdown.docx");
  assert.equal(rag.calorieEstimateMatchedCount, 500);
  assert.equal(rag.calorieEstimateMissingRecipeCount, 0);
  assert.equal(rag.items[0].calorieEstimate.totalKcal, 1009);
  assert.equal(rag.items[0].calorieEstimate.perServingKcal, 504);
  assert.match(rag.items[0].calorieEstimate.text, /整菜约 1009 kcal/);
  assert.equal(rag.items[0].ingredients[0].name, "北豆腐");
  assert.deepEqual(rag.items[0].fdcMatches, []);
  const steamedRollRecipe = rag.items.find((item) => item.name === "椒盐花卷");
  assert.equal(steamedRollRecipe?.calorieEstimate.totalKcal, 1597);
  assert.equal(steamedRollRecipe?.ingredients[0].name, "面粉");
  assert.match(steamedRollRecipe?.searchText || "", /椒盐花卷/);
  assert.match(html, /id="menuLibraryScreen"/);
  assert.match(html, /id="menuRecipeGrid"/);
  assert.match(html, /id="menuSearchInput"/);
  assert.match(app, /MENU_LIBRARY_URL/);
  assert.match(app, /function renderMenuLibrary/);
  assert.match(app, /data-menu-ingredient/);
  assert.match(app, /renderRecipeCalories/);
  assert.match(css, /\.recipe-grid/);
  assert.match(css, /\.recipe-card/);
});

test("sidebar menu removes ingredient nutrition as the fourth screen while keeping shopping nutrition data", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  const rag = JSON.parse(await readFile(new URL("../public/data/ingredient-nutrition-rag.json", import.meta.url), "utf8"));
  const menuLibraryItemIndex = html.indexOf('data-screen="menuLibraryScreen"');

  assert.equal(rag.itemCount, 13693);
  assert.ok(menuLibraryItemIndex >= 0, "menu library remains in sidebar");
  assert.doesNotMatch(html, /data-screen="ingredientNutritionScreen"/);
  assert.doesNotMatch(html, /id="ingredientNutritionScreen"/);
  assert.doesNotMatch(html, /id="ingredientNutritionGrid"/);
  assert.doesNotMatch(html, /id="ingredientNutritionSearchInput"/);
  assert.match(app, /NUTRITION_INDEX_URL/);
  assert.match(app, /function renderNutritionResult/);
  assert.doesNotMatch(app, /ingredientNutritionScreen/);
  assert.doesNotMatch(app, /bindIngredientNutritionControls/);
  assert.doesNotMatch(css, /\.ingredient-nutrition-screen/);
  assert.doesNotMatch(css, /\.nutrition-food-grid/);
});

test("menu library screen renders random samples instead of sequential items", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const menuRenderer = app.match(/function renderMenuLibrary[\s\S]*?(?=\r?\n\r?\nfunction filterMenuRecipes)/);

  assert.ok(menuRenderer, "menu renderer exists");
  assert.match(app, /function pickRandomItems/);
  assert.match(menuRenderer[0], /pickRandomItems\(items,\s*MENU_RENDER_LIMIT\)/);
  assert.doesNotMatch(menuRenderer[0], /items\.slice\(0,\s*MENU_RENDER_LIMIT\)/);
});

test("ingredient nutrition screen renderers are removed from the frontend", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.doesNotMatch(app, /function renderIngredientNutrition\(/);
  assert.doesNotMatch(app, /function renderIngredientNutritionCard/);
  assert.doesNotMatch(app, /function renderNutrientValue/);
  assert.doesNotMatch(app, /function formatPer100GramNutrient/);
  assert.doesNotMatch(app, /function per100GramUnit/);
  assert.match(app, /function renderNutritionResult/);
  assert.match(app, /function renderTotalNutrientValue/);
});

test("menu library does not expose source file or FDC match rows", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  assert.doesNotMatch(html, /id="menuLibrarySource"/);
  assert.doesNotMatch(app, /menuLibrarySource/);
  assert.doesNotMatch(app, /index\.source/);
  assert.doesNotMatch(app, /fdcLine/);
  assert.doesNotMatch(app, /recipe-fdc/);
  assert.doesNotMatch(css, /\.recipe-fdc/);
});

test("shopping nutrition renderer only shows purchase-level totals", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const renderer = app.match(/function renderNutritionResult[\s\S]*?(?=\r?\n\r?\nfunction renderTotalNutrition)/);

  assert.ok(renderer, "renderNutritionResult exists");
  assert.match(renderer[0], /renderTotalNutrition/);
  assert.doesNotMatch(renderer[0], /sourceLabel/);
  assert.doesNotMatch(renderer[0], /nutrition-card-head/);
  assert.doesNotMatch(renderer[0], /nutrition-values/);
  assert.doesNotMatch(renderer[0], /nutrition-alternatives/);
  assert.doesNotMatch(renderer[0], /RAG/);
});

test("shopping output fills the right rail with a purchase overview", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  assert.match(app, /function renderShoppingWorkspace/);
  assert.match(app, /function renderShoppingOverview/);
  assert.match(app, /shopping-summary-panel/);
  assert.match(app, /采购总览/);
  assert.match(app, /估算总价/);
  assert.match(app, /class="shopping-main-column"/);
  assert.match(css, /\.shopping-workspace/);
  assert.match(css, /\.shopping-main-column/);
  assert.match(css, /\.shopping-summary-panel/);
  assert.match(css, /\.shopping-metric-grid/);
});

test("shopping output supports local checklist execution state", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  assert.match(app, /from "\.\/execution-state\.mjs"/);
  assert.match(app, /data-shopping-check/);
  assert.match(app, /function handleShoppingCheckClick/);
  assert.match(app, /function persistExecutionState/);
  assert.match(css, /\.shopping-check-button/);
  assert.match(css, /\.execution-progress/);
});

test("shopping output exposes procurement mode filters and copy action", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  assert.match(app, /from "\.\/shopping-list\.mjs"/);
  assert.match(app, /data-procurement-filter/);
  assert.match(app, /data-shopping-copy/);
  assert.match(app, /function handleProcurementFilterClick/);
  assert.match(app, /function handleShoppingCopyClick/);
  assert.match(app, /procurement-mode-panel/);
  assert.match(css, /\.procurement-mode-panel/);
  assert.match(css, /\.procurement-item/);
  assert.match(css, /\.shopping-copy-button/);
});

test("prep output supports task completion state", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  assert.match(app, /data-prep-check/);
  assert.match(app, /function handlePrepCheckClick/);
  assert.match(app, /updatePrepTask/);
  assert.match(css, /\.prep-check-button/);
  assert.match(css, /\.prep-card\.is-complete/);
});

test("kitchen command center exposes day selection meal states and replacement history", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  assert.match(html, /id="commandCenterScreen"/);
  assert.match(html, /id="commandCenterEmpty"/);
  assert.match(html, /id="commandCenterBoard"/);
  assert.match(html, /id="commandDayTabs"/);
  assert.match(html, /id="todayCookingView"/);
  assert.match(html, /id="replacementHistory"/);
  assert.match(html, /data-screen="commandCenterScreen"/);
  assert.match(app, /\/api\/adjust-meal/);
  assert.match(app, /function renderCommandCenter/);
  assert.match(app, /function handleMealStatusClick/);
  assert.match(app, /function handleMealReplacementSubmit/);
  assert.match(app, /updateMealStatus/);
  assert.match(app, /addReplacement/);
  assert.match(app, /updateSelectedDay/);
  assert.match(app, /data-meal-status/);
  assert.match(app, /data-meal-replace/);
  assert.match(css, /\.command-center-shell/);
  assert.match(css, /\.command-metric-grid/);
  assert.match(css, /\.today-cooking-grid/);
  assert.match(css, /\.replacement-history/);
  assert.match(css, /\.meal-command-card/);
  assert.match(css, /\.command-center-board\[hidden\]/);
});

test("weekly memory loop exposes local history review controls", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  assert.match(html, /id="historyReviewScreen"/);
  assert.match(html, /id="planHistoryList"/);
  assert.match(html, /id="weeklyReviewPanel"/);
  assert.match(html, /id="weeklyFeedback"/);
  assert.match(html, /id="generateWeekReviewButton"/);
  assert.match(html, /id="exportWeekReviewButton"/);
  assert.match(app, /weekly-memory\.mjs/);
  assert.match(app, /PLAN_HISTORY_STORAGE_KEY/);
  assert.match(app, /function saveCurrentPlanToHistory/);
  assert.match(app, /function renderHistoryReviewScreen/);
  assert.match(app, /\/api\/review-week/);
  assert.match(css, /\.history-review-shell/);
  assert.match(css, /\.plan-history-list/);
  assert.match(css, /\.weekly-review-panel/);
});

test("planning screen keeps the Hub-managed agent panel but hides legacy provider controls", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  const formIndex = html.indexOf('id="plannerForm"');
  const agentIndex = html.indexOf('id="cookingAgentPanel"');

  assert.ok(agentIndex > formIndex, "agent panel follows the planning form");
  assert.doesNotMatch(html, /id="agentPromptPreview"/);
  assert.doesNotMatch(html, /System Prompt/);
  assert.doesNotMatch(html, /OpenAI \/ GPT|Google Gemini|OpenRouter \/ Claude/);
  assert.doesNotMatch(html, /API Key 由用户提供/);
  assert.match(html, /\/hub\/suite-shell\.js/);
  assert.match(app, /\/api\/agent/);
  assert.doesNotMatch(app, /agentPromptPreview/);
  assert.doesNotMatch(app, /agent\.systemPrompt/);
  assert.doesNotMatch(app, /system prompt/i);
  assert.match(css, /\.agent-panel/);
});
