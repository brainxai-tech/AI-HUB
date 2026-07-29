import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { personalityTypes, testModes } from "../data/personality-test.ts";
import {
  RESULT_ARCHIVE_LIMIT,
  RESULT_ARCHIVE_STORAGE_KEY,
  addArchivedResult,
  clearArchiveStorage,
  createArchivedResult,
  getArchiveDelta,
  parseArchive,
  readArchive,
  writeArchive,
  type ArchiveStorage
} from "../lib/result-archive.ts";

class MemoryStorage implements ArchiveStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const sun = personalityTypes.find((type) => type.id === "grassland-sun")!;
const moon = personalityTypes.find((type) => type.id === "moonlight-boundary")!;
const experienceMode = testModes.find((mode) => mode.id === "experience")!;

const sunScores = { SE: 80, AC: 40, RB: -40, RV: 40, EE: 80 };
const moonScores = { SE: -80, AC: 0, RB: 80, RV: 0, EE: -40 };

describe("result archive helpers", () => {
  it("creates an archive entry with result, mode, timestamp, and scores", () => {
    const finishedAt = new Date("2026-06-05T08:00:00+08:00");
    const entry = createArchivedResult(
      {
        personality: sun,
        mode: experienceMode,
        answeredCount: 15,
        scores: sunScores
      },
      finishedAt
    );

    assert.equal(entry.personalityId, "grassland-sun");
    assert.equal(entry.personalityName, "草原太阳型");
    assert.equal(entry.modeId, "experience");
    assert.equal(entry.modeName, "体验版");
    assert.equal(entry.answeredCount, 15);
    assert.equal(entry.finishedAt, finishedAt.toISOString());
    assert.deepEqual(entry.scores, sunScores);
    assert.ok(entry.id.includes("grassland-sun"));
  });

  it("prepends entries, dedupes by id, and limits archive size", () => {
    const entries = Array.from({ length: RESULT_ARCHIVE_LIMIT + 2 }, (_, index) =>
      createArchivedResult(
        {
          personality: index % 2 === 0 ? sun : moon,
          mode: experienceMode,
          answeredCount: 15,
          scores: index % 2 === 0 ? sunScores : moonScores
        },
        new Date(Date.UTC(2026, 5, 5, 0, index))
      )
    );

    const archive = entries.reduce(
      (collection, entry) => addArchivedResult(collection, entry),
      [] as typeof entries
    );

    assert.equal(archive.length, RESULT_ARCHIVE_LIMIT);
    assert.equal(archive[0]?.id, entries.at(-1)?.id);

    const deduped = addArchivedResult(archive, archive[2]!);
    assert.equal(deduped.length, RESULT_ARCHIVE_LIMIT);
    assert.equal(deduped[0]?.id, archive[2]?.id);
    assert.equal(deduped.filter((entry) => entry.id === archive[2]?.id).length, 1);
  });

  it("parses invalid archive data as an empty archive", () => {
    assert.deepEqual(parseArchive(null), []);
    assert.deepEqual(parseArchive("not json"), []);
    assert.deepEqual(parseArchive(JSON.stringify({ entries: [] })), []);
  });

  it("reads, writes, and clears archive storage", () => {
    const storage = new MemoryStorage();
    const entry = createArchivedResult(
      {
        personality: sun,
        mode: experienceMode,
        answeredCount: 15,
        scores: sunScores
      },
      new Date("2026-06-05T08:00:00+08:00")
    );

    writeArchive(storage, [entry]);
    assert.equal(storage.getItem(RESULT_ARCHIVE_STORAGE_KEY)?.includes("grassland-sun"), true);
    assert.deepEqual(readArchive(storage), [entry]);

    clearArchiveStorage(storage);
    assert.deepEqual(readArchive(storage), []);
  });

  it("compares a saved result against the previous archive entry", () => {
    const previous = createArchivedResult(
      {
        personality: moon,
        mode: experienceMode,
        answeredCount: 15,
        scores: moonScores
      },
      new Date("2026-06-04T08:00:00+08:00")
    );
    const current = createArchivedResult(
      {
        personality: sun,
        mode: experienceMode,
        answeredCount: 15,
        scores: sunScores
      },
      new Date("2026-06-05T08:00:00+08:00")
    );

    const delta = getArchiveDelta(current, previous);

    assert.ok(delta);
    assert.equal(delta.personalityChanged, true);
    assert.equal(delta.previousPersonalityName, "月光边界型");
    assert.deepEqual(delta.dimensionDeltas, {
      SE: 160,
      AC: 40,
      RB: -120,
      RV: 40,
      EE: 120
    });
  });
});
