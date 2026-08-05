import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import test from "node:test";

import { createNativeProjectHandler, nativeProjectIds, stripNativeBasePath } from "./native-projects.mjs";

function createMockResponse() {
  const response = new EventEmitter();
  response.writableEnded = false;
  response.end = () => {
    response.writableEnded = true;
    response.emit("finish");
  };
  return response;
}

test("native project manifest covers Node/public and stateful projects", () => {
  assert.deepEqual(nativeProjectIds(), [
    "ai-book-decomposer",
    "ai-emotional-companion-local",
    "elder-fraud-assistant",
    "ai-english-theater",
    "ai-zhougong-dream",
  ]);
});

test("native API requests are stripped and delegated under project scope", async () => {
  const ids = nativeProjectIds();
  const credentials = Object.fromEntries(ids.map((id) => [id, { token: `token-${id}-0123456789` }]));
  const seen = [];
  const handlers = Object.fromEntries(ids.map((id) => [id, (request, response) => {
    seen.push([id, request.url]);
    response.end();
  }]));
  const handle = await createNativeProjectHandler({
    appsRoot: "/unused",
    credentials,
    chatUrl: "http://127.0.0.1:4194/hub/api/v1/chat/completions",
    handlers,
  });
  const request = new EventEmitter();
  request.url = "/book/api/providers?refresh=1";
  const response = createMockResponse();

  assert.equal(await handle(request, response, "/book/api/providers"), true);
  assert.deepEqual(seen, [["ai-book-decomposer", "/api/providers?refresh=1"]]);
  assert.equal(request.url, "/book/api/providers?refresh=1");
  assert.equal(await handle(request, createMockResponse(), "/unknown/api/health"), false);
});

test("stripNativeBasePath preserves query strings", () => {
  assert.equal(stripNativeBasePath("/english/api/scenarios?level=A2", "/english"), "/api/scenarios?level=A2");
  assert.equal(stripNativeBasePath("/other/api", "/english"), "/other/api");
});

test("qisheng chat keeps plain-text streaming requests out of JSON response mode", async () => {
  let capturedBody = null;
  const upstream = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    capturedBody = JSON.parse(raw);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
  });
  await new Promise((resolve, reject) => {
    upstream.once("error", reject);
    upstream.listen(0, "127.0.0.1", resolve);
  });

  try {
    const ids = nativeProjectIds();
    const credentials = Object.fromEntries(ids.map((id) => [id, { token: `token-${id}-0123456789` }]));
    const chatUrl = `http://127.0.0.1:${upstream.address().port}/hub/api/v1/chat/completions`;
    const handlers = Object.fromEntries(ids.map((id) => [id, async (_request, response) => {
      if (id === "ai-emotional-companion-local") {
        await fetch(chatUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "user", content: "hello" }], stream: false }),
        });
      }
      response.end();
    }]));
    const handle = await createNativeProjectHandler({
      appsRoot: "/unused",
      credentials,
      chatUrl,
      handlers,
    });
    const request = new EventEmitter();
    request.url = "/qisheng/api/chat/stream";

    assert.equal(await handle(request, createMockResponse(), "/qisheng/api/chat/stream"), true);
    assert.equal(capturedBody.response_format, undefined);
  } finally {
    await new Promise((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
  }
});
