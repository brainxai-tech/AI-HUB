import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildObservabilitySummary,
  createAnonymousEventLimiter,
  createObservabilityEvent,
  focusProjectPaths,
  maximumEventBytes,
  readObservabilityEvents,
  recordObservabilityEvent,
} from "../observability.mjs";

test("observability events keep route metadata and drop sensitive input", () => {
  const event = createObservabilityEvent(
    {
      eventType: "generate",
      projectPath: "http://47.84.108.192/legal?clause=secret",
      projectId: "ai-legal-clause-translator",
      statusCode: 502,
      durationMs: 1234.4,
      prompt: "do not log this",
      messages: [{ role: "user", content: "do not log this either" }],
      inputText: "private clause text",
      body: { contract: "private" },
    },
    { source: "api", method: "POST", now: "2026-07-01T12:00:00.000Z" },
  );

  assert.deepEqual(event, {
    timestamp: "2026-07-01T12:00:00.000Z",
    eventType: "generate",
    projectPath: "/legal",
    projectId: "ai-legal-clause-translator",
    source: "api",
    method: "POST",
    statusCode: 502,
    durationMs: 1234,
  });
  assert.equal(JSON.stringify(event).includes("private"), false);
  assert.equal(JSON.stringify(event).includes("prompt"), false);
  assert.equal(JSON.stringify(event).includes("messages"), false);
  assert.ok(Buffer.byteLength(JSON.stringify(event), "utf8") <= maximumEventBytes);
});

test("observability events bound attacker-controlled fields and serialized size", () => {
  const event = createObservabilityEvent({
    timestamp: "x".repeat(10_000),
    eventType: "unknown-event-" + "x".repeat(10_000),
    projectPath: "/" + "x".repeat(10_000),
    projectId: "x".repeat(10_000),
    source: "unknown-source-" + "x".repeat(10_000),
    method: "x".repeat(10_000),
  }, { now: "2026-07-01T12:00:00.000Z" });

  assert.equal(event.timestamp, "2026-07-01T12:00:00.000Z");
  assert.equal(event.eventType, "api_request");
  assert.equal(event.projectPath.length, 100);
  assert.ok(Buffer.byteLength(JSON.stringify(event), "utf8") <= maximumEventBytes);
});

test("anonymous event limiter applies a bounded per-client window", () => {
  let now = 1_000;
  const limiter = createAnonymousEventLimiter({ limit: 2, windowMs: 1_000, now: () => now });

  assert.equal(limiter.allow("client-a"), true);
  assert.equal(limiter.allow("client-a"), true);
  assert.equal(limiter.allow("client-a"), false);
  assert.equal(limiter.allow("client-b"), true);
  now += 1_001;
  assert.equal(limiter.allow("client-a"), true);
});

test("log writes use mode 0600 and tail reads skip malformed lines", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hub-observability-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const logPath = path.join(directory, "nested", "events.jsonl");

  await recordObservabilityEvent(logPath, {
    eventType: "page_visit",
    projectPath: "/older",
    timestamp: "2026-07-01T11:00:00.000Z",
  });
  await writeFile(logPath, [
    (await readFile(logPath, "utf8")).trimEnd(),
    "{malformed-json",
    JSON.stringify(createObservabilityEvent({
      eventType: "generate",
      projectPath: "/legal",
      timestamp: "2026-07-01T12:00:00.000Z",
    })),
    JSON.stringify(createObservabilityEvent({
      eventType: "export",
      projectPath: "/elder/",
      timestamp: "2026-07-01T12:01:00.000Z",
    })),
    "",
  ].join("\n"), { mode: 0o600 });

  const events = await readObservabilityEvents(logPath, { limit: 10, maxBytes: 512 });

  assert.deepEqual(events.map((event) => event.projectPath), ["/older", "/legal", "/elder/"]);
  if (process.platform !== "win32") {
    assert.equal((await stat(logPath)).mode & 0o777, 0o600);
  }
});

test("tail-bounded reads do not parse records outside the byte window", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hub-observability-tail-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const logPath = path.join(directory, "events.jsonl");
  const oldLine = JSON.stringify(createObservabilityEvent({
    eventType: "page_visit",
    projectPath: "/old-record",
    timestamp: "2026-07-01T10:00:00.000Z",
  }));
  const recentLine = JSON.stringify(createObservabilityEvent({
    eventType: "generate",
    projectPath: "/legal",
    timestamp: "2026-07-01T12:00:00.000Z",
  }));
  await writeFile(logPath, `${oldLine}\n${"x".repeat(2_000)}\n${recentLine}\n`, "utf8");

  const events = await readObservabilityEvents(logPath, { limit: 10, maxBytes: 512 });

  assert.deepEqual(events.map((event) => event.projectPath), ["/legal"]);
});

test("observability summary separates visits, generations, exports, and errors by priority path", () => {
  const events = [
    createObservabilityEvent({ eventType: "page_visit", projectPath: "/data", statusCode: 200 }),
    createObservabilityEvent({ eventType: "page_visit", projectPath: "/paper/", statusCode: 200 }),
    createObservabilityEvent({ eventType: "generate", projectPath: "/legal", statusCode: 200, durationMs: 800 }),
    createObservabilityEvent({ eventType: "generate", projectPath: "/legal", statusCode: 500, durationMs: 1200 }),
    createObservabilityEvent({ eventType: "export", projectPath: "/elder/", statusCode: 200 }),
    createObservabilityEvent({ eventType: "page_visit", projectPath: "/course", statusCode: 404 }),
  ];

  const summary = buildObservabilitySummary(events, {
    now: "2026-07-01T12:10:00.000Z",
  });

  assert.deepEqual(
    summary.paths.map((item) => item.path),
    focusProjectPaths,
  );
  assert.equal(summary.totalEvents, 6);
  assert.equal(summary.paths.find((item) => item.path === "/data").pageVisits, 1);
  assert.equal(summary.paths.find((item) => item.path === "/paper/").pageVisits, 1);
  assert.equal(summary.paths.find((item) => item.path === "/legal").generations, 2);
  assert.equal(summary.paths.find((item) => item.path === "/legal").errors, 1);
  assert.equal(summary.paths.find((item) => item.path === "/legal").avgDurationMs, 1000);
  assert.equal(summary.paths.find((item) => item.path === "/elder/").exports, 1);
  assert.equal(summary.paths.find((item) => item.path === "/course").errors, 1);
});
