import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { ensureProjectAccess } from "./provision-project-access.mjs";

test("adds a new scoped project to both Hub registry and shared runtime credentials", () => {
  const token = "new-project-token-01234567890123456789";
  const result = ensureProjectAccess({
    registry: { version: 1, projects: {} },
    shared: { version: 1, projects: {} },
    projectId: "ai-cold-start-brand-lab",
    token,
    scopes: ["model:chat"],
  });

  assert.equal(result.shared.projects["ai-cold-start-brand-lab"].token, token);
  assert.equal(
    result.registry.projects["ai-cold-start-brand-lab"].tokenHash,
    createHash("sha256").update(token).digest("hex"),
  );
  assert.deepEqual(result.registry.projects["ai-cold-start-brand-lab"].scopes, ["model:chat"]);
  assert.equal(result.registry.projects["ai-cold-start-brand-lab"].enabled, true);
});

test("grants model chat to an existing Coze project without rotating its token", () => {
  const token = "existing-resume-token-012345678901234";
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const result = ensureProjectAccess({
    registry: {
      version: 1,
      projects: {
        "ai-resume-polisher-local": {
          tokenHash,
          scopes: ["coze:invoke"],
          enabled: true,
        },
      },
    },
    shared: { version: 1, projects: { "ai-resume-polisher-local": { token } } },
    projectId: "ai-resume-polisher-local",
    scopes: ["coze:invoke", "model:chat"],
  });

  assert.equal(result.shared.projects["ai-resume-polisher-local"].token, token);
  assert.equal(result.registry.projects["ai-resume-polisher-local"].tokenHash, tokenHash);
  assert.deepEqual(result.registry.projects["ai-resume-polisher-local"].scopes, ["coze:invoke", "model:chat"]);
});
