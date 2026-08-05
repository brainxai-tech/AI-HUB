import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
let temporaryDirectory;
let child;
let upstream;
let baseUrl;
let upstreamUrl;
let userCookie;
let relayKey;
let upstreamCalls = 0;

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
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {
      // Retry until the bounded deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Relay integration server did not become ready.");
}

function cookieFrom(response) {
  const value = response.headers.get("set-cookie") || "";
  return value.split(";", 1)[0];
}

before(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "ai-project-hub-relay-test-"));
  const upstreamPort = await freePort();
  upstreamUrl = `http://127.0.0.1:${upstreamPort}/v1`;
  upstream = createHttpServer(async (request, response) => {
    if (request.url === "/v1/chat/completions" && request.method === "POST") {
      upstreamCalls += 1;
      assert.equal(request.headers.authorization, "Bearer upstream-test-key");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: "chatcmpl_test",
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise((resolve) => upstream.listen(upstreamPort, "127.0.0.1", resolve));

  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(port),
      HUB_LOCAL_MODE: "true",
      HUB_LOCAL_PROJECT_PROXY: "false",
      HUB_ADMIN_TOKEN: "relay-admin-test-token-abcdefghijklmnopqrstuvwxyz",
      HUB_CONFIG_PATH: path.join(temporaryDirectory, "model-config.json"),
      HUB_PROJECT_TOKENS_PATH: path.join(temporaryDirectory, "project-tokens.json"),
      HUB_PROVIDER_RELAYS_PATH: path.join(temporaryDirectory, "provider-relays.json"),
      HUB_RELAY_COMMERCE_PATH: path.join(temporaryDirectory, "relay-commerce.json"),
      HUB_OBSERVABILITY_LOG_PATH: path.join(temporaryDirectory, "observability.jsonl"),
      HUB_ROUTING_BASE_URL: upstreamUrl,
    },
  });
  await waitUntilReady(baseUrl);
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
  }
  await new Promise((resolve) => upstream?.close(resolve));
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
});

test("relay account, pricing, wallet, API key, and usage billing work as one flow", async () => {
  const register = await fetch(`${baseUrl}/api/relay-auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "buyer@example.com", password: "safe-password-123" }),
  });
  assert.equal(register.status, 201);
  userCookie = cookieFrom(register);

  const pricing = await fetch(`${baseUrl}/api/admin/relay-pricing`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-hub-admin-token": "relay-admin-test-token-abcdefghijklmnopqrstuvwxyz",
    },
    body: JSON.stringify({
      pricing: {
        "gpt-5.5": {
          label: "GPT-5.5",
          status: "verified",
          enabled: true,
          upstreamInputMicrosPerMillion: 500000,
          upstreamOutputMicrosPerMillion: 500000,
          sellInputMicrosPerMillion: 750000,
          sellOutputMicrosPerMillion: 750000,
          sourceUrl: "https://example.com/pricing",
          lastVerifiedAt: "2026-08-05",
        },
      },
    }),
  });
  assert.equal(pricing.status, 200);

  const modelConfig = await fetch(`${baseUrl}/api/model-config`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-hub-admin-token": "relay-admin-test-token-abcdefghijklmnopqrstuvwxyz",
    },
    body: JSON.stringify({
      defaultProvider: "routing",
      providers: {
        routing: { enabled: true, apiKey: "upstream-test-key", models: ["gpt-5.5"] },
      },
    }),
  });
  assert.equal(modelConfig.status, 200);

  const grant = await fetch(`${baseUrl}/api/admin/relay-wallet/grant`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-admin-token": "relay-admin-test-token-abcdefghijklmnopqrstuvwxyz",
    },
    body: JSON.stringify({ email: "buyer@example.com", amountCny: 1, note: "integration test" }),
  });
  assert.equal(grant.status, 200);

  const created = await fetch(`${baseUrl}/api/relay-keys`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: userCookie },
    body: JSON.stringify({ name: "integration" }),
  });
  assert.equal(created.status, 201);
  relayKey = (await created.json()).key;
  assert.match(relayKey, /^ahub_/);

  const request = {
    model: "gpt-5.5",
    messages: [{ role: "user", content: "hello" }],
    max_tokens: 100,
  };
  const idempotencyKey = "relay-idempotency-key-abcdefghijklmnopqrstuvwxyz";
  const call = await fetch(`${baseUrl}/api/relay/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${relayKey}`, "idempotency-key": idempotencyKey },
    body: JSON.stringify(request),
  });
  assert.equal(call.status, 200);
  assert.equal(upstreamCalls, 1);
  assert.equal(call.headers.get("x-ai-hub-billed-cny"), "0.000023");

  const replay = await fetch(`${baseUrl}/api/relay/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${relayKey}`, "idempotency-key": idempotencyKey },
    body: JSON.stringify(request),
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get("x-ai-hub-idempotent-replay"), "true");
  assert.equal(upstreamCalls, 1);

  const wallet = await fetch(`${baseUrl}/api/relay-wallet`, { headers: { cookie: userCookie } }).then((response) => response.json());
  assert.ok(wallet.entries.some((entry) => entry.type === "usage"));
  assert.ok(wallet.balanceCny < 1);
});

test("relay gateway refuses unpriced models and revoked keys", async () => {
  const unpriced = await fetch(`${baseUrl}/api/relay/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${relayKey}` },
    body: JSON.stringify({ model: "gpt-5.6-sol", messages: [{ role: "user", content: "hello" }] }),
  });
  assert.equal(unpriced.status, 400);
  assert.equal((await unpriced.json()).error.code, "RELAY_MODEL_NOT_SALEABLE");

  const keys = await fetch(`${baseUrl}/api/relay-keys`, { headers: { cookie: userCookie } }).then((response) => response.json());
  const keyId = keys.data[0].id;
  const revoked = await fetch(`${baseUrl}/api/relay-keys/${keyId}`, { method: "DELETE", headers: { cookie: userCookie } });
  assert.equal(revoked.status, 200);
  const unauthorized = await fetch(`${baseUrl}/api/relay/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${relayKey}` },
    body: JSON.stringify({ model: "gpt-5.5", messages: [{ role: "user", content: "hello" }] }),
  });
  assert.equal(unauthorized.status, 401);
});
