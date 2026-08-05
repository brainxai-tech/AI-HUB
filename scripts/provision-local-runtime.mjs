import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { hashProjectToken, normalizeProjectTokenRegistry } from "../auth.mjs";

function runtimeProjectIds(manifest) {
  return [
    ...manifest.projects,
    ...(manifest.games || []).filter(({ api }) => api !== "none"),
  ].map((project) => project.runtimeId || project.id);
}

function credentialsAreValid(registry, shared, projectIds) {
  return projectIds.every((projectId) => {
    const token = shared?.projects?.[projectId]?.token;
    const registered = registry?.projects?.[projectId];
    return (
      typeof token === "string" &&
      token.length >= 20 &&
      registered?.enabled === true &&
      registered.tokenHash === hashProjectToken(token) &&
      Array.isArray(registered.scopes) &&
      registered.scopes.includes("model:chat")
    );
  });
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function atomicWriteJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, filePath);
  await chmod(filePath, 0o600);
}

export async function provisionLocalAccess({ manifestPath, registryPath, sharedPath }) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const projectIds = runtimeProjectIds(manifest);
  const expectedCount = manifest.projects.length + manifest.games.filter(({ api }) => api !== "none").length;
  if (projectIds.length !== expectedCount || new Set(projectIds).size !== projectIds.length) {
    throw new Error(`The local runtime requires ${expectedCount} unique project IDs.`);
  }

  const [existingRegistry, existingShared] = await Promise.all([
    readJson(registryPath),
    readJson(sharedPath),
  ]);
  if (credentialsAreValid(existingRegistry, existingShared, projectIds)) {
    return { created: false, projectCount: projectIds.length };
  }

  const registry = { version: 1, projects: {} };
  const shared = { version: 1, projects: {} };
  for (const projectId of projectIds) {
    const token = randomBytes(32).toString("base64url");
    registry.projects[projectId] = {
      tokenHash: hashProjectToken(token),
      scopes: ["model:chat"],
      requestsPerMinute: 60,
      maxConcurrent: 4,
      dailyTokenBudget: 200000,
      enabled: true,
    };
    shared.projects[projectId] = { token };
  }

  const normalized = normalizeProjectTokenRegistry(registry);
  if (Object.keys(normalized.projects).length !== projectIds.length) {
    throw new Error("Generated project credentials failed validation.");
  }
  await Promise.all([
    atomicWriteJson(registryPath, normalized),
    atomicWriteJson(sharedPath, shared),
  ]);
  return { created: true, projectCount: projectIds.length };
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await provisionLocalAccess({
    manifestPath: path.resolve(argument("manifest")),
    registryPath: path.resolve(argument("registry")),
    sharedPath: path.resolve(argument("shared")),
  });
  console.log(`${result.created ? "Created" : "Reused"} scoped access for ${result.projectCount} projects.`);
}
