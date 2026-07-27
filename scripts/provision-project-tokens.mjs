import { randomBytes } from "node:crypto";
import { chmod, mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";

import { hashProjectToken, normalizeProjectTokenRegistry } from "../auth.mjs";

function argument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || "" : fallback;
}

async function atomicWrite(filePath, content, mode) {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  const handle = await open(temporaryPath, "w", mode);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(temporaryPath, mode);
  await rename(temporaryPath, filePath);
  await chmod(filePath, mode);
}

if (!process.argv.includes("--confirm-rotate")) {
  throw new Error("Refusing to rotate project credentials without --confirm-rotate.");
}

const manifestPath = path.resolve(argument("manifest"));
const registryPath = path.resolve(argument("registry"));
const secretsDirectory = path.resolve(argument("secrets-dir"));
if (!manifestPath || !registryPath || !secretsDirectory) {
  throw new Error("--manifest, --registry, and --secrets-dir are required.");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (!Array.isArray(manifest.projects) || manifest.projects.length === 0) {
  throw new Error("The manifest must contain a non-empty projects array.");
}

const rawRegistry = { version: 1, projects: {} };
const seen = new Set();
for (const project of manifest.projects) {
  const projectId = String(project.id || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(projectId) || seen.has(projectId)) {
    throw new Error(`Invalid or duplicate project id: ${projectId}`);
  }
  seen.add(projectId);
  const token = randomBytes(32).toString("base64url");
  rawRegistry.projects[projectId] = {
    tokenHash: hashProjectToken(token),
    scopes: project.scopes,
    requestsPerMinute: project.requestsPerMinute,
    maxConcurrent: project.maxConcurrent,
    dailyTokenBudget: project.dailyTokenBudget,
    enabled: project.enabled !== false,
  };
  await atomicWrite(
    path.join(secretsDirectory, `${projectId}.env`),
    `HUB_PROJECT_ID=${projectId}\nHUB_PROJECT_TOKEN=${token}\n`,
    0o600,
  );
}

const registry = normalizeProjectTokenRegistry(rawRegistry);
if (Object.keys(registry.projects).length !== manifest.projects.length) {
  throw new Error("One or more manifest entries failed registry validation.");
}
await atomicWrite(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 0o600);

for (const projectId of Object.keys(registry.projects).sort()) {
  console.log(`Provisioned scoped credential: ${projectId}`);
}

