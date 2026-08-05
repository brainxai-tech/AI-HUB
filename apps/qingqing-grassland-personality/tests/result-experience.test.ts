import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { personalityTypes } from "../data/personality-test.ts";
import {
  getAnswerFeedback,
  getExperienceModeNudge,
  getPersonalityUniversePoints,
  getRelationshipComboLibrary,
  resultTabs
} from "../lib/result-experience.ts";

describe("result experience helpers", () => {
  it("defines stable result tabs in the intended order", () => {
    assert.deepEqual(resultTabs.map((tab) => tab.id), [
      "overview",
      "social",
      "atlas",
      "scores",
      "archive",
      "share"
    ]);
  });

  it("returns answer feedback for every scale value", () => {
    assert.equal(getAnswerFeedback(1).tone, "disagree");
    assert.equal(getAnswerFeedback(2).tone, "disagree");
    assert.equal(getAnswerFeedback(3).tone, "neutral");
    assert.equal(getAnswerFeedback(4).tone, "agree");
    assert.equal(getAnswerFeedback(5).tone, "agree");
  });

  it("nudges only experience mode toward the professional version", () => {
    assert.equal(getExperienceModeNudge("professional", 30), null);

    const nudge = getExperienceModeNudge("experience", 15);

    assert.ok(nudge);
    assert.match(nudge.body, /15/);
    assert.match(nudge.ctaLabel, /专业版/);
  });

  it("maps every personality into a bounded universe point and flags current", () => {
    const points = getPersonalityUniversePoints("grassland-sun");

    assert.equal(points.length, 20);
    assert.equal(points.filter((point) => point.isCurrent).length, 1);
    assert.equal(points.find((point) => point.id === "grassland-sun")?.isCurrent, true);

    for (const point of points) {
      assert.ok(point.x >= 6 && point.x <= 94);
      assert.ok(point.y >= 6 && point.y <= 94);
      assert.ok(point.quadrant.length > 0);
      assert.ok(point.toneClass.length > 0);
    }
  });

  it("builds a unique relationship combo library for a result", () => {
    const self = personalityTypes.find((type) => type.id === "grassland-sun")!;
    const combos = getRelationshipComboLibrary(self);

    assert.ok(combos.length >= 3);
    assert.equal(new Set(combos.map((combo) => combo.partner.id)).size, combos.length);
    assert.ok(combos.every((combo) => combo.partner.id !== self.id));
    assert.ok(combos.every((combo) => combo.report.distance > 0));
    assert.ok(combos.every((combo) => combo.label.length > 0));
  });
});
