import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dimensions,
  getQuestionsForMode,
  personalityTypes,
  questions,
  testModes,
  type AnswerValue
} from "../data/personality-test.ts";
import {
  calculateScores,
  findClosestPersonality,
  getDimensionMaximums
} from "../lib/scoring.ts";

describe("grassland personality scoring", () => {
  it("keeps the complete authored data set available", () => {
    assert.equal(dimensions.length, 5);
    assert.equal(questions.length, 30);
    assert.equal(personalityTypes.length, 20);

    for (const type of personalityTypes) {
      assert.ok(type.id);
      assert.ok(type.name);
      assert.equal(Object.keys(type.anchor).length, 5);
      assert.ok(type.keywords.length >= 3);
      assert.ok(type.summary);
      assert.ok(type.strength);
      assert.ok(type.blindSpot);
      assert.ok(type.relationshipTip);
      assert.ok(type.dailyAdvice);
    }
  });

  it("applies plus and minus mappings from the 5 point scale", () => {
    const result = calculateScores({ 1: 5, 2: 1 });

    assert.equal(result.raw.SE, 4);
    assert.equal(result.raw.EE, 4);
    assert.equal(result.answeredCount, 2);
  });

  it("normalizes each dimension by that dimension's maximum possible absolute score", () => {
    assert.deepEqual(getDimensionMaximums(), {
      SE: 26,
      AC: 24,
      RB: 20,
      RV: 20,
      EE: 30
    });

    const result = calculateScores({ 1: 5, 2: 1 });

    assert.equal(result.normalized.SE, 15);
    assert.equal(result.normalized.EE, 13);
    assert.equal(result.normalized.AC, 0);
  });

  it("matches the nearest authored anchor with deterministic tie handling", () => {
    const exactSun = findClosestPersonality({
      SE: 80,
      AC: 40,
      RB: -40,
      RV: 40,
      EE: 80
    });

    assert.equal(exactSun.id, "grassland-sun");

    const exactBoundary = findClosestPersonality({
      SE: -80,
      AC: 0,
      RB: 80,
      RV: 0,
      EE: -40
    });

    assert.equal(exactBoundary.id, "moonlight-boundary");
  });

  it("defines professional and experience modes with balanced scoring", () => {
    const professional = testModes.find((mode) => mode.id === "professional");
    const experience = testModes.find((mode) => mode.id === "experience");

    assert.equal(professional?.questionIds.length, 30);
    assert.equal(experience?.questionIds.length, 15);
    assert.equal(getQuestionsForMode("professional").length, 30);
    assert.equal(getQuestionsForMode("experience").length, 15);

    assert.deepEqual(getDimensionMaximums(getQuestionsForMode("experience")), {
      SE: 12,
      AC: 12,
      RB: 12,
      RV: 12,
      EE: 12
    });

    const neutralExperienceAnswers = Object.fromEntries(
      getQuestionsForMode("experience").map((question) => [question.id, 3 as AnswerValue])
    );
    const result = calculateScores(neutralExperienceAnswers, getQuestionsForMode("experience"));

    assert.equal(result.answeredCount, 15);
    assert.deepEqual(result.normalized, {
      SE: 0,
      AC: 0,
      RB: 0,
      RV: 0,
      EE: 0
    });
  });
});
