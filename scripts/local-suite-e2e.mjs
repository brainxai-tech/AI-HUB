import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(path.join(root, "deploy/project-manifest.json"), "utf8")));
const runtimeDirectory = await mkdtemp(path.join(os.tmpdir(), "ai-hub-suite-e2e-"));
const artifactDirectory = process.env.AIHUB_E2E_ARTIFACT_DIR
  ? path.resolve(process.env.AIHUB_E2E_ARTIFACT_DIR)
  : path.join(runtimeDirectory, "artifacts");
const mockRequests = [];
let supervisor;
let browser;

const mockReport = {
  reportTitle: "E2E 统一路由工作汇报",
  period: "本周",
  managementSummary: "统一路由端到端验证已完成。",
  achievements: [{ title: "完成统一链路验证", detail: "浏览器请求经项目服务端与 Hub 项目级代理到达测试 GPT 上游。", evidence: ["请求链路完整"] }],
  issues: [],
  nextPlans: [{ item: "保持回归测试", goal: "持续验证统一模型体验", timing: "下次提交前" }],
  closingNote: "此内容由本地测试上游生成。",
};

const mockPersona = {
  headline: "你在安静中整理方向",
  reasoningSummary: "四个维度共同形成当前偏好，同时保留情境弹性。",
  dimensionInsights: [
    { dimension: "EI", conclusion: "偏向内在充电", reason: "独处场景回答一致。", evidenceQuestionIds: [5, 13], nuance: "必要社交与内向偏好并不冲突。" },
    { dimension: "SN", conclusion: "偏向整体可能", reason: "更常关注模式与方向。", evidenceQuestionIds: [10, 26], nuance: "重要决定仍会核对事实。" },
    { dimension: "TF", conclusion: "价值感受优先", reason: "决策持续考虑相关人的体验。", evidenceQuestionIds: [3, 27], nuance: "重视感受不等于缺少逻辑。" },
    { dimension: "JP", conclusion: "保留探索空间", reason: "对变化的接受度较高。", evidenceQuestionIds: [8, 32], nuance: "关键节点仍可以主动规划。" },
  ],
  crossSignals: ["既需要独处，也愿意为重视的人主动连接。"],
  growthExperiments: [
    { title: "十五分钟开工", action: "选一件事先投入十五分钟。", rationale: "用小行动保护理想。" },
    { title: "边界句", action: "清楚拒绝一件非必要请求。", rationale: "减少价值消耗。" },
    { title: "事实核对", action: "决定前写下三个事实。", rationale: "平衡直觉与证据。" },
  ],
  closingNote: "把结果当作当前偏好地图，而不是终身标签。",
};

const mockPoems = {
  drafts: [
    { style: "清雅", title: "竹林夜月", lines: ["清风入竹林", "月照一池心", "远客听松语", "归舟带梦深"], interpretation: "以月夜写静思。", imagery: ["竹林", "明月", "归舟"] },
    { style: "雄浑", title: "塞上长风", lines: ["长风开远塞", "落日照孤城", "万里云涛起", "一歌天地明"], interpretation: "以边塞写开阔心境。", imagery: ["长风", "落日", "云涛"] },
    { style: "自然", title: "雨后村居", lines: ["小雨过前村", "新茶暖旧痕", "儿童归学晚", "灯火照柴门"], interpretation: "以村居写寻常温度。", imagery: ["小雨", "新茶", "灯火"] },
  ],
};

const mockUpstream = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  mockRequests.push({ method: request.method, url: request.url, body });
  if (request.url === "/v1/models" && request.method === "GET") {
    return sendJson(response, 200, { data: [{ id: "gpt-e2e" }] });
  }
  if (request.url === "/v1/chat/completions" && request.method === "POST") {
    const payload = JSON.parse(body);
    const systemPrompt = payload.messages?.find(({ role }) => role === "system")?.content || "";
    let content;
    if (systemPrompt.includes("Dice Estate strategy decision module")) {
      const userMessage = payload.messages?.find(({ role }) => role === "user")?.content || "{}";
      const diceRequest = JSON.parse(userMessage);
      const legalAction = diceRequest.legal_actions?.[0];
      content = JSON.stringify({
        turnId: diceRequest.turn_id,
        stateVersion: diceRequest.state_version,
        legalActionsHash: diceRequest.legal_actions_hash,
        agentId: diceRequest.agent_id,
        actionId: legalAction?.actionId,
        actionType: legalAction?.actionType,
        params: legalAction?.params || {},
        publicLine: "E2E Hub GPT 决策",
        decisionCode: diceRequest.allowed_decision_codes?.[0],
      });
    } else if (/chess coach|Xiangqi|9x9 Go/i.test(systemPrompt)) {
      content = JSON.stringify({ explanation: "E2E Hub GPT 教练讲解" });
    } else if (systemPrompt.includes("人格偏好解读师")) {
      content = JSON.stringify(mockPersona);
    } else if (systemPrompt.includes("吟舟 AI")) {
      content = JSON.stringify(mockPoems);
    } else {
      content = JSON.stringify(mockReport);
    }
    return sendJson(response, 200, {
      choices: [{ message: { role: "assistant", content } }],
    });
  }
  return sendJson(response, 404, { error: { message: "Not found" } });
});

try {
  const mockPort = await listenOnFreePort(mockUpstream);
  supervisor = spawn(process.execPath, ["scripts/local-suite.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      AIHUB_LOCAL_RUNTIME_DIR: runtimeDirectory,
      AIHUB_SUITE_START_TIMEOUT_MS: "240000",
      HUB_ROUTING_BASE_URL: `http://127.0.0.1:${mockPort}/v1`,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const supervisorOutput = collectOutput(supervisor);
  await Promise.all([
    waitUntilReady("http://127.0.0.1:4194/hub/api/health", supervisor, 240_000),
    waitUntilReady("http://127.0.0.1:4195/health", supervisor, 240_000),
    ...manifest.projects.filter(({ api }) => api === "dedicated").map((project) =>
      waitUntilReady(`http://127.0.0.1:${project.port}${project.route}api/providers`, supervisor, 240_000),
    ),
    ...manifest.games.map((game) =>
      waitUntilReady(`http://127.0.0.1:4194${game.route}`, supervisor, 240_000),
    ),
  ]);

  const discovered = await fetchJson("http://127.0.0.1:4194/hub/api/provider-models", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apiKey: "e2e-routing-key" }),
  });
  assert.deepEqual(discovered.models, ["gpt-e2e"]);

  const configured = await fetchJson("http://127.0.0.1:4194/hub/api/model-config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      defaultProvider: "routing",
      providers: {
        routing: {
          enabled: true,
          apiKey: "e2e-routing-key",
          models: ["gpt-e2e"],
          enabledModels: ["gpt-e2e"],
        },
      },
    }),
  });
  assert.equal(configured.defaultProvider, "routing");
  assert.equal(JSON.stringify(configured).includes("e2e-routing-key"), false);

  for (const route of ["/xiangqi", "/chess", "/go"]) {
    const providerCheck = await fetchJson(`http://127.0.0.1:4194${route}/api/provider/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "openai", model: "gpt-5.4-mini" }),
    });
    assert.deepEqual(providerCheck.models, ["gpt-e2e"], `${route} did not inherit the Hub GPT catalog`);
  }

  const selection = await fetchJson("http://127.0.0.1:4194/work-report/api/model-selection", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-e2e" }),
  });
  assert.equal(selection.model, "gpt-e2e");

  for (const project of [...manifest.projects, ...manifest.games]) {
    const response = await fetch(`http://127.0.0.1:4194${project.route}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    assert.equal(
      response.ok,
      true,
      `${project.id} returned ${response.status}${response.headers.get("location") ? ` -> ${response.headers.get("location")}` : ""}`,
    );
    assert.match(response.headers.get("content-type") || "", /text\/html/i, `${project.id} did not return HTML`);
    assert.ok((await response.text()).length > 80, `${project.id} returned an empty page`);
  }

  const playwrightUrl = pathToFileURL(path.join(root, "apps/ai-ppt-report-coach/node_modules/playwright/index.mjs")).href;
  const { chromium } = await import(playwrightUrl);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (error) => console.error(`[browser page error] ${error.message}`));
  page.on("requestfailed", (request) =>
    console.error(`[browser request failed] ${request.method()} ${request.url()}: ${request.failure()?.errorText || "unknown"}`),
  );

  await page.goto("http://127.0.0.1:4194/hub/", { waitUntil: "networkidle" });
  assert.ok(await page.locator("[data-project-card]").count() >= 32, "Hub project catalog did not render");

  await page.goto("http://127.0.0.1:4194/work-report/", { waitUntil: "domcontentloaded" });
  await page.locator(".suite-model-trigger").waitFor({ state: "visible" });
  assert.match(await page.locator(".suite-model-trigger").innerText(), /gpt-e2e/i);
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  assert.equal(await page.locator("select:not(.suite-model-select)").count(), 0);
  await page.locator('textarea[aria-label="零散工作记录"]').fill("本周完成统一启动、Hub 项目代理和端到端体验验证，并确认所有关键路径正常。 ");
  const generateButton = page.locator("button.generate-button");
  await assertEventually(async () => await generateButton.isEnabled(), "work report generation button stayed disabled");
  await generateButton.click();
  await page.getByRole("heading", { name: mockReport.reportTitle }).waitFor({ state: "visible", timeout: 30_000 });

  const chatRequest = mockRequests.find(({ url }) => url === "/v1/chat/completions");
  assert.ok(chatRequest, "No chat request reached the routing upstream");
  const chatPayload = JSON.parse(chatRequest.body);
  assert.equal(chatPayload.model, "gpt-e2e");
  assert.equal(chatPayload.provider, undefined);

  const personaResponse = await fetchJson("http://127.0.0.1:4194/mbti/api/ai-interpretation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answers: Object.fromEntries(Array.from({ length: 32 }, (_, index) => [String(index + 1), 2])) }),
  });
  assert.equal(personaResponse.data.headline, mockPersona.headline);
  assert.equal(personaResponse.meta.model, "gpt-e2e");

  const essayResponse = await fetchJson("http://127.0.0.1:4194/essay/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: {
        prompt: "请以一次主动承担责任的经历为题写一篇文章。",
        grade: "初三",
        genre: "记叙文",
        targetLength: 800,
        includePunctuation: true,
        scene: "日常练习",
      },
    }),
  });
  assert.ok(essayResponse.data.requirements.length >= 3);
  assert.equal(essayResponse.meta.model, "gpt-e2e");

  const poetryResponse = await fetchJson("http://127.0.0.1:4194/poetry/api/poems/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: {
        theme: "雨后归舟",
        genre: "five-quatrain",
        mode: "regulated",
        rhymeBook: "new-rhyme",
        mood: "quiet",
        acrostic: "",
      },
    }),
  });
  assert.equal(poetryResponse.data.drafts.length, 3);
  assert.equal(poetryResponse.meta.model, "gpt-e2e");

  for (const [projectId, route] of [
    ["mbti-persona-compass", "/mbti/"],
    ["ai-essay-coach", "/essay/"],
    ["yingzhou-ai", "/poetry/"],
  ]) {
    await page.goto(`http://127.0.0.1:4194${route}`, { waitUntil: "networkidle" });
    await page.locator(".suite-model-trigger").waitFor({ state: "visible" });
    assert.match(await page.locator(".suite-model-trigger").innerText(), /gpt-e2e/i, `${projectId} did not display the Hub GPT model`);
    await assertNoBrowserCredentials(page, projectId);
  }

  for (const promptFragment of ["人格偏好解读师", "中文写作教练", "吟舟 AI"]) {
    const request = findChatRequest(promptFragment);
    assert.ok(request, `${promptFragment} request did not reach the routing upstream`);
    assert.equal(JSON.parse(request.body).model, "gpt-e2e");
  }

  await page.goto("http://127.0.0.1:4194/xiangqi/", { waitUntil: "networkidle" });
  await page.locator("#setup-title").waitFor({ state: "visible" });
  await assertNoBrowserCredentials(page, "ai-xiangqi-duel");
  await assertEventually(
    async () => (await page.locator('output[aria-label*="Hub GPT"]').textContent())?.trim() === "gpt-e2e",
    "Xiangqi did not display the Hub GPT model",
  );
  await page.locator("button.start-button").click();
  await page.locator(".xiangqi-board").waitFor({ state: "visible" });
  await page.locator('button.board-point:has(.coord:text-is("a9"))').click();
  await page.locator('button.board-point:has(.coord:text-is("a8"))').click();
  await page.locator(".move-callout.engine").waitFor({ state: "visible", timeout: 60_000 });

  await page.goto("http://127.0.0.1:4194/chess/", { waitUntil: "networkidle" });
  await page.locator(".chess-board").waitFor({ state: "visible" });
  await assertNoBrowserCredentials(page, "ai-chess-duel");
  await assertEventually(
    async () => (await page.locator('output[aria-label*="Hub GPT"]').textContent())?.trim() === "gpt-e2e",
    "Chess did not display the Hub GPT model",
  );
  await page.locator('button[aria-label^="e2"]').click();
  await page.locator('button[aria-label^="e4"]').click();
  await assertEventually(
    async () => (await page.locator(".move-list li").count()) >= 2,
    "Chess AI did not answer the legal e2-e4 move",
  );
  const chessCoachPanel = page.locator(".panel").filter({ has: page.locator(".model-readout") });
  await chessCoachPanel.locator("button.primary-button").click();
  await chessCoachPanel.locator(".coach-box").filter({ hasText: "E2E Hub GPT 教练讲解" }).waitFor({
    state: "visible",
    timeout: 30_000,
  });

  await page.goto("http://127.0.0.1:4194/go/", { waitUntil: "networkidle" });
  await page.locator(".go-board").waitFor({ state: "visible" });
  await assertNoBrowserCredentials(page, "ai-go-duel");
  await assertEventually(
    async () => (await page.locator('output[aria-label*="Hub GPT"]').textContent())?.trim() === "gpt-e2e",
    "Go did not display the Hub GPT model",
  );
  await page.locator('button[aria-label="5,5"]').click();
  await assertEventually(
    async () => (await page.locator(".move-list li").count()) >= 2,
    "Go AI did not answer the legal center move",
  );

  await page.goto("http://127.0.0.1:4194/fury-flock/", { waitUntil: "networkidle" });
  await page.locator("#site-home-title").waitFor({ state: "visible" });
  await assertNoBrowserCredentials(page, "fury-flock");
  await page.locator("[data-site-planner]").first().click();
  await page.locator("#site-chapter-card").click();
  await page.locator("#site-planner-start-button").click();
  await page.locator("canvas").waitFor({ state: "visible", timeout: 30_000 });
  const initialHint = await page.locator("#hint-text").innerText();
  await page.locator("#fire-button").click();
  await assertEventually(
    async () => (await page.locator("#hint-text").innerText()) !== initialHint,
    "Fury Flock did not react to the fire action",
  );
  await mkdir(artifactDirectory, { recursive: true });
  const furyScreenshot = path.join(artifactDirectory, "fury-flock-gameplay.png");
  await page.screenshot({ path: furyScreenshot, fullPage: true });

  await page.evaluate(() => {
    localStorage.removeItem("dice-estate-duel-save");
    localStorage.setItem(
      "dice-estate-duel-settings",
      JSON.stringify({ agentMode: "hub", animationSpeed: "fast", reduceMotion: true, muted: true }),
    );
    localStorage.setItem(
      "dice-estate-duel-profile",
      JSON.stringify({ tutorialEnabled: false, tutorialCompleted: true, tutorialProgress: {} }),
    );
  });
  await page.goto("http://127.0.0.1:4194/hub/dice-estate/", { waitUntil: "networkidle" });
  await page.locator("#board").waitFor({ state: "visible" });
  await assertNoBrowserCredentials(page, "dice-estate-duel");
  await page.locator('#actions [data-action="roll"]').click();
  await assertEventually(
    async () => Boolean(await page.evaluate(() => localStorage.getItem("dice-estate-duel-save"))),
    "Dice Estate did not persist the played turn",
  );
  await assertEventually(
    async () => {
      if (findChatRequest("Dice Estate strategy decision module")) return true;
      const action = page.locator(
        '#actions button[data-action]:not([disabled]):not([data-action="toggle-agent-speed"]):not([data-action="skip-agent-show"])',
      ).first();
      if (await action.isVisible().catch(() => false)) {
        await action.click({ force: true, timeout: 500 }).catch(() => undefined);
      }
      return false;
    },
    "Dice Estate did not route an Agent decision through Hub GPT",
    30_000,
  );

  const chessRequest = findChatRequest("chess coach");
  const diceRequest = findChatRequest("Dice Estate strategy decision module");
  assert.ok(chessRequest, "Chess coach request did not reach the routing upstream");
  assert.ok(diceRequest, "Dice Estate decision did not reach the routing upstream");
  assert.equal(JSON.parse(chessRequest.body).model, "gpt-e2e");
  assert.equal(JSON.parse(diceRequest.body).model, "gpt-e2e");

  const observability = (await readFile(path.join(runtimeDirectory, "observability-events.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  for (const projectId of ["mbti-persona-compass", "ai-essay-coach", "yingzhou-ai", "ai-chess-duel", "dice-estate-duel"]) {
    assert.ok(
      observability.some((event) => event.eventType === "generate" && event.projectId === projectId && event.statusCode === 200),
      `${projectId} was not recorded as a successful Hub generation`,
    );
  }

  console.log(
    `Local suite E2E passed: ${manifest.projects.length} tools, ${manifest.games.length} games, three imported products, Hub GPT routing, and Fury screenshot at ${furyScreenshot}.`,
  );
} catch (error) {
  if (supervisor) {
    const output = supervisor.__capturedOutput?.() || "";
    if (output) console.error(output.slice(-4000));
  }
  throw error;
} finally {
  if (browser) await browser.close();
  if (supervisor && supervisor.exitCode === null) {
    await writeFile(path.join(runtimeDirectory, "suite.stop"), "stop", "utf8");
    await Promise.race([
      new Promise((resolve) => supervisor.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 20_000)),
    ]);
    if (supervisor.exitCode === null) {
      throw new Error("Local suite supervisor did not stop its child processes cleanly");
    }
  }
  await new Promise((resolve) => mockUpstream.close(resolve));
  await rm(runtimeDirectory, { recursive: true, force: true });
}

function collectOutput(child) {
  let output = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      output = `${output}${chunk}`.slice(-20_000);
    });
  }
  child.__capturedOutput = () => output;
  return () => output;
}

async function waitUntilReady(url, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Local suite supervisor exited with ${child.exitCode}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
      if (response.ok) return;
    } catch {
      // Retry within the bounded startup deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function fetchJson(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.ok, true, `${url} returned ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function listenOnFreePort(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function findChatRequest(systemPromptFragment) {
  return mockRequests.find(({ url, body }) => {
    if (url !== "/v1/chat/completions") return false;
    try {
      const payload = JSON.parse(body);
      return payload.messages?.some(
        ({ role, content }) => role === "system" && String(content).includes(systemPromptFragment),
      );
    } catch {
      return false;
    }
  });
}

async function assertNoBrowserCredentials(page, projectId) {
  assert.equal(await page.locator('input[type="password"]').count(), 0, `${projectId} exposed a password input`);
  assert.equal(
    await page.locator('input[name*="api" i], input[id*="api-key" i], input[placeholder*="API Key" i]').count(),
    0,
    `${projectId} exposed an API Key input`,
  );
}

async function assertEventually(predicate, message, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(message);
}
