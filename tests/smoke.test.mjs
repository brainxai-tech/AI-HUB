import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);

async function readProjectFile(pathname) {
  return readFile(new URL(pathname, root), "utf8");
}

async function loadProjects() {
  const projectsSource = await readProjectFile("public/projects.js");
  const sandbox = { window: { location: { origin: "https://hub.example" } } };

  vm.runInNewContext(projectsSource, sandbox);

  return sandbox.window.AI_PROJECTS;
}

async function loadCapabilityGate() {
  const source = await readProjectFile("public/capabilities.js");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.HubCapabilityGate;
}

async function loadCoverManifest() {
  const source = await readProjectFile("public/cover-manifest.js");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.AI_PROJECT_COVERS;
}

async function loadModelGuideData() {
  const source = await readProjectFile("public/model-guide-data.js");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.AI_MODEL_GUIDE_DATA;
}

test("project data contains the requested project entries", async () => {
  const projects = await loadProjects();
  const projectIds = Array.from(projects, (project) => project.id);

  assert.ok(Array.isArray(projects));
  assert.equal(projects.length, 38);
  assert.equal(new Set(projectIds).size, projects.length);
  for (const id of ["ai-ppt-report-coach", "ai-work-report-generator", "mbti-persona-compass", "ai-essay-coach", "yingzhou-ai", "ai-xiangqi-duel", "ai-chess-duel", "ai-go-duel", "fury-flock", "dice-estate-duel"]) {
    assert.ok(projectIds.includes(id), `${id} is missing`);
  }
  assert.ok(
    projects.every(
      (project) =>
        typeof project.image === "string" &&
        (project.image.startsWith("/hub/assets/project-covers/") ||
          /^\/(xiangqi|chess|go)\/icon\.svg\?v=/.test(project.image)) &&
        /\.(jpg|png|svg)\?v=/.test(project.image),
    ),
  );
  assert.ok(projects.every((project) => !Object.hasOwn(project, "tags")));
});

test("project data keeps every project on the current Hub origin", async () => {
  const projects = await loadProjects();
  const expectedUrls = new Map([
    ["idol-match-test", "https://hub.example/idol-match/"],
    ["ai-xiangqi-duel", "https://hub.example/xiangqi"],
    ["ai-chess-duel", "https://hub.example/chess"],
    ["ai-go-duel", "https://hub.example/go"],
    ["fury-flock", "https://hub.example/fury-flock/"],
    ["dice-estate-duel", "https://hub.example/hub/dice-estate/"],
    ["ai-ppt-report-coach", "https://hub.example/ppt-report-coach/"],
    ["ai-work-report-generator", "https://hub.example/work-report/"],
    ["mbti-persona-compass", "https://hub.example/mbti/"],
    ["ai-essay-coach", "https://hub.example/essay/"],
    ["yingzhou-ai", "https://hub.example/poetry/"],
  ]);

  for (const project of projects) {
    assert.equal(new URL(project.url).origin, "https://hub.example");
    assert.equal(new URL(project.url).protocol, "https:", `${project.id} must use HTTPS`);
  }

  for (const [id, url] of expectedUrls) {
    assert.equal(projects.find((project) => project.id === id)?.url, url);
  }
});

test("dice estate game runtime is packaged for the Hub", async () => {
  for (const pathname of [
    "public/dice-estate/index.html",
    "public/dice-estate/app.js",
    "public/dice-estate/engine.js",
    "public/dice-estate/styles.css",
    "public/dice-estate/assets/backgrounds/board-city-tabletop-bg.webp",
    "public/dice-estate/assets/players/lin-hao-token.png",
  ]) {
    assert.ok((await stat(new URL(pathname, root))).size > 0, `${pathname} is missing`);
  }

  const html = await readProjectFile("public/dice-estate/index.html");
  const app = await readProjectFile("public/dice-estate/app.js");
  assert.match(html, /href="\/hub\/">返回 AI HUB<\/a>/);
  assert.match(app, /agentMode:\s*"hub"/);
  assert.match(app, /fetch\("\/api\/agent\/decision"/);
  assert.match(app, /Hub GPT/);
  assert.doesNotMatch(app, /agentMode\s*=\s*"deterministic"/);
  assert.doesNotMatch(app, /<select id="agentMode"/);
});

test("all project covers have fingerprinted responsive AVIF and WebP variants", async () => {
  const projects = await loadProjects();
  const covers = await loadCoverManifest();

  assert.equal(Object.keys(covers).length, projects.length);
  for (const project of projects) {
    const cover = covers[project.id];
    assert.ok(cover, `${project.id} is missing optimized cover metadata`);
    assert.ok(cover.width > 0 && cover.height > 0);
    for (const format of ["avif", "webp"]) {
      assert.ok(cover[format].length >= 2, `${project.id} needs two ${format} widths`);
      for (const variant of cover[format]) {
        assert.match(
          variant.src,
          new RegExp(`^/hub/assets/project-covers/generated/${project.id}-\\d+w\\.[a-f0-9]{12}\\.${format}$`),
        );
        const file = new URL(`../public/${variant.src.slice("/hub/".length)}`, import.meta.url);
        const bytes = (await stat(file)).size;
        assert.ok(bytes < 5 * 1024 * 1024, `${variant.src} exceeds 5 MiB`);
      }
    }
  }
});

test("original project cover fallbacks remain packaged", async () => {
  const projects = await loadProjects();
  const originals = (await readdir(new URL("public/assets/project-covers/", root))).filter((name) =>
    /\.(?:jpe?g|png|svg)$/i.test(name),
  );

  assert.ok(originals.length >= 37, `only ${originals.length} original cover files remain`);
  for (const project of projects) {
    if (!project.image.startsWith("/hub/assets/project-covers/")) continue;
    const relativePath = project.image.slice("/hub/".length).split("?", 1)[0];
    const source = new URL(`public/${relativePath}`, root);
    assert.ok((await stat(source)).size > 0, `${project.id} is missing its original cover fallback`);
  }
});

test("AI projects declare capability-specific gates", async () => {
  const projects = await loadProjects();

  assert.equal(projects.some((project) => project.id === "ai-resume-polisher"), false);
  assert.equal(
    projects.some((project) => project.requiredCapabilities?.includes("coze:invoke")),
    false,
  );
  for (const project of projects) {
    assert.equal(Object.hasOwn(project, "requiresModelConfig"), false);
    if (project.id === "fury-flock") {
      assert.deepEqual(Array.from(project.requiredCapabilities || []), []);
    } else {
      assert.deepEqual(Array.from(project.requiredCapabilities), ["model:chat"]);
    }
  }
});

test("every project recommendation stays within the GPT routing family", async () => {
  const projects = await loadProjects();
  const supportedModels = new Map([
    ["GPT", new Set([
      "gpt-5.3-codex-spark",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.5",
      "gpt-5.6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
    ])],
  ]);

  for (const project of projects) {
    const recommendation = project.modelRecommendation;
    assert.ok(recommendation, `${project.id} is missing a model recommendation`);
    assert.ok(
      supportedModels.has(recommendation.provider),
      `${project.id} uses unsupported provider ${recommendation.provider}`,
    );
    assert.ok(
      supportedModels.get(recommendation.provider).has(recommendation.model),
      `${project.id} uses unsupported model ${recommendation.model}`,
    );
    assert.ok(
      typeof recommendation.reason === "string" && recommendation.reason.trim().length >= 24,
      `${project.id} needs a specific recommendation reason`,
    );
  }
});

test("model configuration does not unlock a Coze-only project", async () => {
  const gate = await loadCapabilityGate();
  const modelOnlyConfig = {
    providers: [{ enabled: true, configured: true }],
    integrations: { coze: { enabled: false, configured: false } },
  };

  assert.deepEqual(
    Array.from(gate.missingCapabilities(["coze:invoke"], modelOnlyConfig)),
    ["coze:invoke"],
  );
  assert.deepEqual(Array.from(gate.missingCapabilities(["model:chat"], modelOnlyConfig)), []);
  assert.match(gate.describeMissingCapabilities(["coze:invoke"]), /Coze 工作流/);
});

test("html loads project data before the app", async () => {
  const html = await readProjectFile("public/index.html");
  const projectsIndex = html.indexOf("/hub/projects.js");
  const coversIndex = html.indexOf("/hub/cover-manifest.js");
  const appIndex = html.indexOf("/hub/app.js");

  assert.ok(projectsIndex > -1, "projects.js script is missing");
  assert.ok(appIndex > -1, "app.js script is missing");
  assert.ok(projectsIndex < appIndex, "project data must load before app.js");
  assert.ok(coversIndex > projectsIndex && coversIndex < appIndex, "cover manifest must load before app.js");
  assert.match(html, /\/hub\/capabilities\.js\?v=20260710-capabilities/);
  assert.match(html, /\/hub\/projects\.js\?v=20260728-gpt-only1/);
  assert.match(html, /\/hub\/cover-manifest\.js\?v=20260727-image2-office-hub-style-v2/);
  assert.match(html, /\/hub\/styles\.css\?v=20260805-relay4/);
  assert.match(html, /\/hub\/app\.js\?v=20260805-relay7/);
  assert.match(html, /rel="icon" href="data:image\/svg\+xml/);
});

test("Hub shell transfer stays below 1.5 MiB before lazy cover loading", async () => {
  const files = [
    "public/index.html",
    "public/styles.css",
    "public/model-guide.css",
    "public/suite-theme.css",
    "public/suite-tool-foundation.css",
    "public/suite-shell.js",
    "public/project-themes/idol.css",
    "public/project-themes/qisheng.css",
    "public/project-themes/tarot.css",
    "public/project-themes/grassland.css",
    "public/project-themes/elder.css",
    "public/capabilities.js",
    "public/projects.js",
    "public/cover-manifest.js",
    "public/app.js",
  ];
  let bytes = 0;
  for (const file of files) bytes += (await stat(new URL(file, root))).size;
  assert.ok(bytes < 1.5 * 1024 * 1024, `Hub shell is ${bytes} bytes`);
});

test("project cards gate unavailable capabilities and navigate in the same tab", async () => {
  const app = await readProjectFile("public/app.js");
  const styles = await readProjectFile("public/styles.css");

  assert.match(app, /class="project-card"/);
  assert.match(app, /data-project-card/);
  assert.match(app, /data-required-capabilities/);
  assert.match(app, /data-project-url="\$\{escapeHtml\(project\.url\)\}"/);
  assert.match(app, /href="\$\{href\}"/);
  assert.match(app, /missingCapabilities/);
  assert.match(app, /openProjectAfterCapabilityGate/);
  assert.match(app, /window\.location\.assign\(project\.url\)/);
  assert.doesNotMatch(app, /window\.open\(/);
  assert.doesNotMatch(app, /target="_blank"/);
  assert.doesNotMatch(app, /允许浏览器弹窗/);
  assert.doesNotMatch(app, /project-tags/);
  assert.doesNotMatch(app, /\.\.\.project\.tags/);
  assert.doesNotMatch(app, /tags:\s*\[/);
  assert.doesNotMatch(styles, /project-tags/);
  assert.match(app, /class="project-card__media"/);
  assert.match(app, /<picture>/);
  assert.match(app, /type="image\/avif"/);
  assert.match(app, /type="image\/webp"/);
  assert.match(app, /srcset=/);
  assert.match(app, /sizes=/);
  assert.match(app, /width=/);
  assert.match(app, /height=/);
  assert.match(app, /loading="lazy"/);
});

test("project model reasons use an accessible disclosure without triggering navigation", async () => {
  const app = await readProjectFile("public/app.js");
  const styles = await readProjectFile("public/styles.css");

  assert.match(app, /modelRecommendation/);
  assert.match(app, /<details class="project-card__recommendation" data-recommendation-details/);
  assert.match(app, /<summary>/);
  assert.match(app, /模型方案/);
  assert.match(app, /为什么它是主要候选/);
  assert.doesNotMatch(app, /自动路由已启用/);
  assert.match(app, /event\.target\.closest\("\[data-recommendation-details\]"\)/);
  assert.match(app, /class="project-card__link"[^>]+\$\{linkDisabledAttr\}/);
  assert.doesNotMatch(app, /<article[^>]+\$\{linkDisabledAttr\}/);
  assert.match(styles, /\.project-card__recommendation/);
  assert.match(styles, /\.project-card__recommendation > summary:focus-visible/);
});

test("empty state and filtering hooks are present", async () => {
  const html = await readProjectFile("public/index.html");

  for (const id of [
    "projectsPage",
    "searchInput",
    "categoryFilter",
    "sortFilter",
    "projectGrid",
    "emptyState",
    "reloadButton",
    "copyTemplateButton",
    "projectLaunchStatus",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /id="stageFilter"/);
  assert.match(html, /placeholder="搜索项目名称、分类、状态或描述"/);
});

test("public Hub uses one visible catalog with three featured projects and compact recents", async () => {
  const html = await readProjectFile("public/index.html");
  const app = await readProjectFile("public/app.js");
  const styles = await readProjectFile("public/styles.css");

  for (const id of [
    "purposeNav",
    "featuredSection",
    "recentSection",
    "recentGrid",
    "allProjectsDisclosure",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /完整项目库/);
  assert.doesNotMatch(html, /id="featuredGrid"/);
  assert.doesNotMatch(html, /<details id="allProjectsDisclosure"/);
  assert.match(app, /featuredProjectIds/);
  assert.match(app, /mbti-persona-compass/);
  assert.match(app, /ai-essay-coach/);
  assert.match(app, /yingzhou-ai/);
  assert.match(app, /renderRecentProject/);
  assert.match(app, /replace\(\/\^AI\\s\*·\\s\*\/u/);
  assert.match(styles, /\.purpose-nav/);
  assert.match(styles, /\.recent-item/);
  assert.match(styles, /\.catalog-section/);
});

test("public Hub promotes the planned auto-routing value without claiming it is active", async () => {
  const html = await readProjectFile("public/index.html");
  const styles = await readProjectFile("public/styles.css");

  for (const id of ["routingHero", "routingFlow"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /id="modelStrengths"|id="routingModes"/);
  assert.match(html, /一个 API Key/);
  assert.doesNotMatch(html, /Anthropic|Claude|DeepSeek|Gemini/i);
  assert.match(html, /自动路由仍在建设中/);
  assert.match(html, /不会调用未配置的模型/);
  assert.doesNotMatch(html, /自动路由已开启/);
  assert.match(html, /href="\/hub\/models\.html">了解模型差异/);
  assert.match(styles, /\.routing-callout/);
});

test("model guide compares only GPT models with transparent scoring and pricing", async () => {
  const hubHtml = await readProjectFile("public/index.html");
  const guideHtml = await readProjectFile("public/models.html");
  const guideData = await readProjectFile("public/model-guide-data.js");
  const guideApp = await readProjectFile("public/model-guide.js");
  const guideStyles = await readProjectFile("public/model-guide.css");
  const modelGuide = await loadModelGuideData();

  assert.match(hubHtml, /href="\/hub\/models\.html">了解模型差异/);
  assert.doesNotMatch(hubHtml, /href="#modelStrengths">了解模型差异/);

  for (const id of [
    "comparison",
    "compareTitle",
    "comparisonPresets",
    "modelLandscape",
    "landscapeAxisLabel",
    "comparisonRecommendation",
    "comparePicker",
    "compareStatus",
    "modelComparisonTable",
    "methodTitle",
    "methodology",
    "providerTitle",
    "providerProfiles",
    "rankingTabs",
    "leaderboard",
    "modelSearch",
    "modelSort",
    "providerFilters",
    "modelGrid",
    "sourceList",
  ]) {
    assert.match(guideHtml, new RegExp(`id="${id}"`));
  }

  assert.match(guideData, /providers: providers\.filter\(\(provider\) => provider\.id === "OpenAI"\)/);
  assert.equal(modelGuide.providers.length, 1);
  assert.equal(modelGuide.models.length, 9);
  for (const id of ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5-pro", "gpt-5.5", "gpt-5.4-pro", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"]) {
    assert.ok(modelGuide.models.some((model) => model.id === id), `${id} is missing from the guide`);
  }
  for (const profile of modelGuide.providers) {
    assert.ok(profile.introduction.length >= 40, `${profile.id} needs a fuller introduction`);
    assert.ok(profile.strengths.length >= 4, `${profile.id} needs capability strengths`);
    assert.ok(profile.bestFor.length >= 3, `${profile.id} needs task guidance`);
    assert.ok(profile.watchFor.length >= 2, `${profile.id} needs usage boundaries`);
    assert.ok(profile.lineup.length >= 2, `${profile.id} needs a model lineup`);
    assert.ok(profile.reasoningTiers.length >= 3, `${profile.id} needs reasoning tiers`);
  }
  for (const model of modelGuide.models) {
    assert.ok(model.capabilityIntro.length >= 35, `${model.id} needs a capability introduction`);
    assert.ok(model.capabilities.length >= 5, `${model.id} needs capability tags`);
    assert.ok(model.chooseWhen.length >= 20, `${model.id} needs selection guidance`);
    assert.ok(model.switchWhen.length >= 20, `${model.id} needs switching guidance`);
    assert.ok(model.reasoningProfile, `${model.id} needs a reasoning profile`);
    assert.ok(model.reasoningProfile.modes.length >= 3, `${model.id} needs three reasoning choices`);
    assert.match(model.sources.model.url, /^https:\/\//, `${model.id} needs an official model source`);
    assert.match(model.sources.pricing.url, /^https:\/\//, `${model.id} needs an official pricing source`);
    assert.match(model.sources.benchmark.url, /^https:\/\//, `${model.id} needs an independent benchmark source`);
    assert.match(model.sources.benchmarkData.url, /^https:\/\//, `${model.id} needs a benchmark data source`);
    assert.match(model.sources.artificialAnalysis.url, /^https:\/\//, `${model.id} needs a performance benchmark source`);
    assert.match(model.sources.editorial.url, /#methodology$/, `${model.id} needs an editorial methodology source`);
    assert.match(model.sources.calculation.url, /#methodology$/, `${model.id} needs a calculation source`);
    assert.equal(model.sourcesVerifiedAt, "2026-07-27", `${model.id} needs a source verification date`);
  }
  const liveBenchModels = modelGuide.models.filter((model) => model.benchmarks.liveBench);
  assert.equal(liveBenchModels.length, 7, "seven GPT models should have exact LiveBench release matches");
  for (const model of liveBenchModels) {
    assert.match(model.benchmarks.liveBench.variant, /\S/, `${model.id} needs the exact evaluated variant`);
    for (const metric of ["overall", "reasoning", "coding", "agentic", "math", "data", "language", "instruction"]) {
      assert.ok(Number.isFinite(model.scores[metric]), `${model.id} needs a numeric ${metric} benchmark`);
      assert.ok(model.scores[metric] >= 0 && model.scores[metric] <= 100, `${model.id} ${metric} must be 0-100`);
    }
  }
  assert.match(modelGuide.benchmarkSources.liveBench.dataUrl, /^https:\/\//);
  assert.equal(modelGuide.benchmarkSources.liveBench.release, "2026-06-25");
  assert.match(modelGuide.benchmarkSources.artificialAnalysis.leaderboardUrl, /^https:\/\//);
  for (const source of modelGuide.sources) {
    assert.match(source.modelUrl, /^https:\/\//, `${source.id} needs a model documentation link`);
    assert.match(source.pricingUrl, /^https:\/\//, `${source.id} needs a pricing documentation link`);
  }
  assert.match(guideHtml, /每 100 万输入\/输出 Token/);
  assert.match(guideHtml, /80 万输入 \+ 20 万输出/);
  assert.doesNotMatch(guideHtml, /能力分数来自 LiveBench 与 Artificial Analysis 国际第三方测评/);
  assert.doesNotMatch(guideHtml, /真实可用型号仍以当前 AI Routing API Key 的检测结果为准/);
  assert.match(guideHtml, /每组数据都有对应来源/);
  assert.match(guideHtml, /型号名称、上下文、输入输出模态、工具与 Token 单价/);
  assert.match(guideHtml, /未收录型号显示“暂无第三方测评”/);
  assert.match(guideHtml, /优劣势、推理档位用途与任务适配是 AI HUB/);
  assert.match(guideHtml, /2026-06-25 原始数据/);
  assert.doesNotMatch(guideHtml, /AI HUB 编辑评分/);
  assert.match(guideApp, /renderLeaderboard/);
  assert.match(guideApp, /renderComparison/);
  assert.match(guideApp, /renderLandscape/);
  assert.match(guideApp, /is-near-right/);
  assert.match(guideApp, /renderRecommendation/);
  assert.match(guideApp, /renderComparisonTable/);
  assert.match(guideApp, /toggleComparedModel/);
  assert.match(guideApp, /refreshedButton\.focus\(\)/);
  assert.match(guideApp, /80\/20 成本/);
  assert.match(guideApp, /renderProviderProfiles/);
  assert.match(guideApp, /renderModelCard/);
  assert.match(guideApp, /scoreOf/);
  assert.match(guideApp, /model-data-citation/);
  assert.match(guideApp, /输入\/输出价格来源/);
  assert.match(guideApp, /优劣势为第三方测评基础上的 AI HUB 解读/);
  assert.match(guideApp, /LiveBench 原始 CSV/);
  assert.match(guideApp, /Artificial Analysis 榜单/);
  assert.match(guideStyles, /\.model-guide-grid/);
  assert.match(guideStyles, /\.model-compare__stage/);
  assert.match(guideStyles, /\.model-landscape__point/);
  assert.match(guideStyles, /\.model-comparison-table/);
  assert.match(guideStyles, /\.model-compare-picker/);
  assert.match(guideStyles, /\.model-provider-grid/);
  assert.match(guideStyles, /\.model-provider-grid:has\(\.model-provider-card\[open\]\)/);
  assert.match(guideStyles, /align-items:\s*start/);
  assert.match(guideStyles, /\.model-card__decision/);
  assert.match(guideStyles, /\.model-card__reasoning/);
  assert.match(guideStyles, /\.model-provider-reasoning/);
  assert.match(guideStyles, /\.model-data-citation/);
  assert.match(guideStyles, /\.model-source-item/);
  assert.match(guideStyles, /\.model-card__benchmark-missing/);
  assert.match(guideStyles, /@media \(max-width: 640px\)/);
});

test("public Hub exposes the scoped API Key entry without embedding administration controls", async () => {
  const html = await readProjectFile("public/index.html");
  const app = await readProjectFile("public/app.js");

  assert.match(html, /data-page-panel="projects"/);
  assert.doesNotMatch(html, /data-page-target="models"/);
  assert.doesNotMatch(html, /data-page-panel="models"/);
  assert.doesNotMatch(html, /adminTokenInput/);
  assert.doesNotMatch(html, /data-provider-key/);
  assert.doesNotMatch(html, /\/hub\/admin\/index\.html/);
  assert.doesNotMatch(html, />\s*统一模型配置\s*</);
  assert.match(html, /class="hub-config-entry" href="\/hub\/key-config\/">配置 API Key<\/a>/);
  assert.match(html, /class="action-button" href="\/hub\/key-config\/">配置 API Key<\/a>/);
  assert.match(app, /projectLaunchStatus/);
});

test("legacy administration page is removed while the workflow center remains available", async () => {
  await assert.rejects(
    stat(new URL("public/admin/index.html", root)),
    (error) => error?.code === "ENOENT",
  );
  const workflowHtml = await readProjectFile("public/workflows/index.html");
  assert.match(workflowHtml, /id="mainContent"/);
/*
  assert.match(workflowHtml, /宸ヤ綔娴佹帶鍒跺彴/);
*/
});

/*
  assert.match(html, /管理员口令/);
  assert.match(html, /HTTPS 或 SSH 隧道/);
  assert.match(html, /id="modelsPage"[^>]*hidden/);
  assert.doesNotMatch(html, /仅允许从服务器本机或 SSH 隧道访问/);
  assert.match(html, /\/hub\/app\.js/);
});
*/

test("administrator token can be verified before management controls are revealed", async () => {
  const server = await readProjectFile("server.mjs");
  const app = await readProjectFile("public/app.js");

  assert.match(server, /pathname === "\/api\/admin\/verify"/);
  assert.match(server, /hasAdminAccess\(request\)/);
  assert.match(app, /verifyAdminAccess/);
  assert.match(app, /adminUnlockButton/);
});

test("project status is derived from live capability readiness", async () => {
  const app = await readProjectFile("public/app.js");
  const styles = await readProjectFile("public/styles.css");

  assert.match(app, /function getProjectAvailability/);
  assert.match(app, /missingCapabilities\(project\.requiredCapabilities/);
  assert.match(app, /需配置模型/);
  assert.doesNotMatch(app, /availability\s*===\s*["']unavailable/);
  assert.match(app, /状态未知/);
  assert.match(app, /data-availability=/);
  assert.match(app, /pill--stage/);
  assert.match(app, /refreshProjectViews/);
  assert.match(styles, /pill--availability/);
  assert.match(styles, /data-state="setup"/);
});

test("Hub and shared project shell maintain a local recent-use trail", async () => {
  const app = await readProjectFile("public/app.js");
  const shell = await readProjectFile("public/suite-shell.js");

  for (const source of [app, shell]) {
    assert.match(source, /aiHub\.recentProjects\.v1/);
    assert.match(source, /localStorage/);
  }
  assert.match(app, /function recordRecentProject/);
  assert.match(app, /function renderRecentProjects/);
  assert.match(app, /使用 .* 次/);
  assert.match(shell, /recordRecentVisit/);
});

test("shared project shell resolves nested Hub project API paths", async () => {
  const shell = await readProjectFile("public/suite-shell.js");

  assert.match(shell, /firstSegment !== "hub"/);
  assert.match(shell, /projectId !== "hub" && segments\[1\]/);
  assert.match(shell, /`\/hub\/\$\{segments\[1\]\}`/);
});

test("shared shell loads project-specific design corrections without changing games", async () => {
  const [shell, idolTheme, qishengTheme, tarotTheme, grasslandTheme, elderTheme] = await Promise.all([
    readProjectFile("public/suite-shell.js"),
    readProjectFile("public/project-themes/idol.css"),
    readProjectFile("public/project-themes/qisheng.css"),
    readProjectFile("public/project-themes/tarot.css"),
    readProjectFile("public/project-themes/grassland.css"),
    readProjectFile("public/project-themes/elder.css"),
  ]);

  assert.match(shell, /function loadProjectStyles/);
  assert.match(shell, /idol: "20260730-idol2"/);
  assert.match(shell, /qisheng: "20260730-qisheng3"/);
  assert.match(shell, /tarot: "20260730-tarot1"/);
  assert.match(shell, /grassland: "20260730-grassland1"/);
  assert.match(shell, /elder: "20260730-elder1"/);
  assert.match(shell, /project-themes\/\$\{encodeURIComponent\(projectId\)\}\.css/);
  assert.match(shell, /"匹配实验室"/);
  assert.match(shell, /"陪伴设置"/);
  assert.match(idolTheme, /data-suite-kind="tool"\]\[data-suite-id="idol"/);
  assert.match(idolTheme, /prefers-reduced-motion/);
  assert.doesNotMatch(idolTheme, /data-suite-kind="game"/);
  assert.match(qishengTheme, /data-suite-kind="tool"\]\[data-suite-id="qisheng"/);
  assert.match(qishengTheme, /prefers-reduced-motion/);
  assert.doesNotMatch(qishengTheme, /data-suite-kind="game"/);
  assert.match(tarotTheme, /data-suite-kind="tool"\]\[data-suite-id="tarot"/);
  assert.match(tarotTheme, /--tarot-gold:/);
  assert.match(grasslandTheme, /data-suite-kind="tool"\]\[data-suite-id="grassland"/);
  assert.match(grasslandTheme, /--grassland-sun:/);
  assert.match(elderTheme, /data-suite-kind="tool"\]\[data-suite-id="elder"/);
  assert.match(elderTheme, /font-size:\s*18px/);
  for (const theme of [tarotTheme, grasslandTheme, elderTheme]) {
    assert.match(theme, /prefers-reduced-motion/);
    assert.doesNotMatch(theme, /data-suite-kind="game"/);
  }
});

test("XHS copywriting workbench prioritizes the brief and preview without a cramped third column", async () => {
  const [page, styles] = await Promise.all([
    readProjectFile("apps/xhs-copywriting-master/app/page.tsx"),
    readProjectFile("apps/xhs-copywriting-master/app/globals.css"),
  ]);

  assert.match(page, /xl:grid-cols-\[minmax\(320px,390px\)_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(page, /lg:grid-cols-\[390px_minmax\(0,1fr\)_310px\]/);
  assert.match(page, /className="xhs-advanced/);
  assert.match(page, /type="submit"/);
  assert.match(page, /resultPanelRef\.current\?\.scrollIntoView/);
  assert.match(styles, /data-suite-id="xhs-copywriting-master"/);
  assert.match(styles, /\.xhs-preview-panel::before/);
  assert.match(styles, /prefers-reduced-motion/);
});

test("board game browsers expose only their dedicated Hub GPT display", async () => {
  const sources = await Promise.all([
    readProjectFile("games/ai-xiangqi-duel/src/components/xiangqi-app.tsx"),
    readProjectFile("games/ai-chess-duel/src/components/chess-app.tsx"),
    readProjectFile("games/ai-go-duel/src/components/go-app.tsx"),
  ]);

  for (const source of sources) {
    assert.doesNotMatch(source, /type=["']password["']/i);
    assert.doesNotMatch(source, /label:\s*["'](?:DeepSeek|Claude|Gemini)["']/);
    assert.doesNotMatch(source, /<input[^>]+value=\{model\}/);
    assert.match(source, /\/api\/provider\/test/);
    assert.match(source, /Hub GPT/);
  }
});

test("every game exposes a lightweight return to AI HUB without loading the tool shell", async () => {
  const sources = await Promise.all([
    readProjectFile("games/ai-xiangqi-duel/src/components/xiangqi-app.tsx"),
    readProjectFile("games/ai-chess-duel/src/components/chess-app.tsx"),
    readProjectFile("games/ai-go-duel/src/components/go-app.tsx"),
    readProjectFile("games/fury-flock/index.html"),
    readProjectFile("public/dice-estate/index.html"),
  ]);

  for (const source of sources) {
    assert.match(source, /href=["']\/hub\/["']/);
    assert.match(source, /(?:game-hub-link|hub-home-link|site-hub-link)/);
    assert.doesNotMatch(source, /suite-tool-foundation\.css/);
  }
});

test("sensitive projects disclose data handling and professional boundaries", async () => {
  const html = await readProjectFile("public/index.html");
  const app = await readProjectFile("public/app.js");
  const styles = await readProjectFile("public/styles.css");

  assert.match(html, /id="privacyCenter"/);
  assert.match(html, /不记录提示词正文或生成结果正文/);
  assert.match(html, /请先移除身份证号、银行账号、客户资料和公司机密/);
  assert.match(app, /trustProfiles/);
  for (const id of [
    "ai-legal-clause-translator",
    "ai-data-analyst",
    "trace-sheet-workbench",
    "elder-fraud-assistant",
  ]) {
    assert.match(app, new RegExp(id));
  }
  assert.match(app, /pill--trust/);
  assert.match(styles, /\.trust-center/);
});

test("hub exposes shared model gateway routes without exposing keys in public config", async () => {
  const server = await readProjectFile("server.mjs");
  const app = await readProjectFile("public/app.js");

  assert.match(server, /\/api\/model-config/);
  assert.match(server, /\/api\/provider-models/);
  assert.match(server, /\/api\/chat/);
  assert.match(server, /\/api\/v1\/chat\/completions/);
  assert.match(server, /HUB_ADMIN_TOKEN/);
  assert.match(server, /HUB_PROJECT_TOKEN/);
  assert.match(server, /https:\/\/drhknode\.airouting\.com\/v1/);
  assert.doesNotMatch(server, /(OPENAI|GEMINI|ANTHROPIC|DEEPSEEK)_API_KEY/);
  assert.match(app, /x-hub-admin-token/);
  assert.match(app, /adminTokenInput/);
  assert.doesNotMatch(server, /__hub_browser_managed_admin__/);
  assert.doesNotMatch(app, /__hub_browser_managed_admin__/);
  assert.doesNotMatch(app, /x-hub-project-token/);
});

test("Dice Estate uses the Hub decision route without browser credentials", async () => {
  const [server, dice] = await Promise.all([
    readProjectFile("server.mjs"),
    readProjectFile("public/dice-estate/app.js"),
  ]);

  assert.match(server, /\/api\/agent\/decision/);
  assert.match(server, /dice-estate-duel/);
  assert.match(dice, /fetch\("\/api\/agent\/decision"/);
  assert.match(dice, /chooseDeterministicAction/);
  assert.doesNotMatch(dice, /x-hub-project-token/i);
});

test("hub model catalog exposes only the AI Routing provider and dynamic models", async () => {
  const server = await readProjectFile("server.mjs");
  const app = await readProjectFile("public/app.js");

  assert.match(server, /routing:\s*\{/);
  assert.match(server, /label:\s*"AI Routing"/);
  assert.match(server, /adapter:\s*"openai-compatible"/);
  assert.match(server, /discoverRoutingModels/);
  assert.match(server, /normalizeModelList/);
  assert.match(server, /enabledModels/);
  assert.match(app, /data-provider-model-catalog/);
  assert.match(app, /data-provider-model-name/);
  assert.match(app, /data-provider-refresh-models/);
  assert.match(app, /refreshProviderModels/);
  assert.match(app, /models,/);
  assert.match(app, /readonly aria-readonly="true"/);
  assert.doesNotMatch(server, /\n\s+(openai|deepseek|gemini|anthropic|qwen|kimi|zhipu|custom):\s*\{/);
});

test("hub forwards shared reasoning intent through the OpenAI-compatible route", async () => {
  const server = await readProjectFile("server.mjs");

  assert.match(server, /function getReasoningIntent/);
  assert.match(server, /reasoning_effort/);
  assert.match(server, /requestBody\.max_tokens = maxTokens/);
  assert.match(server, /\/chat\/completions/);
  assert.doesNotMatch(server, /function callGemini/);
  assert.doesNotMatch(server, /function callAnthropic/);
});

test("app avoids newer helpers that can break older local browsers", async () => {
  const app = await readProjectFile("public/app.js");

  assert.doesNotMatch(app, /\.replaceAll\(/);
  assert.doesNotMatch(app, /\.at\(/);
});
