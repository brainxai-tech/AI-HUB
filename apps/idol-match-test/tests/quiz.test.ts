import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getQuizQuestionsForMode,
  quizModes,
  quizQuestions,
  requiredDimensions
} from "../lib/quiz.ts";

describe("idol match quiz", () => {
  it("ships exactly 40 authored questions with four options each", () => {
    assert.equal(quizQuestions.length, 40);

    for (const question of quizQuestions) {
      assert.ok(question.id);
      assert.ok(question.text.length >= 8);
      assert.ok(question.dimension);
      assert.equal(question.options.length, 4);

      const optionIds = new Set(question.options.map((option) => option.id));
      assert.equal(optionIds.size, 4);

      for (const option of question.options) {
        assert.ok(option.label.length >= 4);
        assert.ok(option.tags.length >= 1);
        assert.ok(Object.keys(option.weights).length >= 1);
      }
    }
  });

  it("covers the required eight idol preference dimensions", () => {
    const dimensions = new Set(quizQuestions.map((question) => question.dimension));

    assert.equal(requiredDimensions.length, 8);
    for (const dimension of requiredDimensions) {
      assert.ok(dimensions.has(dimension), `missing dimension: ${dimension}`);
    }
  });

  it("provides a 15 question experience mode that still covers all dimensions", () => {
    const experienceQuestions = getQuizQuestionsForMode("experience");
    const professionalQuestions = getQuizQuestionsForMode("professional");
    const dimensions = new Set(experienceQuestions.map((question) => question.dimension));

    assert.equal(quizModes.experience.questionCount, 15);
    assert.equal(quizModes.professional.questionCount, 40);
    assert.equal(experienceQuestions.length, 15);
    assert.equal(professionalQuestions.length, 40);

    for (const dimension of requiredDimensions) {
      assert.ok(dimensions.has(dimension), `experience mode missing dimension: ${dimension}`);
    }
  });

  it("keeps question copy simple enough to answer quickly", () => {
    for (const question of quizQuestions) {
      assert.ok(question.text.length <= 26, `question too long: ${question.id}`);

      for (const option of question.options) {
        assert.ok(option.label.length <= 16, `option too long: ${option.id}`);
        assert.doesNotMatch(option.label, /像.*也|越.*越|但.*也/, `option feels hard to parse: ${option.id}`);
      }
    }
  });
});
