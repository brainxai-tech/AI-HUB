import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import test from "node:test";

import {
  buildIdolVisualFallback,
  createNextProjectHandler,
  nextProjectAccessSpecs,
  nextProjectIds,
  stripNextApiPath,
} from "./next-projects.mjs";

test("Next manifest covers all Hub projects with Next route handlers", () => {
  assert.deepEqual(nextProjectIds(), [
    "xhs-copywriting-master",
    "ai-data-analyst",
    "trace-sheet-workbench",
    "ai-course-teaching-assistant",
    "ai-legal-clause-translator",
    "ai-tarot-sanctum",
    "qingqing-grassland-personality",
    "idol-match-test",
  ]);
});

test("every Next project exposes the shared project-model selection seam", () => {
  assert.deepEqual(
    nextProjectAccessSpecs().map(({ id }) => id),
    nextProjectIds(),
  );
});

test("Next handler converts Node requests and responses", async () => {
  const ids = nextProjectIds();
  const credentials = Object.fromEntries(ids.map((id) => [id, { token: `token-${id}-0123456789` }]));
  const routeModules = Object.fromEntries(ids.map((id) => [id, {}]));
  const paths = {
    "xhs-copywriting-master": ["/generate", "/providers"],
    "ai-data-analyst": ["/llm", "/providers"],
    "trace-sheet-workbench": ["/plan", "/providers"],
    "ai-course-teaching-assistant": ["/providers", "/teaching-bundles"],
    "ai-legal-clause-translator": ["/analyze", "/providers"],
    "ai-tarot-sanctum": ["/compatible-reading", "/deepseek-reading", "/providers"],
    "qingqing-grassland-personality": ["/deepseek-result", "/providers"],
    "idol-match-test": ["/compatible-result", "/deepseek-result", "/explain-match", "/providers"],
  };
  for (const [id, apiPaths] of Object.entries(paths)) {
    for (const apiPath of apiPaths) routeModules[id][apiPath] = { GET: () => Response.json({ ok: true }) };
  }
  routeModules["ai-data-analyst"]["/llm"] = {
    POST: async (request) => Response.json({ received: await request.json() }),
  };
  const handle = await createNextProjectHandler({
    appsRoot: "/unused",
    credentials,
    chatUrl: "http://127.0.0.1:4194/hub/api/v1/chat/completions",
    routeModules,
  });
  const request = Readable.from([Buffer.from('{"question":"hello"}')]);
  request.method = "POST";
  request.url = "/data/api/llm";
  request.headers = { host: "example.test", "content-type": "application/json" };
  const response = new EventEmitter();
  response.writeHead = (status, headers) => { response.status = status; response.headers = headers; };
  response.end = (body) => { response.body = body; response.emit("finish"); };

  assert.equal(await handle(request, response, "/data/api/llm"), true);
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body.toString("utf8")), { received: { question: "hello" } });
});

test("stripNextApiPath keeps only the route-module suffix", () => {
  assert.equal(stripNextApiPath("/idol-match/api/explain-match", "/idol-match"), "/explain-match");
});

test("Idol fallback preserves the fixed candidate as a visual result", () => {
  const fallback = buildIdolVisualFallback({
    fixedIdolId: "idol-1",
    userTags: ["舞台型"],
    candidates: [{ id: "idol-1", name: "固定候选", score: 88, confidence: 80 }],
  });
  assert.equal(fallback.result.idolId, "idol-1");
  assert.equal(fallback.result.idolName, "固定候选");
  assert.equal(fallback.fallback, true);
  assert.equal(fallback.result.entryPath.length, 3);
});
