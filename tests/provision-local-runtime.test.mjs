import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { provisionLocalAccess } from "../scripts/provision-local-runtime.mjs";

const manifestPath = new URL("../deploy/project-manifest.json", import.meta.url);

test("local provisioning creates and reuses scoped credentials for tools and model-aware games", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ai-hub-local-access-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const registryPath = path.join(directory, "registry.json");
  const sharedPath = path.join(directory, "shared.json");

  const created = await provisionLocalAccess({ manifestPath, registryPath, sharedPath });
  assert.deepEqual(created, { created: true, projectCount: 37 });

  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  const shared = JSON.parse(await readFile(sharedPath, "utf8"));
  assert.equal(Object.keys(registry.projects).length, 37);
  assert.equal(Object.keys(shared.projects).length, 37);
  assert.ok(shared.projects["trace-sheet-workbench"]);
  assert.ok(shared.projects["ai-emotional-companion-local"]);
  assert.ok(!shared.projects["qisheng-emotional-companion"]);
  assert.ok(shared.projects["ai-xiangqi-duel"]);
  assert.ok(shared.projects["ai-chess-duel"]);
  assert.ok(shared.projects["ai-go-duel"]);
  assert.ok(shared.projects["dice-estate-duel"]);
  assert.ok(!shared.projects["fury-flock"]);
  assert.ok(
    Object.values(shared.projects).every(({ token }) =>
      typeof token === "string" && token.length >= 40,
    ),
  );

  const reused = await provisionLocalAccess({ manifestPath, registryPath, sharedPath });
  assert.deepEqual(reused, { created: false, projectCount: 37 });
  assert.deepEqual(JSON.parse(await readFile(sharedPath, "utf8")), shared);
});
