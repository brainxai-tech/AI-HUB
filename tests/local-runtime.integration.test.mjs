import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

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

async function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function waitUntilReady(url) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/hub/`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {
      // Retry until the bounded deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Local runtime server did not become ready.");
}

test("local runtime serves index files for nested Hub pages", async (t) => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "ai-hub-local-static-"));
  const port = await freePort();
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(port),
      HUB_CONFIG_PATH: path.join(temporaryDirectory, "model-config.json"),
      HUB_PROJECT_TOKENS_PATH: path.join(temporaryDirectory, "project-tokens.json"),
      HUB_OBSERVABILITY_LOG_PATH: path.join(temporaryDirectory, "observability.jsonl"),
    },
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitUntilReady(baseUrl);

  const response = await fetch(`${baseUrl}/hub/key-config/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /^text\/html/);
  assert.match(await response.text(), /id="configForm"/);
});

test("local mode stores configuration locally without an admin token", async (t) => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "ai-hub-local-mode-"));
  const port = await freePort();
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(port),
      HUB_LOCAL_MODE: "true",
      HUB_ADMIN_TOKEN: "",
      HUB_REMOTE_GATEWAY_ORIGIN: "",
      HUB_CONFIG_PATH: path.join(temporaryDirectory, "model-config.json"),
      HUB_PROJECT_TOKENS_PATH: path.join(temporaryDirectory, "project-tokens.json"),
      HUB_OBSERVABILITY_LOG_PATH: path.join(temporaryDirectory, "observability.jsonl"),
    },
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitUntilReady(baseUrl);

  const configResponse = await fetch(`${baseUrl}/hub/api/model-config`);
  assert.equal(configResponse.status, 200);
  const config = await configResponse.json();
  assert.equal(config.localMode, true);
  assert.equal(config.adminAuthConfigured, false);

  const verifyResponse = await fetch(`${baseUrl}/hub/api/admin/verify`, { method: "POST" });
  assert.equal(verifyResponse.status, 200);
});

test("local runtime proxies Hub APIs to the central gateway", async (t) => {
  const received = [];
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push({
      method: request.method,
      url: request.url,
      adminToken: request.headers["x-hub-admin-token"],
      body: Buffer.concat(chunks).toString("utf8"),
    });
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      defaultProvider: "routing",
      adminAuthConfigured: true,
      providers: [{ id: "routing", enabled: true, configured: true, models: ["gpt-test"] }],
    }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => close(upstream));

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "ai-hub-local-proxy-"));
  const port = await freePort();
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(port),
      HUB_REMOTE_GATEWAY_ORIGIN: `http://127.0.0.1:${upstreamPort}`,
      HUB_CONFIG_PATH: path.join(temporaryDirectory, "model-config.json"),
      HUB_PROJECT_TOKENS_PATH: path.join(temporaryDirectory, "project-tokens.json"),
      HUB_OBSERVABILITY_LOG_PATH: path.join(temporaryDirectory, "observability.jsonl"),
    },
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitUntilReady(baseUrl);

  const readResponse = await fetch(`${baseUrl}/hub/api/model-config`);
  assert.equal(readResponse.status, 200);
  assert.equal(readResponse.headers.get("x-ai-hub-local-proxy"), "remote");
  assert.equal((await readResponse.json()).providers[0].configured, true);

  const updateBody = JSON.stringify({ defaultProvider: "routing" });
  const updateResponse = await fetch(`${baseUrl}/hub/api/model-config`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-hub-admin-token": "local-proxy-test-token",
    },
    body: updateBody,
  });
  assert.equal(updateResponse.status, 200);
  assert.deepEqual(received, [
    { method: "GET", url: "/hub/api/model-config", adminToken: undefined, body: "" },
    {
      method: "PUT",
      url: "/hub/api/model-config",
      adminToken: "local-proxy-test-token",
      body: updateBody,
    },
  ]);
});
