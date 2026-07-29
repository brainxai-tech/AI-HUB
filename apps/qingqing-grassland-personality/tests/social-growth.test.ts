import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { personalityTypes } from "../data/personality-test.ts";
import {
  getDailyGrasslandWeather,
  getPersonalityAtlasEntries,
  getRelationshipReport
} from "../lib/social-growth.ts";

const sun = personalityTypes.find((type) => type.id === "grassland-sun")!;
const moon = personalityTypes.find((type) => type.id === "moonlight-boundary")!;

describe("social growth helpers", () => {
  it("marks identical relationship reports as same-frequency echo", () => {
    const report = getRelationshipReport(sun, sun);

    assert.equal(report.distance, 0);
    assert.equal(report.climate, "同频回声");
    assert.match(report.summary, /草原太阳型/);
  });

  it("summarizes contrast for distant relationship anchors", () => {
    const report = getRelationshipReport(sun, moon);

    assert.ok(report.distance > 0);
    assert.ok(report.shared.length > 0);
    assert.ok(report.watchOut.length > 0);
    assert.ok(report.suggestion.length > 0);
  });

  it("keeps daily weather stable for the same local date and personality", () => {
    const date = new Date("2026-06-05T08:00:00+08:00");
    const first = getDailyGrasslandWeather(sun, date);
    const second = getDailyGrasslandWeather(sun, date);

    assert.deepEqual(first, second);
    assert.equal(first.seedDate, "2026-06-05");
    assert.ok(first.title.length > 0);
    assert.ok(first.forecast.length > 0);
    assert.ok(first.action.length > 0);
  });

  it("exposes all personality atlas entries and flags the current result", () => {
    const entries = getPersonalityAtlasEntries("grassland-sun");

    assert.equal(entries.length, 20);
    assert.equal(entries.filter((entry) => entry.isCurrent).length, 1);
    assert.equal(entries.find((entry) => entry.id === "grassland-sun")?.isCurrent, true);
  });
});
