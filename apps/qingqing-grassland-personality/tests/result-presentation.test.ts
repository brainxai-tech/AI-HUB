import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { personalityTypes } from "../data/personality-test.ts";
import {
  buildShareText,
  getDimensionMarkerPosition,
  getDimensionNeedleRotation,
  getPersonalityVisualProfile
} from "../lib/result-presentation.ts";

describe("result presentation helpers", () => {
  it("builds a compact share text with the entertainment disclaimer", () => {
    const type = personalityTypes.find((item) => item.id === "grassland-sun");
    assert.ok(type);

    const shareText = buildShareText(type);

    assert.match(shareText, /草原太阳型/);
    assert.match(shareText, /热情 \/ 外向 \/ 感染力 \/ 明亮/);
    assert.match(shareText, /今日草原提醒/);
    assert.match(shareText, /娱乐自测/);
  });

  it("provides a stable visual profile for every personality result", () => {
    for (const type of personalityTypes) {
      const profile = getPersonalityVisualProfile(type.id);

      assert.ok(profile.motifLabel);
      assert.ok(profile.terrainLine);
      assert.ok(profile.toneClass);
      assert.ok(profile.stampText.length >= 2);
    }
  });

  it("maps dimension scores into bounded marker and needle values", () => {
    assert.equal(getDimensionMarkerPosition(-100), "0%");
    assert.equal(getDimensionMarkerPosition(0), "50%");
    assert.equal(getDimensionMarkerPosition(100), "100%");
    assert.equal(getDimensionMarkerPosition(180), "100%");

    assert.equal(getDimensionNeedleRotation(-100), "-72deg");
    assert.equal(getDimensionNeedleRotation(0), "0deg");
    assert.equal(getDimensionNeedleRotation(100), "72deg");
    assert.equal(getDimensionNeedleRotation(-180), "-72deg");
  });
});
