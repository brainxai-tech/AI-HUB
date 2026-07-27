import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const legacyToken = "integration-legacy-token-with-at-least-32-characters";
const adminToken = "integration-admin-token-with-at-least-32-characters";
let child;
let temporaryDirectory;
let baseUrl;
let observabilityLogPath;

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitUntilReady(url) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {
      // Retry until the bounded deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Integration server did not become ready.");
}

before(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "ai-project-hub-test-"));
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  observabilityLogPath = path.join(temporaryDirectory, "observability.jsonl");
  child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(port),
      HUB_ADMIN_TOKEN: adminToken,
      HUB_PROJECT_TOKEN: legacyToken,
      HUB_ALLOW_LEGACY_PROJECT_TOKEN: "true",
      HUB_ALLOW_LEGACY_COZE_CONFIG: "false",
      HUB_CONFIG_PATH: path.join(temporaryDirectory, "model-config.json"),
      HUB_PROJECT_TOKENS_PATH: path.join(temporaryDirectory, "project-tokens.json"),
      HUB_OBSERVABILITY_LOG_PATH: observabilityLogPath,
      HUB_TRACK_RATE_LIMIT_PER_MINUTE: "2",
    },
  });
  await waitUntilReady(baseUrl);
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
  }
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("gateway requires project authentication before parsing chat input", async () => {
  const missing = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).error.code, "PROJECT_AUTH_REQUIRED");

  const wrong = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-project-token": "wrong-integration-token-with-at-least-32-characters",
    },
    body: JSON.stringify({}),
  });
  assert.equal(wrong.status, 401);
});

test("health reports missing runtime configuration without exposing its path", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.healthy, false);
  assert.equal(body.status, "degraded");
  assert.deepEqual(body.configuration, { state: "degraded", code: "CONFIG_MISSING" });
  assert.equal(JSON.stringify(body).includes(temporaryDirectory), false);
});

test("anonymous tracking enforces body and per-client rate limits", async () => {
  const oversized = await fetch(`${baseUrl}/api/track`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "192.0.2.10" },
    body: JSON.stringify({ projectPath: "/legal", padding: "x".repeat(3_000) }),
  });
  assert.equal(oversized.status, 413);

  for (let index = 0; index < 2; index += 1) {
    const accepted = await fetch(`${baseUrl}/api/track`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "192.0.2.20" },
      body: JSON.stringify({
        eventType: "page_visit",
        projectPath: "/legal?private=1",
        prompt: "must not be logged",
      }),
    });
    assert.equal(accepted.status, 202);
  }

  const limited = await fetch(`${baseUrl}/api/track`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "192.0.2.20" },
    body: JSON.stringify({ eventType: "page_visit", projectPath: "/legal" }),
  });
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.code, "TRACK_RATE_LIMITED");
});

test("authenticated chat input is validated before provider selection", async () => {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-project-token": legacyToken,
    },
    body: JSON.stringify({ messages: [] }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_MESSAGES");
});

test("legacy Coze credential endpoint is retired and public config excludes secrets", async () => {
  const retired = await fetch(`${baseUrl}/api/integrations/coze`, {
    headers: { "x-hub-project-token": legacyToken },
  });
  assert.equal(retired.status, 410);
  assert.equal((await retired.json()).error.code, "COZE_CONFIG_ENDPOINT_RETIRED");

  const config = await fetch(`${baseUrl}/api/model-config`).then((response) => response.json());
  assert.equal(JSON.stringify(config).includes("apiKey"), false);
  assert.equal(JSON.stringify(config).includes("apiToken"), false);
});

test("AI Routing model discovery requires administrator access and an API Key", async () => {
  const unauthorized = await fetch(`${baseUrl}/api/provider-models`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(unauthorized.status, 401);

  const missingKey = await fetch(`${baseUrl}/api/provider-models`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-admin-token": adminToken,
    },
    body: JSON.stringify({}),
  });
  assert.equal(missingKey.status, 400);
  assert.equal((await missingKey.json()).error.code, "API_KEY_REQUIRED");
});

test("model configuration stores one AI Routing provider without exposing its Key", async () => {
  const response = await fetch(`${baseUrl}/api/model-config`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-hub-admin-token": adminToken,
    },
    body: JSON.stringify({
      defaultProvider: "routing",
      providers: {
        routing: {
          enabled: true,
          apiKey: "test-routing-key-that-must-never-be-returned",
          models: ["gpt-test", "claude-test", "gpt-test", "bad\u0000model"],
          model: "gpt-test",
          enabledModels: ["gpt-test", "claude-test", "not-in-catalog"],
        },
      },
    }),
  });
  const config = await response.json();

  assert.equal(response.status, 200);
  assert.equal(config.defaultProvider, "routing");
  assert.equal(config.providers.length, 1);
  assert.equal(config.providers[0].id, "routing");
  assert.equal(config.providers[0].baseUrl, "https://drhknode.airouting.com/v1");
  assert.equal(config.providers[0].configured, true);
  assert.deepEqual(config.providers[0].models, ["gpt-test", "claude-test"]);
  assert.deepEqual(config.providers[0].enabledModels, ["gpt-test", "claude-test"]);
  assert.equal(JSON.stringify(config).includes("test-routing-key"), false);
});

test("Coze proxy returns a stable configuration error after authorization", async () => {
  const response = await fetch(`${baseUrl}/api/integrations/coze/run`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-project-token": legacyToken,
    },
    body: JSON.stringify({ resumeText: "Configuration validation fixture." }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "COZE_CONFIG_INVALID");
  assert.match(body.error.message, /not fully configured/i);
  assert.equal(JSON.stringify(body).includes(legacyToken), false);
});
