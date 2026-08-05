import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createProjectWebRuntime,
  withNextBasePath,
} from "./project-web-runtime.mjs";

test("Next startup receives the manifest base path without leaking project environment", async () => {
  const environment = { BASE_PATH: "/before" };
  const result = await withNextBasePath("/idol-match/", async (basePath) => {
    assert.equal(basePath, "/idol-match");
    assert.equal(environment.BASE_PATH, "/idol-match");
    assert.equal(environment.NEXT_PUBLIC_BASE_PATH, "/idol-match");
    return "ready";
  }, environment);
  assert.equal(result, "ready");
  assert.deepEqual(environment, { BASE_PATH: "/before" });
});

async function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

test("shared runtime serves built Vite and node-static project pages", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-hub-web-runtime-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "apps", "vite-app", "dist", "assets"), { recursive: true });
  await mkdir(path.join(root, "apps", "node-app", "public"), { recursive: true });
  await writeFile(path.join(root, "apps", "vite-app", "dist", "index.html"), "<h1>Vite app</h1>");
  await writeFile(path.join(root, "apps", "vite-app", "dist", "assets", "app.js"), "window.ready=true");
  await writeFile(path.join(root, "apps", "node-app", "public", "index.html"), "<h1>Node app</h1>");
  const manifestPath = path.join(root, "manifest.json");
  await writeFile(manifestPath, JSON.stringify({ projects: [
    { id: "vite-app", source: "apps/vite-app", route: "/vite/", stack: "vite", api: "shared" },
    { id: "node-app", source: "apps/node-app", route: "/node/", stack: "node-static", api: "shared" },
    { id: "dedicated-app", source: "apps/dedicated-app", route: "/dedicated/", stack: "vite", api: "dedicated", port: 4999 },
  ] }));

  const runtime = await createProjectWebRuntime({ appsRoot: path.join(root, "apps"), manifestPath });
  assert.deepEqual(runtime.projectIds, ["vite-app", "node-app"]);
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    if (!await runtime.handle(request, response, pathname)) response.writeHead(404).end();
  });
  const port = await listen(server);
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await runtime.close();
  });

  assert.match(await fetch(`http://127.0.0.1:${port}/vite/`).then((response) => response.text()), /Vite app/);
  assert.equal(await fetch(`http://127.0.0.1:${port}/vite/assets/app.js`).then((response) => response.text()), "window.ready=true");
  assert.match(await fetch(`http://127.0.0.1:${port}/node/deep/link`).then((response) => response.text()), /Node app/);
  assert.equal((await fetch(`http://127.0.0.1:${port}/dedicated/`)).status, 404);
});
