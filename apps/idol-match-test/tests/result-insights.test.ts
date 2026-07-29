import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildEntryPathCards, buildTopCandidateInsights, getDimensionPercent } from "../lib/result-insights.ts";
import type { IdolProfile, MatchResult } from "../lib/types.ts";

const makeMatch = (
  id: string,
  name: string,
  score: number,
  matchedTags: string[],
  dimensionLabel = "舞台"
): MatchResult => ({
  idol: {
    id,
    name,
    source: "test",
    summary: `${name} summary`,
    tags: matchedTags,
    traits: {},
    entryReasons: ["舞台直拍", "角色混剪", "采访切片"],
    roles: ["歌手"],
    confidence: 90
  },
  score,
  confidence: 88,
  matchedTags,
  reasons: [],
  dimensionScores: [{ label: dimensionLabel, score: 8, matchedTags }]
});

describe("result insights", () => {
  it("explains why each top candidate differs from the leader", () => {
    const insights = buildTopCandidateInsights([
      makeMatch("one", "第一名", 92, ["舞台型", "实力派"]),
      makeMatch("two", "第二名", 90, ["舞台型", "陪伴型"], "陪伴"),
      makeMatch("three", "第三名", 82, ["清冷", "演员型"], "作品")
    ]);

    assert.equal(insights.length, 3);
    assert.match(insights[0].summary, /综合命中最高/);
    assert.match(insights[1].summary, /低 2 分/);
    assert.ok(insights[1].uniqueTags.includes("陪伴型"));
    assert.match(insights[2].summary, /作品/);
  });

  it("turns entry reasons into a three-step entry path", () => {
    const idol: IdolProfile = makeMatch("one", "第一名", 92, ["舞台型"]).idol;
    const cards = buildEntryPathCards(idol);

    assert.equal(cards.length, 3);
    assert.deepEqual(cards.map((card) => card.step), ["01", "02", "03"]);
    assert.match(cards[0].detail, /第一名/);
  });

  it("prefers DeepSeek-generated entry path actions when provided", () => {
    const idol: IdolProfile = makeMatch("one", "第一名", 92, ["舞台型"]).idol;
    const cards = buildEntryPathCards(idol, ["DeepSeek 高光", "DeepSeek 代表作", "DeepSeek 日常"]);

    assert.equal(cards[0].action, "DeepSeek 高光");
    assert.equal(cards[1].action, "DeepSeek 代表作");
    assert.equal(cards[2].action, "DeepSeek 日常");
  });

  it("normalizes dimension scores for visual bars", () => {
    assert.equal(getDimensionPercent(0, 10), 0);
    assert.equal(getDimensionPercent(5, 10), 50);
    assert.equal(getDimensionPercent(1, 100), 8);
    assert.equal(getDimensionPercent(20, 10), 100);
  });
});
