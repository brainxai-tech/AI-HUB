import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildMatchRecord,
  createMatchRecordId,
  parseMatchHistory,
  toggleFavoriteRecord,
  upsertMatchHistory
} from "../lib/result-history.ts";
import type { MatchResult } from "../lib/types.ts";

const match: MatchResult = {
  idol: {
    id: "idol-1",
    name: "测试爱豆",
    source: "test",
    summary: "测试画像",
    tags: ["舞台型", "实力派"],
    traits: {},
    entryReasons: ["舞台直拍"],
    roles: ["歌手"],
    confidence: 91
  },
  score: 88,
  confidence: 82,
  matchedTags: ["舞台型", "实力派", "热血", "反差型", "收藏型"],
  reasons: [],
  dimensionScores: []
};

describe("result history", () => {
  it("builds a stable record id from mode and answer signature", () => {
    assert.equal(createMatchRecordId("experience", "a|b"), "experience:a|b");
  });

  it("builds a compact match history record", () => {
    const record = buildMatchRecord({
      mode: "experience",
      modeName: "体验版",
      answerSignature: "a|b",
      match,
      savedAt: "2026-06-11T08:00:00.000Z"
    });

    assert.equal(record.idolName, "测试爱豆");
    assert.equal(record.score, 88);
    assert.equal(record.favorite, false);
    assert.equal(record.tags.length, 4);
  });

  it("upserts records while preserving favorite state", () => {
    const first = buildMatchRecord({
      mode: "experience",
      modeName: "体验版",
      answerSignature: "a|b",
      match,
      savedAt: "2026-06-11T08:00:00.000Z"
    });
    const favorited = toggleFavoriteRecord([first], first.id);
    const next = { ...first, score: 91, savedAt: "2026-06-11T09:00:00.000Z" };
    const [record] = upsertMatchHistory(favorited, next);

    assert.equal(record.score, 91);
    assert.equal(record.favorite, true);
    assert.equal(record.savedAt, "2026-06-11T09:00:00.000Z");
  });

  it("parses only valid stored history records", () => {
    const record = buildMatchRecord({
      mode: "professional",
      modeName: "专业版",
      answerSignature: "c|d",
      match
    });
    const parsed = parseMatchHistory(JSON.stringify([record, { id: "bad" }]));

    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].modeName, "专业版");
    assert.deepEqual(parseMatchHistory("not json"), []);
  });
});
