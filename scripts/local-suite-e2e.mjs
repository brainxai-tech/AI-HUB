import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(path.join(root, "deploy/project-manifest.json"), "utf8")));
const runtimeDirectory = await mkdtemp(path.join(os.tmpdir(), "ai-hub-suite-e2e-"));
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

const mockUpstream = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  mockRequests.push({ method: request.method, url: request.url, body });
  if (request.url === "/v1/models" && request.method === "GET") {
    return sendJson(response, 200, { data: [{ id: "gpt-e2e" }] });
  }
  if (request.url === "/v1/chat/completions" && request.method === "POST") {
    return sendJson(response, 200, {
      choices: [{ message: { role: "assistant", content: JSON.stringify(mockReport) } }],
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
  await waitUntilReady("http://127.0.0.1:4194/hub/api/health", supervisor, 240_000);

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
  assert.equal(configured.defaultProvider, "openai");
  assert.equal(JSON.stringify(configured).includes("e2e-routing-key"), false);

  const selection = await fetchJson("http://127.0.0.1:4194/work-report/api/model-selection", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-e2e" }),
  });
  assert.equal(selection.model, "gpt-e2e");

  for (const project of manifest.projects) {
    const response = await fetch(`http://127.0.0.1:4194${project.route}`, {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    assert.equal(response.ok, true, `${project.id} returned ${response.status}`);
    assert.match(response.headers.get("content-type") || "", /text\/html/i, `${project.id} did not return HTML`);
    assert.ok((await response.text()).length > 80, `${project.id} returned an empty page`);
  }

  const playwrightUrl = pathToFileURL(path.join(root, "apps/ai-ppt-report-coach/node_modules/playwright/index.mjs")).href;
  const { chromium } = await import(playwrightUrl);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  await page.goto("http://127.0.0.1:4194/hub/", { waitUntil: "networkidle" });
  assert.ok(await page.locator("[data-project-card]").count() >= 29, "Hub project catalog did not render");

  await page.goto("http://127.0.0.1:4194/work-report/", { waitUntil: "networkidle" });
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

  console.log(`Local suite E2E passed: ${manifest.projects.length} project routes and browser generation through Hub GPT routing.`);
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

async function assertEventually(predicate, message) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(message);
}
