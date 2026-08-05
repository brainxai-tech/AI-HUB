import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (pathname) => readFile(new URL(`../${pathname}`, import.meta.url), "utf8");

test("public hub has three accessible navigation panels without removing project entry points", async () => {
  const [home, script, styles] = await Promise.all([
    read("public/index.html"),
    read("public/app.js"),
    read("public/styles.css"),
  ]);

  assert.match(home, /class="hub-task-nav" aria-label="AI HUB 功能分区"/);
  assert.match(home, /id="hubTaskSidebar" class="hub-task-sidebar" aria-label="AI HUB 主菜单"/);
  assert.match(home, /id="hubSidebarToggle"[\s\S]*?class="hub-sidebar-toggle"/);
  assert.match(home, /id="hubMobileMenuToggle"[\s\S]*?class="hub-mobile-menu-toggle"/);
  assert.match(home, /id="hubSidebarMask" class="hub-sidebar-mask" hidden/);
  assert.match(home, /data-page-target="model-intro"[\s\S]*?模型图鉴/);
  assert.match(home, /data-page-target="projects"[\s\S]*?AI 项目/);
  assert.match(home, /data-page-target="provider-service"[\s\S]*?模型中转商服务/);
  assert.match(home, /id="projectsPage" class="page-panel" data-page-panel="projects"/);
  assert.match(home, /id="modelIntroPage" class="page-panel" data-page-panel="model-intro"[\s\S]*?id="modelAtlas"/);
  assert.match(home, /href="\/hub\/model-guide\.css\?v=20260730-comparison1"/);
  assert.match(home, /id="providerServicePage" class="page-panel" data-page-panel="provider-service"[\s\S]*?providerRelayGrid/);
  assert.match(home, /id="providerRelayModelFilter"/);
  assert.match(home, /id="providerRelayPriceTableBody"/);
  assert.match(home, /id="providerRelayHowtoTitle"/);
  assert.match(home, /id="providerRelayDetailOffers"/);
  assert.match(home, /href="\/hub\/workflows\/">工作流控制台/);
  assert.match(home, /id="projectGrid" class="project-grid"/);
  assert.match(script, /"#provider-service": "provider-service"/);
  assert.match(script, /state\.page = supportsPage \? page : "projects"/);
  assert.match(script, /function loadModelAtlas/);
  assert.match(script, /fetch\("\/hub\/models\.html"/);
  assert.match(script, /model-guide-data\.js/);
  assert.match(script, /function setMobileSidebarOpen/);
  assert.match(script, /sidebarCollapsedStorageKey/);
  assert.match(script, /function loadProviderRelays/);
  assert.match(script, /requestJson\("\/api\/provider-relays/);
  assert.match(script, /requestJson\("\/api\/provider-model-prices/);
  assert.match(script, /renderProviderRelayComparison/);
  assert.match(script, /if \(!state\.providerRelayModel\)/);
  assert.match(script, /matchesModel = provider\.models\.some/);
  assert.match(home, /href="\/hub\/relay-console\/"/);
  assert.match(styles, /\.hub-content \{[\s\S]*grid-column: 2/);
  assert.match(styles, /\.hub-workspace \{[\s\S]*grid-template-columns: minmax\(238px, 268px\) minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(max-width: 760px\) \{[\s\S]*?\.hub-workspace \{[\s\S]*grid-template-columns: 1fr/);
});

test("workflow center is an administrator-gated external-script application", async () => {
  const [home, html, script] = await Promise.all([
    read("public/index.html"),
    read("public/workflows/index.html"),
    read("public/workflows/workflows.js"),
  ]);

  assert.match(home, /href="\/hub\/workflows\/">工作流控制台/);
  assert.match(html, /id="unlockForm"/);
  assert.match(html, /id="adminTokenInput"[^>]*type="password"/s);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /SSH 隧道/);
  assert.match(html, /默认保留 30 天/);
  assert.match(html, /原始单元格始终留在浏览器/);
  assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/i);
  assert.match(script, /let adminToken = ""/);
  assert.doesNotMatch(script, /localStorage/);
  assert.doesNotMatch(script, /sessionStorage\.setItem\([^\n]*(?:admin|token)/i);
});

test("workflow center supports all six forms and the complete run lifecycle", async () => {
  const script = await read("public/workflows/workflows.js");
  for (const skillId of [
    "coach-chinese-essay",
    "plan-weekly-meals",
    "read-research-paper",
    "build-course-pack",
    "review-legal-clause",
    "operate-trace-sheet",
  ]) {
    assert.match(script, new RegExp(`"${skillId}"`));
  }
  for (const operation of ["createRun", "getRun", "resumeRun", "retryRun", "actionRun", "deleteRun"]) {
    assert.match(script, new RegExp(`function ${operation}|const ${operation}`));
  }
  assert.match(script, /textField\("profile\.pantry"/);
  assert.doesNotMatch(script, /profile\.availableIngredients/);
  assert.doesNotMatch(script, /textField\("constraints"[^\n]*transform: "json"/);
  assert.match(script, /await loadAvailableSkills\(\)/);
  assert.doesNotMatch(script, /hubRequest\("\/hub\/api\/admin\/verify"/);
  assert.match(script, /sessionStorage\.setItem\(RECENT_RUNS_KEY/);
  assert.match(script, /\.textContent\s*=/);
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
});
