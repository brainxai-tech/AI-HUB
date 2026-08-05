import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import * as serverModule from "./server.mjs";
import {
  clientProjectIds,
  extractClientEnvCredentials,
  extractCredentials,
} from "./provision-credentials.mjs";

const {
  buildHubPayload,
  createScopedFetch,
  extractHubText,
  normalizeRequestPath,
  projectIds,
  shouldUseVisualFallback,
  unifiedProviderPayload,
} = serverModule;

test("extractHubText reads OpenAI-compatible responses", () => {
  assert.equal(
    extractHubText({ choices: [{ message: { content: "  可视化结果  " } }] }),
    "可视化结果",
  );
});

test("shared model calls require a JSON object for visual rendering", () => {
  assert.deepEqual(buildHubPayload({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "return structured data" }],
    temperature: 0.4,
    maxTokens: 1200,
  }), {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "return structured data" }],
    temperature: 0.4,
    max_tokens: 1200,
    response_format: { type: "json_object" },
    stream: false,
  });
});

test("visual fallback is limited to upstream/server failures", () => {
  assert.equal(shouldUseVisualFallback({ status: 502, code: "SCHEMA_ERROR" }), true);
  assert.equal(shouldUseVisualFallback({ status: 429, code: "HUB_MODEL_ERROR" }), false);
  assert.equal(shouldUseVisualFallback({ status: 422, code: "VALIDATION_ERROR" }), false);
});

test("normalizeRequestPath keeps project API prefixes", () => {
  assert.equal(normalizeRequestPath("/tone/api/providers?fresh=1"), "/tone/api/providers");
});

test("legacy provider endpoints expose only the active GPT project selection", () => {
  const gpt = unifiedProviderPayload({ model: "gpt-5.4-mini" });
  assert.equal(gpt.configured, true);
  assert.equal(gpt.defaultProvider, "openai");
  assert.deepEqual(gpt.providers.map((provider) => provider.id), ["openai"]);
  assert.deepEqual(gpt.providers[0].models, ["gpt-5.4-mini"]);
  assert.equal(gpt.providers[0].label, "GPT · AI Routing");

  const codex = unifiedProviderPayload({ model: "gpt-5.3-codex-spark" });
  assert.equal(codex.defaultProvider, "openai");
  assert.deepEqual(codex.providers.map((provider) => provider.id), ["openai"]);
  assert.deepEqual(codex.providers[0].models, ["gpt-5.3-codex-spark"]);

  for (const unsupported of ["codex-auto-review", "gemini-2.5-pro", "claude-sonnet-4-6", "deepseek-chat"]) {
    const payload = unifiedProviderPayload({ model: unsupported });
    assert.equal(payload.configured, false);
    assert.deepEqual(payload.providers, []);
  }
});

test("migrated projects are part of the shared runtime manifest", () => {
  assert.deepEqual(projectIds().sort(), [
    "ai-aesthetic-fingerprint",
    "ai-anti-motivation-coach",
    "ai-bedtime-story-factory",
    "ai-book-decomposer",
    "ai-cold-start-brand-lab",
    "ai-cooking-coach",
    "ai-counterfactual-life-simulator",
    "ai-course-teaching-assistant",
    "ai-data-analyst",
    "ai-dream-director",
    "ai-emotional-companion-local",
    "ai-english-theater",
    "ai-legal-clause-translator",
    "ai-life-version-controller",
    "ai-life-villain-generator",
    "ai-misunderstanding-simulator",
    "ai-one-person-board",
    "ai-paper-reading-coach",
    "ai-parallel-universe-daily",
    "ai-reality-filter-translator",
    "ai-tarot-sanctum",
    "ai-tone-dressing-room",
    "ai-zhougong-dream",
    "elder-fraud-assistant",
    "idol-match-test",
    "qingqing-grassland-personality",
    "trace-sheet-workbench",
    "xhs-copywriting-master",
  ]);
});

test("scoped cooking fetch rewrites Hub chat URL and injects only project-scoped headers", async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return new Response("{}", { status: 200 });
  };
  const scopedFetch = createScopedFetch(
    { id: "ai-cooking-coach", basePath: "/cooking" },
    { token: "c".repeat(32) },
    fetchImpl,
    "http://127.0.0.1:4194/hub/api/v1/chat/completions",
  );

  await scopedFetch("http://127.0.0.1:4194/api/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer ignored-upstream" },
    body: "{}",
  });

  assert.equal(captured.url, "http://127.0.0.1:4194/hub/api/v1/chat/completions");
  assert.equal(captured.options.headers.get("x-hub-project-id"), "ai-cooking-coach");
  assert.equal(captured.options.headers.get("x-hub-project-token"), "c".repeat(32));
  assert.equal(captured.options.headers.get("x-hub-project-path"), "/cooking");
  assert.equal(captured.options.headers.get("content-type"), "application/json");
  assert.equal(captured.options.headers.get("authorization"), "Bearer ignored-upstream");
});

test("main-module detection resolves a current release symlink", () => {
  const runtimeRoot = path.resolve("test-runtime");
  const releasePath = path.join(runtimeRoot, "releases", "20260715T035500", "server.mjs");
  const currentPath = path.join(runtimeRoot, "current", "server.mjs");
  const realpath = (value) => (value === currentPath ? releasePath : value);
  assert.equal(
    serverModule.isMainModule?.(
      pathToFileURL(releasePath).href,
      currentPath,
      realpath,
    ),
    true,
  );
});

test("shared runtime resolves a current apps symlink before installing import hooks", () => {
  const runtimeRoot = path.resolve("test-runtime");
  const currentApps = path.join(runtimeRoot, "current", "apps");
  const releaseApps = path.join(runtimeRoot, "releases", "20260730T073857", "apps");
  const realpath = (value) => (value === currentApps ? releaseApps : value);
  assert.equal(serverModule.resolveAppsRoot(currentApps, realpath), releaseApps);
});

test("extractCredentials selects both shared-runtime batches", () => {
  const dump = Object.values(projectSpecsForTest()).map(({ id, token }) => ({
    name: id,
    HUB_PROJECT_ID: id,
    HUB_PROJECT_TOKEN: token,
  }));
  dump.push({ name: "unrelated", HUB_PROJECT_TOKEN: "do-not-copy-this-token-value" });

  const result = extractCredentials(dump);
  assert.deepEqual(Object.keys(result.projects).sort(), [
    "ai-anti-motivation-coach",
    "ai-cooking-coach",
    "ai-counterfactual-life-simulator",
    "ai-life-villain-generator",
    "ai-misunderstanding-simulator",
    "ai-one-person-board",
    "ai-parallel-universe-daily",
    "ai-tone-dressing-room",
  ]);
});

test("client env provisioning covers the complete Hub credential manifest", () => {
  const envFiles = Object.fromEntries(clientProjectIds.map((projectId, index) => [
    `${projectId}.env`,
    `HUB_PROJECT_ID=${projectId}\nHUB_PROJECT_TOKEN=${String(index).padStart(2, "0")}${"x".repeat(30)}\n`,
  ]));
  envFiles["unrelated.env"] = "HUB_PROJECT_ID=unrelated\nHUB_PROJECT_TOKEN=do-not-copy-this-token-value\n";

  const result = extractClientEnvCredentials(envFiles);
  assert.equal(clientProjectIds.length, 33);
  assert.deepEqual(Object.keys(result.projects).sort(), [...clientProjectIds].sort());
});

function projectSpecsForTest() {
  return {
    villain: { id: "ai-life-villain-generator", token: "v".repeat(32) },
    parallel: { id: "ai-parallel-universe-daily", token: "p".repeat(32) },
    tone: { id: "ai-tone-dressing-room", token: "t".repeat(32) },
    cooking: { id: "ai-cooking-coach", token: "c".repeat(32) },
    life: { id: "ai-counterfactual-life-simulator", token: "l".repeat(32) },
    board: { id: "ai-one-person-board", token: "b".repeat(32) },
    anti: { id: "ai-anti-motivation-coach", token: "a".repeat(32) },
    misunderstanding: { id: "ai-misunderstanding-simulator", token: "m".repeat(32) },
  };
}
