import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dimensions, personalityTypes } from "../data/personality-test.ts";
import {
  buildAtlasCardFilename,
  buildAtlasCardSvg,
  buildShareCardFilename,
  buildShareCardSvg,
  getClosestPersonalityMatches,
  getDimensionInsight,
  shareCardStyles
} from "../lib/result-enhancements.ts";
import { getPersonalityVisualProfile } from "../lib/result-presentation.ts";

describe("result growth helpers", () => {
  it("returns the closest personality matches in distance order", () => {
    const matches = getClosestPersonalityMatches(
      { SE: 80, AC: 40, RB: -40, RV: 40, EE: 80 },
      3
    );

    assert.equal(matches.length, 3);
    assert.equal(matches[0]?.id, "grassland-sun");
    assert.ok(matches[0]!.distance <= matches[1]!.distance);
    assert.ok(matches[1]!.distance <= matches[2]!.distance);
  });

  it("explains a dimension score with the correct directional label", () => {
    const positive = getDimensionInsight("SE", 67);
    const neutral = getDimensionInsight("AC", 0);
    const negative = getDimensionInsight("EE", -52);

    assert.equal(positive.label, dimensions.find((dimension) => dimension.id === "SE")?.positiveLabel);
    assert.equal(neutral.label.length > 0, true);
    assert.equal(negative.label, dimensions.find((dimension) => dimension.id === "EE")?.negativeLabel);
    assert.match(positive.description, new RegExp(positive.name));
    assert.ok(negative.suggestion.length > 0);
  });

  it("builds a share card svg with escaped text and key result data", () => {
    const type = personalityTypes.find((item) => item.id === "grassland-sun");
    assert.ok(type);

    const svg = buildShareCardSvg({
      personality: { ...type, name: "Grassland Sun <Test>" },
      visualProfile: getPersonalityVisualProfile(type.id),
      scores: { SE: 80, AC: 40, RB: -40, RV: 40, EE: 80 },
      modeLabel: "Professional / 30",
      dimensions
    });

    assert.match(svg, /<svg/);
    assert.match(svg, /Grassland Sun &lt;Test&gt;/);
    assert.match(svg, /Professional \/ 30/);
    assert.match(svg, new RegExp(dimensions[0]!.name));
    assert.match(svg, /qingqing-grassland-personality\.vercel\.app/);
  });

  it("supports multiple result share card styles", () => {
    const type = personalityTypes.find((item) => item.id === "grassland-sun");
    assert.ok(type);

    assert.ok(shareCardStyles.length >= 3);

    const classicSvg = buildShareCardSvg({
      personality: type,
      visualProfile: getPersonalityVisualProfile(type.id),
      scores: { SE: 80, AC: 40, RB: -40, RV: 40, EE: 80 },
      modeLabel: "Professional / 30",
      dimensions,
      styleId: "classic"
    });
    const fieldNoteSvg = buildShareCardSvg({
      personality: type,
      visualProfile: getPersonalityVisualProfile(type.id),
      scores: { SE: 80, AC: 40, RB: -40, RV: 40, EE: 80 },
      modeLabel: "Professional / 30",
      dimensions,
      styleId: "field-note"
    });

    assert.notEqual(classicSvg, fieldNoteSvg);
    assert.match(fieldNoteSvg, /field-note/);
    assert.match(buildShareCardFilename(type.name, "field-note"), /field-note\.png$/);
  });

  it("builds atlas card share assets for a single personality", () => {
    const type = personalityTypes.find((item) => item.id === "grassland-sun");
    assert.ok(type);

    const svg = buildAtlasCardSvg({
      personality: type,
      visualProfile: getPersonalityVisualProfile(type.id),
      isCurrent: true
    });

    assert.match(svg, /<svg/);
    assert.match(svg, /grassland-sun/);
    assert.match(svg, /qingqing-grassland-personality\.vercel\.app/);
    assert.match(svg, new RegExp(type.name));
    assert.match(svg, new RegExp(type.keywords[0]!));
    assert.match(buildAtlasCardFilename(type.name), /^qingqing-atlas-.+\.png$/);
  });
});
