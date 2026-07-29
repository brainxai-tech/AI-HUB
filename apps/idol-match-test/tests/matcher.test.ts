import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { IdolProfile } from "../lib/types.ts";
import { buildUserPreferenceProfile, matchIdols } from "../lib/matcher.ts";

const candidateIdols: IdolProfile[] = [
  {
    id: "stage-fire",
    name: "舞台火花",
    source: "test",
    summary: "热血舞台型候选",
    tags: ["热血", "舞台型", "实力派", "饭圈互动型"],
    traits: {
      热血: 5,
      舞台型: 5,
      实力派: 4,
      饭圈互动型: 3
    },
    entryReasons: ["舞台直拍", "演唱会切片"],
    roles: ["歌手", "舞者"],
    confidence: 90
  },
  {
    id: "quiet-actor",
    name: "清冷演员",
    source: "test",
    summary: "安静作品型候选",
    tags: ["清冷", "演员型", "陪伴型"],
    traits: {
      清冷: 5,
      演员型: 5,
      陪伴型: 3
    },
    entryReasons: ["角色混剪"],
    roles: ["演员"],
    confidence: 84
  }
];

describe("idol matching", () => {
  it("turns selected option ids into a weighted user preference profile", () => {
    const profile = buildUserPreferenceProfile([
      "stage-a",
      "stage-b",
      "interaction-a"
    ]);

    assert.ok(profile.tags.includes("舞台型"));
    assert.ok(profile.tags.includes("热血"));
    assert.ok(profile.traits.舞台型 > 0);
    assert.ok(profile.selectedOptionIds.includes("stage-a"));
  });

  it("ranks candidates by overlapping weighted traits and explains the match", () => {
    const profile = {
      selectedOptionIds: ["manual"],
      tags: ["热血", "舞台型", "实力派", "饭圈互动型"],
      traits: {
        热血: 6,
        舞台型: 6,
        实力派: 4,
        饭圈互动型: 3
      }
    };

    const [top, second] = matchIdols(profile, candidateIdols);

    assert.equal(top.idol.id, "stage-fire");
    assert.ok(top.score > second.score);
    assert.ok(top.matchedTags.includes("舞台型"));
    assert.ok(top.reasons.some((reason) => reason.includes("舞台型")));
  });

  it("returns confidence and dimension diagnostics for result explanations", () => {
    const profile = {
      selectedOptionIds: ["manual"],
      tags: ["热血", "舞台型", "实力派", "饭圈互动型"],
      traits: {
        热血: 6,
        舞台型: 6,
        实力派: 4,
        饭圈互动型: 3
      }
    };

    const [top] = matchIdols(profile, candidateIdols);

    assert.ok(top.confidence > 0);
    assert.ok(top.dimensionScores.length >= 3);
    assert.ok(top.dimensionScores.some((item) => item.label === "舞台"));
  });
});
