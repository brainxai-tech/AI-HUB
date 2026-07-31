import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLocalProjectProxy } from "../local-project-proxy.mjs";

async function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

test("local proxy covers tools and dedicated games while preserving ports", async () => {
  const proxy = createLocalProjectProxy({ manifestPath: "deploy/project-manifest.json" });
  assert.equal(proxy.routes.length, 36);
  assert.equal(proxy.match("/legal/")?.targetOrigin, "http://127.0.0.1:4195");
  assert.equal(proxy.match("/tracesheet/api/plan")?.targetOrigin, "http://127.0.0.1:4195");
  assert.equal(proxy.match("/ppt-report-coach/")?.targetOrigin, "http://127.0.0.1:4201");
  assert.equal(proxy.match("/work-report/api/generate")?.targetOrigin, "http://127.0.0.1:4202");
  assert.equal(proxy.match("/mbti/api/providers")?.targetOrigin, "http://127.0.0.1:4203");
  assert.equal(proxy.match("/essay/api/analyze")?.targetOrigin, "http://127.0.0.1:4204");
  assert.equal(proxy.match("/poetry/api/poems/generate")?.targetOrigin, "http://127.0.0.1:4205");
  assert.equal(proxy.match("/xiangqi")?.targetOrigin, "http://127.0.0.1:4211");
  assert.equal(proxy.match("/chess/api/coach")?.targetOrigin, "http://127.0.0.1:4212");
  assert.equal(proxy.match("/go/")?.targetOrigin, "http://127.0.0.1:4213");
  assert.equal(proxy.match("/fury-flock/"), null);
  assert.equal(proxy.match("/hub/dice-estate/"), null);
  assert.equal(proxy.match("/hub/"), null);
});

test("local proxy streams project requests without exposing a new public target", async (t) => {
  const received = [];
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push({ url: request.url, body: Buffer.concat(chunks).toString("utf8") });
    response.writeHead(201, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
  });
  const port = await listen(upstream);
  t.after(() => new Promise((resolve) => upstream.close(resolve)));

  const directory = await mkdtemp(path.join(os.tmpdir(), "ai-hub-proxy-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifestPath = path.join(directory, "manifest.json");
  await writeFile(manifestPath, JSON.stringify({
    projects: [{ id: "test-project", route: "/test/", api: "shared" }],
  }));
  const proxy = createLocalProjectProxy({ manifestPath, sharedOrigin: `http://127.0.0.1:${port}` });

  const gateway = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (!await proxy.handle(request, response, url)) response.writeHead(404).end();
  });
  const gatewayPort = await listen(gateway);
  t.after(() => new Promise((resolve) => gateway.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${gatewayPort}/test/api/run?mode=full`, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "streamed-body",
  });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(received, [{ url: "/test/api/run?mode=full", body: "streamed-body" }]);
});
