import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { FileRunStore } from "../src/run-store.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const NOW = Date.parse("2026-08-04T00:00:00.000Z");

test("store initialization applies the default 30-day retention window", async (t) => {
  const directory = await temporaryDirectory(t);
  await writeRun(directory, "expired-run-00000001", NOW - 31 * DAY_MS);
  await writeRun(directory, "recent-run-00000001", NOW - 29 * DAY_MS);

  const store = new FileRunStore(directory, { now: () => NOW });
  await store.initialize();

  await assert.rejects(() => store.get("expired-run-00000001"), { code: "RUN_NOT_FOUND" });
  assert.equal((await store.get("recent-run-00000001")).id, "recent-run-00000001");
});

test("store initialization supports an explicit bounded retention window", async (t) => {
  const sevenDayDirectory = await temporaryDirectory(t);
  await writeRun(sevenDayDirectory, "expired-run-00000002", NOW - 8 * DAY_MS);
  await writeRun(sevenDayDirectory, "recent-run-00000002", NOW - 6 * DAY_MS);
  const sevenDayStore = new FileRunStore(sevenDayDirectory, {
    retentionDays: 7,
    now: () => NOW,
  });
  await sevenDayStore.initialize();
  await assert.rejects(() => sevenDayStore.get("expired-run-00000002"), { code: "RUN_NOT_FOUND" });
  assert.equal((await sevenDayStore.get("recent-run-00000002")).id, "recent-run-00000002");

  const minimumDirectory = await temporaryDirectory(t);
  await writeRun(minimumDirectory, "expired-run-00000003", NOW - 25 * HOUR_MS);
  await writeRun(minimumDirectory, "recent-run-00000003", NOW - 23 * HOUR_MS);
  const minimumStore = new FileRunStore(minimumDirectory, { retentionDays: 0, now: () => NOW });
  await minimumStore.initialize();
  await assert.rejects(
    () => readFile(path.join(minimumDirectory, "expired-run-00000003.json"), "utf8"),
    { code: "ENOENT" },
  );
  assert.equal((await minimumStore.get("recent-run-00000003")).id, "recent-run-00000003");

  const maximumDirectory = await temporaryDirectory(t);
  await writeRun(maximumDirectory, "expired-run-00000004", NOW - 366 * DAY_MS);
  await writeRun(maximumDirectory, "recent-run-00000004", NOW - 364 * DAY_MS);
  const maximumStore = new FileRunStore(maximumDirectory, { retentionDays: 1_000, now: () => NOW });
  await maximumStore.initialize();
  await assert.rejects(
    () => readFile(path.join(maximumDirectory, "expired-run-00000004.json"), "utf8"),
    { code: "ENOENT" },
  );
  assert.equal((await maximumStore.get("recent-run-00000004")).id, "recent-run-00000004");
});

test("retention preserves malformed, unrelated, and invalid-timestamp files", async (t) => {
  const directory = await temporaryDirectory(t);
  const files = {
    "malformed-run-00000001.json": "{not-json",
    "invalid_id.json": JSON.stringify({ updatedAt: "2020-01-01T00:00:00.000Z" }),
    "notes.txt": "keep me",
    "bad-time-run-00000001.json": JSON.stringify({ updatedAt: "not-a-timestamp" }),
    "missing-time-run-00000001.json": JSON.stringify({ status: "completed" }),
    "mismatched-run-0000001.json": JSON.stringify({
      id: "different-run-0000001",
      updatedAt: "2020-01-01T00:00:00.000Z",
    }),
  };
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(path.join(directory, name), contents, "utf8");
  }

  await new FileRunStore(directory, { retentionDays: 1, now: () => NOW }).initialize();

  assert.deepEqual((await readdir(directory)).sort(), Object.keys(files).sort());
});

test("store deletion removes exactly one validated run and reports existence", async (t) => {
  const directory = await temporaryDirectory(t);
  const store = new FileRunStore(directory, { now: () => NOW });
  await store.save(run("target-run-00000001", NOW));
  await store.save(run("other-run-000000001", NOW));

  assert.equal(await store.delete("target-run-00000001"), true);
  assert.equal(await store.delete("target-run-00000001"), false);
  await assert.rejects(() => store.delete("../other-run-000000001"), { code: "INVALID_RUN_ID" });
  assert.equal((await store.get("other-run-000000001")).id, "other-run-000000001");
});

function run(id, updatedAt) {
  return {
    id,
    status: "completed",
    updatedAt: new Date(updatedAt).toISOString(),
  };
}

async function writeRun(directory, id, updatedAt) {
  await writeFile(
    path.join(directory, `${id}.json`),
    `${JSON.stringify(run(id, updatedAt))}\n`,
    "utf8",
  );
}

async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "aihub-run-store-"));
  t.after(async () => {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(tmpdir())));
    await rm(resolved, { recursive: true, force: true });
  });
  return directory;
}
