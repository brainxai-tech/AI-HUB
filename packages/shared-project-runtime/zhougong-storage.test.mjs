import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("zhougong storage keeps history and usage in the configured persistent directory", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "aihub-zhougong-"));
  process.env.ZHOUGONG_DATA_DIR = directory;
  try {
    const storage = await import(`./zhougong-storage.mjs?test=${Date.now()}`);
    assert.deepEqual(await storage.listHistoryEntries(), []);
    await storage.saveHistoryEntry(
      { dreamText: "migration smoke", provider: "openai", model: "gpt-5.4" },
      { summary: "visual result" },
      { provider: "openai", model: "gpt-5.4", mode: "model" },
    );
    await storage.logUsage({ provider: "openai", success: true });

    const entries = await storage.listHistoryEntries();
    assert.equal(entries.length, 1);
    assert.equal((await storage.getUsageStats()).totalInterpretations, 1);
    assert.match(await readFile(path.join(directory, "usage.jsonl"), "utf8"), /openai/);
  } finally {
    delete process.env.ZHOUGONG_DATA_DIR;
    await rm(directory, { recursive: true, force: true });
  }
});
