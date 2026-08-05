import assert from "node:assert/strict";
import test from "node:test";

import {
  createProjectAuthorizer,
  hashProjectToken,
  normalizeProjectTokenRegistry,
} from "../auth.mjs";

function request(headers = {}) {
  return { headers };
}

const scopedToken = "project-token-with-at-least-32-characters";
const otherToken = "another-project-token-with-32-characters";
const registry = normalizeProjectTokenRegistry({
  version: 1,
  projects: {
    "ai-book-decomposer": {
      tokenHash: hashProjectToken(scopedToken),
      scopes: ["model:chat"],
      requestsPerMinute: 30,
      maxConcurrent: 2,
    },
    "ai-resume-polisher-local": {
      tokenHash: hashProjectToken(otherToken),
      scopes: ["coze:invoke"],
    },
  },
});

test("scoped authorization rejects missing and incorrect credentials", () => {
  const authorize = createProjectAuthorizer({ registry });

  assert.equal(authorize(request(), "model:chat").statusCode, 401);
  assert.equal(
    authorize(
      request({
        "x-hub-project-id": "ai-book-decomposer",
        "x-hub-project-token": "wrong-token-with-at-least-32-characters",
      }),
      "model:chat",
    ).statusCode,
    401,
  );
});

test("scoped authorization prevents project impersonation and missing scopes", () => {
  const authorize = createProjectAuthorizer({ registry });

  assert.equal(
    authorize(
      request({
        "x-hub-project-id": "ai-resume-polisher-local",
        "x-hub-project-token": scopedToken,
      }),
      "model:chat",
    ).statusCode,
    401,
  );

  const forbidden = authorize(
    request({
      "x-hub-project-id": "ai-book-decomposer",
      "x-hub-project-token": scopedToken,
    }),
    "coze:invoke",
  );
  assert.equal(forbidden.statusCode, 403);
  assert.equal(forbidden.projectId, "ai-book-decomposer");
});

test("scoped authorization returns project limits for a valid scope", () => {
  const authorize = createProjectAuthorizer({ registry });
  const result = authorize(
    request({
      "x-hub-project-id": "ai-book-decomposer",
      "x-hub-project-token": scopedToken,
    }),
    "model:chat",
  );

  assert.equal(result.ok, true);
  assert.equal(result.projectId, "ai-book-decomposer");
  assert.deepEqual(result.scopes, ["model:chat"]);
  assert.equal(result.requestsPerMinute, 30);
  assert.equal(result.maxConcurrent, 2);
  assert.equal(JSON.stringify(result).includes(scopedToken), false);
});

test("scoped authorization can infer the project from a unique token during client migration", () => {
  const authorize = createProjectAuthorizer({ registry });
  const result = authorize(
    request({ "x-hub-project-token": scopedToken }),
    "model:chat",
  );

  assert.equal(result.ok, true);
  assert.equal(result.projectId, "ai-book-decomposer");
  assert.equal(result.legacy, false);
});

test("legacy authorization is explicit and never returns the shared token", () => {
  const authorize = createProjectAuthorizer({
    registry,
    allowLegacy: true,
    legacyToken: "legacy-project-token-with-at-least-32-characters",
  });
  const result = authorize(
    request({ "x-hub-project-token": "legacy-project-token-with-at-least-32-characters" }),
    "model:chat",
  );

  assert.equal(result.ok, true);
  assert.equal(result.legacy, true);
  assert.equal(result.projectId, "legacy");
  assert.equal(JSON.stringify(result).includes("legacy-project-token"), false);
});

test("registry validation drops malformed entries and unsafe project ids", () => {
  const normalized = normalizeProjectTokenRegistry({
    version: 1,
    projects: {
      "../escape": { tokenHash: "a".repeat(64), scopes: ["model:chat"] },
      valid: { tokenHash: "not-a-sha256", scopes: ["model:chat"] },
      "valid-project": { tokenHash: "b".repeat(64), scopes: ["model:chat", "invalid"] },
    },
  });

  assert.deepEqual(Object.keys(normalized.projects), ["valid-project"]);
  assert.deepEqual(normalized.projects["valid-project"].scopes, ["model:chat"]);
});
