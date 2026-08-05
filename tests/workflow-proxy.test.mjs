import assert from "node:assert/strict";
import { createServer } from "node:http";
import net from "node:net";
import test from "node:test";

import { createWorkflowProxy } from "../workflow-proxy.mjs";

test("workflow proxy accepts only loopback HTTP origins and exposes a strict route map", () => {
  for (const origin of [
    "https://127.0.0.1:4196",
    "http://47.84.108.192:4196",
    "http://user:pass@127.0.0.1:4196",
    "http://127.0.0.1:4196/private",
  ]) {
    assert.throws(() => createWorkflowProxy({ origin, apiToken: "internal-token" }), /loopback HTTP origin/);
  }

  const proxy = createWorkflowProxy({ apiToken: "internal-token" });
  assert.equal(proxy.match("/api/workflows/health")?.target([]), "/health");
  assert.equal(proxy.match("/api/workflows/skills")?.target([]), "/api/skills");
  assert.equal(proxy.match("/api/workflows/runs")?.target([]), "/api/runs");
  assert.ok(proxy.match("/api/workflows/runs/sample-run-00000001"));
  assert.ok(proxy.match("/api/workflows/runs/sample-run-00000001/resume"));
  assert.ok(proxy.match("/api/workflows/runs/sample-run-00000001/retry"));
  assert.ok(proxy.match("/api/workflows/runs/sample-run-00000001/actions/revise-plan"));
  assert.equal(proxy.match("/api/workflows/runs".concat("/../secrets")), null);
  assert.equal(proxy.match("/api/workflows/runs/short"), null);
  assert.equal(proxy.match("/api/workflows/admin"), null);
});

test("workflow proxy strips browser credentials and injects only its internal token", async (t) => {
  const received = [];
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: Buffer.concat(chunks).toString("utf8"),
    });
    if (request.url.endsWith("/retry")) {
      response.writeHead(422, {
        "content-type": "application/json; charset=utf-8",
        "x-internal-secret": "internal-token",
      });
      response.end(JSON.stringify({
        error: { code: "RETRY_REJECTED", message: "internal-token must never be returned" },
      }));
      return;
    }
    if (request.url.endsWith("/resume")) {
      response.writeHead(401, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        error: { code: "UNAUTHORIZED", message: "internal-token was rejected" },
      }));
      return;
    }
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      authorization: "Bearer internal-token",
      "x-internal-secret": "internal-token",
    });
    response.end(JSON.stringify({ ok: true }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => close(upstream));

  const proxy = createWorkflowProxy({
    origin: `http://127.0.0.1:${upstreamPort}`,
    apiToken: "internal-token",
  });
  const gateway = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    if (!await proxy.handle(request, response, pathname)) response.writeHead(404).end();
  });
  const gatewayPort = await listen(gateway);
  t.after(() => close(gateway));

  const response = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/workflows/runs/sample-run-00000001/actions/revise-plan`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer browser-admin-token",
        "content-type": "application/json",
        "x-browser-secret": "must-not-forward",
        "x-hub-admin-token": "browser-admin-token",
      },
      body: JSON.stringify({ input: { notes: "revise" } }),
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get("authorization"), null);
  assert.equal(response.headers.get("x-internal-secret"), null);
  assert.deepEqual(received.map(({ method, url, body }) => ({ method, url, body })), [{
    method: "POST",
    url: "/api/runs/sample-run-00000001/actions/revise-plan",
    body: JSON.stringify({ input: { notes: "revise" } }),
  }]);
  assert.equal(received[0].headers.authorization, "Bearer internal-token");
  assert.equal(received[0].headers["x-hub-admin-token"], undefined);
  assert.equal(received[0].headers["x-browser-secret"], undefined);
  assert.equal(JSON.stringify(received[0].headers).includes("browser-admin-token"), false);

  const rejected = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/workflows/runs/sample-run-00000001/retry`,
    { method: "POST" },
  );
  const rejectedBody = await rejected.text();
  assert.equal(rejected.status, 422);
  assert.match(rejectedBody, /RETRY_REJECTED/);
  assert.equal(rejectedBody.includes("internal-token"), false);
  assert.equal(rejected.headers.get("x-internal-secret"), null);

  const internalAuthFailure = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/workflows/runs/sample-run-00000001/resume`,
    { method: "POST" },
  );
  const internalAuthBody = await internalAuthFailure.text();
  assert.equal(internalAuthFailure.status, 502);
  assert.match(internalAuthBody, /WORKFLOW_UNAVAILABLE/);
  assert.equal(internalAuthBody.includes("internal-token"), false);
});

test("workflow proxy rejects unsupported methods and sanitizes unavailable upstream errors", async (t) => {
  const refusingUpstream = net.createServer((socket) => socket.destroy());
  const unavailablePort = await listen(refusingUpstream);
  t.after(() => close(refusingUpstream));
  const proxy = createWorkflowProxy({
    origin: `http://127.0.0.1:${unavailablePort}`,
    apiToken: "internal-token-that-must-not-leak",
  });
  const gateway = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    if (!await proxy.handle(request, response, pathname)) response.writeHead(404).end();
  });
  const gatewayPort = await listen(gateway);
  t.after(() => close(gateway));

  const disallowed = await fetch(`http://127.0.0.1:${gatewayPort}/api/workflows/runs/sample-run-00000001`, {
    method: "PUT",
  });
  assert.equal(disallowed.status, 405);
  assert.equal((await disallowed.json()).error.code, "WORKFLOW_METHOD_NOT_ALLOWED");

  const unavailable = await fetch(`http://127.0.0.1:${gatewayPort}/api/workflows/skills`);
  const body = await unavailable.text();
  assert.equal(unavailable.status, 502);
  assert.match(body, /WORKFLOW_UNAVAILABLE/);
  assert.equal(body.includes("internal-token-that-must-not-leak"), false);
  assert.equal(JSON.stringify([...unavailable.headers]).includes("internal-token-that-must-not-leak"), false);
});

async function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function close(server) {
  if (!server.listening) return;
  await new Promise((resolve) => server.close(resolve));
}
