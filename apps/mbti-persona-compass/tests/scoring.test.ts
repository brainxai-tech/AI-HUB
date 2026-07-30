import { describe, expect, it } from "vitest";
import { questions } from "../src/data/questions";
import { personalityProfiles } from "../src/data/results";
import { getFirstUnansweredIndex, scoreAnswers } from "../src/lib/scoring";
import type { AnswerMap, AnswerValue } from "../src/types";

function answersFor(type: string): AnswerMap {
  return Object.fromEntries(
    questions.map((question) => {
      const value: AnswerValue = type.includes(question.pole) ? 2 : -2;
      return [question.id, value];
    }),
  ) as AnswerMap;
}

describe("scoreAnswers", () => {
  it.each(["INTJ", "ENTP", "ISFJ", "ESFP"])("identifies a clear %s preference", (type) => {
    const result = scoreAnswers(answersFor(type));
    expect(result.type).toBe(type);
    expect(result.isComplete).toBe(true);
    expect(result.answeredCount).toBe(32);
  });

  it("keeps a neutral response at the center and exposes low confidence", () => {
    const neutralAnswers = Object.fromEntries(questions.map((question) => [question.id, 0])) as AnswerMap;
    const result = scoreAnswers(neutralAnswers);

    expect(result.type).toBe("ESTJ");
    expect(Object.values(result.metrics).every((metric) => metric.firstPercent === 50)).toBe(true);
    expect(Object.values(result.metrics).every((metric) => metric.confidence === 0)).toBe(true);
  });

  it("reports incomplete progress without inventing answered questions", () => {
    const result = scoreAnswers({ 1: 2, 2: -1, 4: 0 });
    expect(result.answeredCount).toBe(3);
    expect(result.isComplete).toBe(false);
    expect(getFirstUnansweredIndex({ 1: 2, 2: -1, 4: 0 })).toBe(2);
  });

  it("has authored result content for all 16 types", () => {
    const expectedTypes = [
      "INTJ", "INTP", "ENTJ", "ENTP", "INFJ", "INFP", "ENFJ", "ENFP",
      "ISTJ", "ISFJ", "ESTJ", "ESFJ", "ISTP", "ISFP", "ESTP", "ESFP",
    ];
    expect(Object.keys(personalityProfiles).sort()).toEqual(expectedTypes.sort());
    expect(Object.values(personalityProfiles).every((profile) => profile.growthActions.length === 3)).toBe(true);
  });
});
