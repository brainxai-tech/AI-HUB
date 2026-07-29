import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (pathname) => readFile(new URL(`../${pathname}`, import.meta.url), "utf8");

test("deployment manifest covers every tool and game exactly once", async () => {
  const manifest = JSON.parse(await read("deploy/project-manifest.json"));
  assert.equal(manifest.version, 2);
  assert.equal(manifest.projects.length, 29);
  assert.equal(manifest.games.length, 5);
  assert.equal(Object.hasOwn(manifest, "excludedGames"), false);
  assert.equal(new Set(manifest.projects.map(({ id }) => id)).size, 29);
  assert.equal(new Set(manifest.projects.map(({ route }) => route)).size, 29);

  for (const project of manifest.projects) {
    assert.match(project.id, /^[a-z0-9][a-z0-9-]+$/);
    assert.match(project.route, /^\/[a-z0-9-/]+\/$/);
    assert.match(project.source, /^apps\/[a-z0-9-]+$/);
    assert.ok(["shared", "dedicated"].includes(project.api));
  }

  assert.deepEqual(
    manifest.games.map(({ id, route, source, stack, api, port }) => ({ id, route, source, stack, api, port })),
    [
      { id: "ai-xiangqi-duel", route: "/xiangqi/", source: "games/ai-xiangqi-duel", stack: "next", api: "dedicated", port: 4211 },
      { id: "ai-chess-duel", route: "/chess/", source: "games/ai-chess-duel", stack: "next", api: "dedicated", port: 4212 },
      { id: "ai-go-duel", route: "/go/", source: "games/ai-go-duel", stack: "next", api: "dedicated", port: 4213 },
      { id: "fury-flock", route: "/fury-flock/", source: "games/fury-flock", stack: "vite-static", api: "none", port: undefined },
      { id: "dice-estate-duel", route: "/hub/dice-estate/", source: "public/dice-estate", stack: "hub-static", api: "hub", port: undefined },
    ],
  );

  const allEntries = [...manifest.projects, ...manifest.games];
  assert.equal(new Set(allEntries.map(({ id }) => id)).size, 34);
  assert.equal(new Set(allEntries.map(({ route }) => route)).size, 34);

  for (const game of manifest.games) {
    assert.match(game.id, /^[a-z0-9][a-z0-9-]+$/);
    assert.match(game.route, /^\/[a-z0-9-/]+\/$/);
    assert.match(game.source, /^(games\/[a-z0-9-]+|public\/dice-estate)$/);
    assert.ok(["next", "vite-static", "hub-static"].includes(game.stack));
    assert.ok(["dedicated", "none", "hub"].includes(game.api));
    if (game.api === "dedicated") assert.ok(Number.isSafeInteger(game.port));
  }
});

test("project catalog uses same-origin routes instead of the production server", async () => {
  const projects = await read("public/projects.js");
  assert.match(projects, /const SERVER = window\.location\?\.origin \|\| ""/);
  assert.doesNotMatch(projects, /47\.84\.108\.192|sslip\.io/);
});
