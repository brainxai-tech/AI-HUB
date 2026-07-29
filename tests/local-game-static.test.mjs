import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLocalGameStatic } from "../local-game-static.mjs";

async function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

test("local static games serve only their built route with SPA fallback and safe caching", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-hub-static-game-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dist = path.join(root, "games", "fury-flock", "dist");
  await mkdir(path.join(dist, "assets"), { recursive: true });
  await writeFile(path.join(dist, "index.html"), "<!doctype html><title>Fury Flock</title>");
  await writeFile(path.join(dist, "assets", "index-AbC123.js"), "console.log('fury')");
  await writeFile(path.join(root, "secret.txt"), "not public");
  const manifestPath = path.join(root, "manifest.json");
  await writeFile(manifestPath, JSON.stringify({
    games: [
      { id: "fury-flock", route: "/fury-flock/", source: "games/fury-flock", stack: "vite-static" },
      { id: "dice-estate-duel", route: "/hub/dice-estate/", source: "public/dice-estate", stack: "hub-static" },
    ],
  }));

  const staticGames = createLocalGameStatic({ root, manifestPath });
  assert.deepEqual(staticGames.routes.map(({ id, route }) => ({ id, route })), [
    { id: "fury-flock", route: "/fury-flock/" },
  ]);
  assert.equal(staticGames.match("/hub/dice-estate/"), null);

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (!await staticGames.handle(request, response, url)) response.writeHead(404).end();
  });
  const port = await listen(server);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const redirect = await fetch(`http://127.0.0.1:${port}/fury-flock`, { redirect: "manual" });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get("location"), "/fury-flock/");

  const page = await fetch(`http://127.0.0.1:${port}/fury-flock/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.match(await page.text(), /Fury Flock/);

  const asset = await fetch(`http://127.0.0.1:${port}/fury-flock/assets/index-AbC123.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type"), /text\/javascript/);
  assert.match(asset.headers.get("cache-control"), /immutable/);

  const fallback = await fetch(`http://127.0.0.1:${port}/fury-flock/mission/1`);
  assert.equal(fallback.status, 200);
  assert.match(await fallback.text(), /Fury Flock/);

  const traversal = await fetch(`http://127.0.0.1:${port}/fury-flock/%2e%2e%2fsecret.txt`);
  assert.equal(traversal.status, 404);
  assert.doesNotMatch(await traversal.text(), /not public/);
});

test("Hub server delegates root game routes to the local static game handler", async () => {
  const source = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(source, /import \{ createLocalGameStatic \} from "\.\/local-game-static\.mjs"/);
  assert.match(source, /const localGameStatic = localMode[\s\S]*createLocalGameStatic/);
  assert.match(source, /localGameStatic && await localGameStatic\.handle\(request, response, rawUrl\)/);
});
