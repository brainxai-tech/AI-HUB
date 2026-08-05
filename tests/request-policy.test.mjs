import assert from "node:assert/strict";
import test from "node:test";

import {
  RequestGovernor,
  RequestPolicyError,
  requestedTokenLimit,
  validateChatPayload,
} from "../request-policy.mjs";

const validPayload = {
  provider: "deepseek",
  model: "deepseek-v4-flash",
  messages: [{ role: "user", content: "hello" }],
  temperature: 0.7,
  max_tokens: 1024,
};

test("chat validation accepts a bounded OpenAI-compatible payload", () => {
  assert.equal(validateChatPayload(validPayload), validPayload);
  assert.equal(requestedTokenLimit(validPayload), 1024);
});

test("chat validation rejects malformed messages and unsupported streaming", () => {
  for (const payload of [
    {},
    { messages: [] },
    { messages: [{ role: "root", content: "hello" }] },
    { messages: [{ role: "user", content: null }] },
    { messages: [{ role: "user", content: "hello" }], stream: true },
  ]) {
    assert.throws(() => validateChatPayload(payload), RequestPolicyError);
  }
});

test("chat validation enforces temperature, token, and message byte limits", () => {
  assert.throws(
    () => validateChatPayload({ ...validPayload, temperature: 3 }),
    (error) => error.code === "INVALID_TEMPERATURE",
  );
  assert.throws(
    () => validateChatPayload({ ...validPayload, max_tokens: 50000 }, { maxOutputTokens: 32768 }),
    (error) => error.code === "INVALID_TOKEN_LIMIT",
  );
  assert.throws(
    () =>
      validateChatPayload(
        { ...validPayload, messages: [{ role: "user", content: "x".repeat(2000) }] },
        { maxMessageBytes: 1024 },
      ),
    (error) => error.code === "MESSAGES_TOO_LARGE",
  );
});

test("request governor enforces per-minute rate and concurrent request limits", () => {
  let now = Date.parse("2026-07-10T00:00:00.000Z");
  const governor = new RequestGovernor({ now: () => now });
  const limits = { requestsPerMinute: 2, maxConcurrent: 1, dailyTokenBudget: 10000 };

  const first = governor.acquire("project-a", limits, 1000);
  assert.equal(first.ok, true);
  const concurrent = governor.acquire("project-a", limits, 1000);
  assert.equal(concurrent.ok, false);
  assert.equal(concurrent.code, "REQUEST_CONCURRENCY_LIMITED");
  first.release();

  const second = governor.acquire("project-a", limits, 1000);
  assert.equal(second.ok, true);
  second.release();
  const rateLimited = governor.acquire("project-a", limits, 1000);
  assert.equal(rateLimited.ok, false);
  assert.equal(rateLimited.code, "REQUEST_RATE_LIMITED");

  now += 60_001;
  const nextWindow = governor.acquire("project-a", limits, 1000);
  assert.equal(nextWindow.ok, true);
  nextWindow.release();
});

test("request governor rejects a daily token reservation above the project budget", () => {
  const governor = new RequestGovernor({ now: () => Date.parse("2026-07-10T12:00:00.000Z") });
  const limits = { requestsPerMinute: 10, maxConcurrent: 2, dailyTokenBudget: 1500 };

  const first = governor.acquire("project-a", limits, 1000);
  assert.equal(first.ok, true);
  first.release();

  const overBudget = governor.acquire("project-a", limits, 600);
  assert.equal(overBudget.ok, false);
  assert.equal(overBudget.code, "PROJECT_DAILY_BUDGET_EXCEEDED");
});

test("request governor release is idempotent", () => {
  const governor = new RequestGovernor();
  const lease = governor.acquire(
    "project-a",
    { requestsPerMinute: 10, maxConcurrent: 1, dailyTokenBudget: 10000 },
    100,
  );
  assert.equal(lease.ok, true);
  lease.release();
  lease.release();

  const next = governor.acquire(
    "project-a",
    { requestsPerMinute: 10, maxConcurrent: 1, dailyTokenBudget: 10000 },
    100,
  );
  assert.equal(next.ok, true);
  next.release();
});
