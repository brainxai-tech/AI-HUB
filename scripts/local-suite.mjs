import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { provisionLocalAccess } from "./provision-local-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDirectory = path.resolve(process.env.AIHUB_LOCAL_RUNTIME_DIR || path.join(root, ".local-runtime"));
const manifestPath = path.join(root, "deploy/project-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const registryPath = path.join(runtimeDirectory, "project-tokens.json");
const sharedCredentialsPath = path.join(runtimeDirectory, "shared-project-credentials.json");
const stopSignalPath = path.join(runtimeDirectory, "suite.stop");
const children = [];
let stopping = false;

checkRuntimeArtifacts();
if (process.argv.includes("--check")) process.exit(0);

await mkdir(runtimeDirectory, { recursive: true });
await rm(stopSignalPath, { force: true });
await provisionLocalAccess({ manifestPath, registryPath, sharedPath: sharedCredentialsPath });
const credentials = JSON.parse(readFileSync(sharedCredentialsPath, "utf8"));

const hubOrigin = "http://127.0.0.1:4194";
const sharedOrigin = "http://127.0.0.1:4195";
const dedicatedProjects = manifest.projects.filter(({ api }) => api === "dedicated");
const dedicatedGames = manifest.games.filter(({ api }) => api === "dedicated");

startChild("hub", root, ["server.mjs"], {
  PORT: "4194",
  HUB_LOCAL_MODE: "true",
  HUB_LOCAL_PROJECT_PROXY: "true",
  HUB_LOCAL_PROJECT_MANIFEST_PATH: manifestPath,
  HUB_LOCAL_SHARED_ORIGIN: sharedOrigin,
  HUB_CONFIG_PATH: path.join(runtimeDirectory, "model-config.json"),
  HUB_PROJECT_MODELS_PATH: path.join(runtimeDirectory, "project-model-selections.json"),
  HUB_OBSERVABILITY_LOG_PATH: path.join(runtimeDirectory, "observability-events.jsonl"),
  HUB_PROJECT_TOKENS_PATH: registryPath,
  HUB_REMOTE_GATEWAY_ORIGIN: "",
  HUB_ADMIN_TOKEN: "",
});

startChild("shared-runtime", path.join(root, manifest.sharedApi.package), ["server.mjs"], {
  PORT: "4195",
  AIHUB_APPS_ROOT: path.join(root, "apps"),
  AIHUB_SHARED_CREDENTIALS_PATH: sharedCredentialsPath,
  AIHUB_PROJECT_MANIFEST_PATH: manifestPath,
  AIHUB_SERVE_PROJECT_UI: "true",
  HUB_MODEL_CONFIG_URL: `${hubOrigin}/hub/api/model-config`,
  HUB_CHAT_COMPLETIONS_URL: `${hubOrigin}/hub/api/v1/chat/completions`,
});

for (const project of dedicatedProjects) {
  const token = credentials.projects?.[project.id]?.token;
  if (typeof token !== "string" || token.length < 20) throw new Error(`Missing local project credential for ${project.id}`);
  startChild(project.id, path.join(root, project.source), ["dist-server/server/index.js", "--prod"], {
    PORT: String(project.port),
    NODE_ENV: "production",
    BASE_PATH: project.route.replace(/\/$/, ""),
    VITE_BASE_PATH: project.route,
    HUB_MODEL_CONFIG_URL: `${hubOrigin}/hub/api/model-config`,
    HUB_CHAT_COMPLETIONS_URL: `${hubOrigin}/hub/api/v1/chat/completions`,
    HUB_PROJECT_ID: project.id,
    HUB_PROJECT_PATH: project.route.replace(/\/$/, ""),
    HUB_PROJECT_TOKEN: token,
  });
}

for (const game of dedicatedGames) {
  const token = credentials.projects?.[game.id]?.token;
  if (typeof token !== "string" || token.length < 20) throw new Error(`Missing local project credential for ${game.id}`);
  const gameRoot = path.join(root, game.source);
  const nextCli = path.join(gameRoot, "node_modules/next/dist/bin/next");
  if (!existsSync(nextCli)) throw new Error(`Missing Next.js runtime for ${game.id}; run npm run workspace:install.`);
  startChild(game.id, gameRoot, [nextCli, "start", "-H", "127.0.0.1", "-p", String(game.port)], {
    PORT: String(game.port),
    NODE_ENV: "production",
    BASE_PATH: game.route.replace(/\/$/, ""),
    NEXT_PUBLIC_BASE_PATH: game.route.replace(/\/$/, ""),
    HUB_MODEL_CONFIG_URL: `${hubOrigin}/hub/api/model-config`,
    HUB_CHAT_COMPLETIONS_URL: `${hubOrigin}/hub/api/v1/chat/completions`,
    HUB_PROJECT_ID: game.id,
    HUB_PROJECT_PATH: game.route.replace(/\/$/, ""),
    HUB_PROJECT_TOKEN: token,
  });
}

try {
  await Promise.all([
    waitForJson(`${hubOrigin}/hub/api/health`),
    waitForJson(`${sharedOrigin}/health`),
    ...dedicatedProjects.map((project) =>
      waitForJson(`http://127.0.0.1:${project.port}${project.route}api/providers`),
    ),
    ...dedicatedGames.map((game) =>
      waitForHtml(`http://127.0.0.1:${game.port}${game.route}`),
    ),
    waitForHtml(`${hubOrigin}/fury-flock/`),
    waitForHtml(`${hubOrigin}/hub/dice-estate/`),
  ]);

  console.log(JSON.stringify({
    ready: true,
    hub: `${hubOrigin}/hub/`,
    sharedRuntime: sharedOrigin,
    dedicated: Object.fromEntries([...dedicatedProjects, ...dedicatedGames].map(({ id, port }) => [id, port])),
    staticGames: {
      "fury-flock": `${hubOrigin}/fury-flock/`,
      "dice-estate-duel": `${hubOrigin}/hub/dice-estate/`,
    },
  }));

  await waitForStopOrFailure();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await stopChildren();
  await rm(stopSignalPath, { force: true });
}

function startChild(name, cwd, args, additions) {
  const env = { ...process.env, ...additions };
  const child = spawn(process.execPath, args, { cwd, env, stdio: "inherit", windowsHide: true });
  child.suiteName = name;
  children.push(child);
  child.once("error", (error) => {
    console.error(`${name} failed to start: ${error.message}`);
  });
  return child;
}

async function waitForJson(url) {
  return waitForContentType(url, /application\/json/i);
}

async function waitForHtml(url) {
  return waitForContentType(url, /text\/html/i);
}

async function waitForContentType(url, contentTypePattern) {
  const deadline = Date.now() + Number(process.env.AIHUB_SUITE_START_TIMEOUT_MS || 120_000);
  while (Date.now() < deadline) {
    if (existsSync(stopSignalPath)) throw new Error("Local suite stop requested during startup");
    const failed = children.find(({ exitCode }) => exitCode !== null);
    if (failed) throw new Error(`${failed.suiteName} exited before the suite became ready`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_500), cache: "no-store" });
      if (response.ok && contentTypePattern.test(response.headers.get("content-type") || "")) return;
    } catch {
      // Keep polling within the bounded startup deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function waitForStopOrFailure() {
  return new Promise((resolve, reject) => {
    let settled = false;
    const exitListeners = new Map();
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearInterval(stopTimer);
      process.off("SIGINT", handleStop);
      process.off("SIGTERM", handleStop);
      for (const [child, listener] of exitListeners) child.off("exit", listener);
      if (error) reject(error);
      else resolve();
    };
    const handleStop = () => finish();
    const stopTimer = setInterval(() => {
      if (existsSync(stopSignalPath)) finish();
    }, 250);

    for (const child of children) {
      const listener = (code, signal) => {
        if (!stopping) finish(new Error(`${child.suiteName} exited unexpectedly (${signal || code})`));
      };
      exitListeners.set(child, listener);
      child.once("exit", listener);
    }
    process.once("SIGINT", handleStop);
    process.once("SIGTERM", handleStop);
  });
}

function checkRuntimeArtifacts() {
  const result = spawnSync(process.execPath, [path.join(root, "scripts/workspace-tasks.mjs"), "check"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${result.stderr || result.stdout}\nInstall and build the fresh clone with npm run workspace:install and npm run workspace:build.`.trim());
  }
}

async function stopChildren() {
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  await Promise.all(children.map((child) => child.exitCode === null
    ? new Promise((resolve) => child.once("exit", resolve))
    : undefined));
}
