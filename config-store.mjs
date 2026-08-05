import { randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

function clone(value) {
  return structuredClone(value);
}

async function syncDirectory(directory) {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch (error) {
    if (!["EISDIR", "EINVAL", "EPERM", "EACCES"].includes(error?.code)) throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function atomicWrite(targetPath, serialized) {
  const directory = path.dirname(targetPath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(targetPath)}.tmp-${process.pid}-${randomUUID()}`,
  );
  let handle;

  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, targetPath);
    await chmod(targetPath, 0o600);
    await syncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

export function createConfigStore({ configPath, defaultConfig, normalize }) {
  if (!configPath || typeof defaultConfig !== "function" || typeof normalize !== "function") {
    throw new TypeError("configPath, defaultConfig, and normalize are required.");
  }

  let lastKnownGood = null;
  let currentStatus = { state: "degraded", code: "CONFIG_NOT_LOADED" };
  const lastKnownGoodPath = `${configPath}.last-known-good`;

  async function fallback(code) {
    currentStatus = { state: "degraded", code };
    if (lastKnownGood) return clone(lastKnownGood);
    try {
      const persisted = normalize(JSON.parse(await readFile(lastKnownGoodPath, "utf8")));
      lastKnownGood = clone(persisted);
      return clone(persisted);
    } catch {
      // Defaults are the final safe fallback when no valid persisted snapshot exists.
    }
    return clone(normalize(defaultConfig()));
  }

  return {
    async read() {
      let text;
      try {
        text = await readFile(configPath, "utf8");
      } catch (error) {
        if (error?.code === "ENOENT") return await fallback("CONFIG_MISSING");
        return await fallback("CONFIG_UNREADABLE");
      }

      try {
        const normalized = normalize(JSON.parse(text));
        lastKnownGood = clone(normalized);
        const serialized = `${JSON.stringify(normalized, null, 2)}\n`;
        try {
          const persisted = await readFile(lastKnownGoodPath, "utf8").catch(() => "");
          if (persisted !== serialized) await atomicWrite(lastKnownGoodPath, serialized);
          currentStatus = { state: "healthy", code: null };
        } catch {
          currentStatus = { state: "degraded", code: "CONFIG_SNAPSHOT_WRITE_FAILED" };
        }
        return clone(normalized);
      } catch {
        return await fallback("CONFIG_INVALID");
      }
    },

    async write(value) {
      const normalized = normalize(clone(value));
      const serialized = `${JSON.stringify(normalized, null, 2)}\n`;
      await atomicWrite(configPath, serialized);
      lastKnownGood = clone(normalized);
      try {
        await atomicWrite(lastKnownGoodPath, serialized);
        currentStatus = { state: "healthy", code: null };
      } catch {
        currentStatus = { state: "degraded", code: "CONFIG_SNAPSHOT_WRITE_FAILED" };
      }
      return clone(normalized);
    },

    status() {
      return { ...currentStatus };
    },
  };
}
