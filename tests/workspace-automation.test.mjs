import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

test("one-click suite owns every documented tool and game port", async () => {
  const [supervisor, launcher, wrapper, readme, manifest] = await Promise.all([
    read("scripts/local-suite.mjs"),
    read("start-local-suite.ps1"),
    read("start-local-hub.ps1"),
    read("README.md"),
    read("deploy/project-manifest.json").then(JSON.parse),
  ]);
  for (const port of [4194, 4195, 4196, 4201, 4202, 4203, 4204, 4205, 4211, 4212, 4213]) {
    assert.match(launcher, new RegExp(String(port)));
    assert.match(readme, new RegExp(String(port)));
  }
  assert.match(supervisor, /4194/);
  assert.match(supervisor, /4195/);
  assert.match(supervisor, /manifest\.workflowApi/);
  assert.deepEqual(manifest.projects.filter(({ api }) => api === "dedicated").map(({ port }) => port), [4201, 4202, 4203, 4204, 4205]);
  assert.deepEqual(manifest.games.filter(({ api }) => api === "dedicated").map(({ port }) => port), [4211, 4212, 4213]);
  assert.match(supervisor, /manifest\.games\.filter/);
  assert.match(supervisor, /node_modules[\\/]next[\\/]dist[\\/]bin[\\/]next/);
  assert.match(launcher, /4194\/fury-flock\//);
  assert.match(launcher, /4194\/hub\/dice-estate\//);
  assert.match(supervisor, /provisionLocalAccess/);
  assert.match(supervisor, /provisionPikafish/);
  assert.match(supervisor, /PIKAFISH_PATH/);
  assert.match(supervisor, /game\.id === "ai-xiangqi-duel"/);
  assert.match(supervisor, /AIHUB_SERVE_PROJECT_UI/);
  assert.match(supervisor, /HUB_PROJECT_TOKEN: token/);
  assert.doesNotMatch(supervisor, /console\.log\([^\n]*token/i);
  assert.match(wrapper, /start-local-suite\.ps1/);
});

test("fresh-clone CI installs, verifies, scans, and runs browser E2E", async () => {
  const [workflow, packageJson, tasks, scanner, e2e, manifest] = await Promise.all([
    read(".github/workflows/fresh-clone.yml"),
    read("package.json").then(JSON.parse),
    read("scripts/workspace-tasks.mjs"),
    read("scripts/security-scan.mjs"),
    read("scripts/local-suite-e2e.mjs"),
    read("deploy/project-manifest.json").then(JSON.parse),
  ]);
  for (const script of ["workspace:install", "workspace:verify", "security:scan", "e2e"]) {
    assert.equal(typeof packageJson.scripts[script], "string", `${script} is missing`);
  }
  assert.match(workflow, /actions\/checkout@v4/);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /npm run workspace:install/);
  assert.match(workflow, /npm run workspace:verify/);
  assert.match(workflow, /npm run security:scan/);
  assert.match(workflow, /npm run e2e/);
  assert.match(workflow, /games\/\*\/package-lock\.json/);
  assert.match(tasks, /manifest\.projects/);
  assert.match(tasks, /manifest\.games/);
  assert.match(tasks, /vite-static/);
  assert.match(tasks, /npm-cli\.js/);
  assert.match(tasks, /process\.execPath/);
  assert.doesNotMatch(tasks, /spawnSync\([^\n]*npm\.cmd/);
  assert.match(scanner, /git.*ls-files/s);
  assert.match(scanner, /manifest\.games/);
  assert.doesNotMatch(scanner, /excludedGames/);
  assert.match(e2e, /manifest\.projects/);
  assert.match(e2e, /chromium\.launch/);
  assert.match(e2e, /work-report\/api\/model-selection/);
  assert.match(e2e, /chat\/completions/);

  for (const game of manifest.games.filter(({ source }) => source.startsWith("games/"))) {
    const gamePackage = JSON.parse(await read(`${game.source}/package.json`));
    assert.equal(typeof gamePackage.scripts.verify, "string", `${game.id} verify script is missing`);
  }
});
