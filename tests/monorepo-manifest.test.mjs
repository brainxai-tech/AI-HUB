import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (pathname) => readFile(new URL(`../${pathname}`, import.meta.url), "utf8");

test("deployment manifest covers every non-game project exactly once", async () => {
  const manifest = JSON.parse(await read("deploy/project-manifest.json"));
  assert.equal(manifest.projects.length, 29);
  assert.equal(manifest.excludedGames.length, 5);
  assert.equal(new Set(manifest.projects.map(({ id }) => id)).size, 29);
  assert.equal(new Set(manifest.projects.map(({ route }) => route)).size, 29);

  for (const project of manifest.projects) {
    assert.match(project.id, /^[a-z0-9][a-z0-9-]+$/);
    assert.match(project.route, /^\/[a-z0-9-/]+\/$/);
    assert.match(project.source, /^apps\/[a-z0-9-]+$/);
    assert.ok(["shared", "dedicated"].includes(project.api));
  }
});

test("project catalog uses same-origin routes instead of the production server", async () => {
  const projects = await read("public/projects.js");
  assert.match(projects, /const SERVER = window\.location\?\.origin \|\| ""/);
  assert.doesNotMatch(projects, /47\.84\.108\.192|sslip\.io/);
});
