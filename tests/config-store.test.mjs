import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createConfigStore } from "../config-store.mjs";

function storeFor(configPath) {
  return createConfigStore({
    configPath,
    defaultConfig: () => ({ version: 1, value: "default" }),
    normalize: (value) => {
      if (!value || value.version !== 1 || typeof value.value !== "string") {
        throw new Error("invalid fixture config");
      }
      return { version: 1, value: value.value };
    }
  });
}

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hub-config-store-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const configPath = path.join(directory, "model-config.json");
  const store = storeFor(configPath);
  return { directory, configPath, store };
}

test("missing configuration uses defaults and reports a safe degraded status", async (t) => {
  const { store } = await fixture(t);

  assert.deepEqual(await store.read(), { version: 1, value: "default" });
  assert.deepEqual(store.status(), { state: "degraded", code: "CONFIG_MISSING" });
  assert.equal(JSON.stringify(store.status()).includes(os.tmpdir()), false);
});

test("malformed configuration falls back to the last known good value", async (t) => {
  const { configPath, store } = await fixture(t);
  await store.write({ version: 1, value: "known-good" });
  assert.deepEqual(await store.read(), { version: 1, value: "known-good" });

  await writeFile(configPath, "{broken json", "utf8");
  const restartedStore = storeFor(configPath);

  assert.deepEqual(await restartedStore.read(), { version: 1, value: "known-good" });
  assert.deepEqual(restartedStore.status(), { state: "degraded", code: "CONFIG_INVALID" });
});

test("an interrupted temporary write never replaces the current configuration", async (t) => {
  const { directory, configPath, store } = await fixture(t);
  await store.write({ version: 1, value: "current" });
  await writeFile(path.join(directory, ".model-config.json.tmp-interrupted"), "{partial", "utf8");

  assert.deepEqual(await store.read(), { version: 1, value: "current" });
  assert.deepEqual(store.status(), { state: "healthy", code: null });
  assert.match(await readFile(configPath, "utf8"), /"current"/);
});

test("writes replace configuration atomically with mode 0600", async (t) => {
  const { directory, configPath, store } = await fixture(t);

  await store.write({ version: 1, value: "replacement" });

  assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")), {
    version: 1,
    value: "replacement"
  });
  if (process.platform !== "win32") {
    assert.equal((await stat(configPath)).mode & 0o777, 0o600);
    assert.equal((await stat(`${configPath}.last-known-good`)).mode & 0o777, 0o600);
  }
  assert.deepEqual((await readdir(directory)).filter((name) => name.includes(".tmp-")), []);
  assert.deepEqual(store.status(), { state: "healthy", code: null });
});

test("a rejected write preserves the prior file and last known good value", async (t) => {
  const { configPath, store } = await fixture(t);
  await store.write({ version: 1, value: "preserved" });
  const before = await readFile(configPath, "utf8");

  await assert.rejects(() => store.write({ version: 2, value: "invalid" }), /invalid fixture config/);

  assert.equal(await readFile(configPath, "utf8"), before);
  assert.deepEqual(await store.read(), { version: 1, value: "preserved" });
});
