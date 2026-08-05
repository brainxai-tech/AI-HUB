import { createHash, randomBytes } from "node:crypto";
import { chmod, chown, mkdir, open, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultPolicy = {
  requestsPerMinute: 60,
  maxConcurrent: 4,
  dailyTokenBudget: 200000,
  enabled: true,
};

export function ensureProjectAccess({ registry, shared, projectId, scopes, token }) {
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(projectId || "")) {
    throw new Error("A valid project id is required.");
  }
  const normalizedScopes = Array.from(new Set((scopes || []).map(String).filter(Boolean)));
  if (!normalizedScopes.length) throw new Error("At least one scope is required.");

  const existingToken = shared?.projects?.[projectId]?.token;
  const effectiveToken = token || existingToken;
  if (typeof effectiveToken !== "string" || effectiveToken.length < 20) {
    throw new Error("A valid project token is required.");
  }

  const nextRegistry = structuredClone(registry || { version: 1, projects: {} });
  const nextShared = structuredClone(shared || { version: 1, projects: {} });
  nextRegistry.version ||= 1;
  nextRegistry.projects ||= {};
  nextShared.version ||= 1;
  nextShared.projects ||= {};

  nextRegistry.projects[projectId] = {
    ...defaultPolicy,
    ...(nextRegistry.projects[projectId] || {}),
    tokenHash: createHash("sha256").update(effectiveToken, "utf8").digest("hex"),
    scopes: normalizedScopes,
    enabled: true,
  };
  nextShared.projects[projectId] = { token: effectiveToken };
  return { registry: nextRegistry, shared: nextShared, token: effectiveToken };
}

async function atomicReplaceJson(filePath, value) {
  const metadata = await stat(filePath);
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  const handle = await open(temporaryPath, "wx", metadata.mode & 0o777);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(temporaryPath, metadata.mode & 0o777);
  await chown(temporaryPath, metadata.uid, metadata.gid);
  await rename(temporaryPath, filePath);
}

async function atomicWriteClientEnv(directoryPath, projectId, token) {
  await mkdir(directoryPath, { recursive: true, mode: 0o700 });
  const directoryMetadata = await stat(directoryPath);
  const targetPath = path.join(directoryPath, `${projectId}.env`);
  const temporaryPath = `${targetPath}.${process.pid}.tmp`;
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(`HUB_PROJECT_ID=${projectId}\nHUB_PROJECT_TOKEN=${token}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(temporaryPath, 0o600);
  await chown(temporaryPath, directoryMetadata.uid, directoryMetadata.gid);
  await rename(temporaryPath, targetPath);
}

async function main() {
  const projectId = process.argv[2];
  const scopes = String(process.argv[3] || "model:chat").split(",").map((scope) => scope.trim()).filter(Boolean);
  const registryPath = process.argv[4] || "/var/lib/ai-project-hub/project-tokens.json";
  const sharedPath = process.argv[5] || "/etc/ai-project-hub/shared-static-pilot.json";
  const clientsPath = process.argv[6] || "/home/admin/.config/ai-project-hub/clients";
  const [registry, shared] = await Promise.all([registryPath, sharedPath].map(async (filePath) => (
    JSON.parse(await readFile(filePath, "utf8"))
  )));
  const existingToken = shared?.projects?.[projectId]?.token;
  const result = ensureProjectAccess({
    registry,
    shared,
    projectId,
    scopes,
    token: existingToken || randomBytes(32).toString("base64url"),
  });

  // Consumers and the durable client env are updated before the authorizing
  // registry. Run this while Hub and shared API services are stopped.
  await atomicReplaceJson(sharedPath, result.shared);
  await atomicWriteClientEnv(clientsPath, projectId, result.token);
  await atomicReplaceJson(registryPath, result.registry);
  console.log(`Provisioned scoped access for ${projectId}: ${scopes.join(",")}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
