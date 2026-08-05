import { randomBytes } from "node:crypto";
import { chmod, mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";

import { hashProjectToken, normalizeProjectTokenRegistry } from "../auth.mjs";

function argument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || "" : fallback;
}

const projectId = argument("project").trim().toLowerCase();
const registryPath = path.resolve(argument("registry", "./data/project-tokens.json"));
const scopes = argument("scopes", "model:chat")
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);
const requestsPerMinute = Number.parseInt(argument("requests-per-minute", "60"), 10);
const maxConcurrent = Number.parseInt(argument("max-concurrent", "4"), 10);

if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(projectId)) {
  throw new Error("--project must be a lowercase project id containing only letters, numbers, and hyphens.");
}

let current = { version: 1, projects: {} };
try {
  current = JSON.parse(await readFile(registryPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") {
    throw error;
  }
}

const token = randomBytes(32).toString("base64url");
current.projects ||= {};
current.projects[projectId] = {
  tokenHash: hashProjectToken(token),
  scopes,
  requestsPerMinute,
  maxConcurrent,
  enabled: true,
};
const normalized = normalizeProjectTokenRegistry(current);
if (!normalized.projects[projectId]) {
  throw new Error("The supplied scopes or limits are invalid.");
}

const temporaryPath = `${registryPath}.${process.pid}.tmp`;
await mkdir(path.dirname(registryPath), { recursive: true, mode: 0o700 });
const handle = await open(temporaryPath, "w", 0o600);
try {
  await handle.writeFile(`${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  await handle.sync();
} finally {
  await handle.close();
}
await chmod(temporaryPath, 0o600);
await rename(temporaryPath, registryPath);
await chmod(registryPath, 0o600);

console.log(`Project: ${projectId}`);
console.log(`Token: ${token}`);
console.log("Store this token in the project service environment now; it will not be written to the registry.");
