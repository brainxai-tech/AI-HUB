import { describe, expect, it } from "vitest";
import { questions } from "../src/data/questions";
import { personalityProfiles } from "../src/data/results";
import { scoreAnswers } from "../src/lib/scoring";
import type { AnswerMap, AnswerValue } from "../src/types";
import { buildSystemPrompt, buildUserPrompt, PROMPT_VERSION } from "../server/prompt.js";

function answersFor(type: string): AnswerMap {
  return Object.fromEntries(questions.map((question) => {
    const value: AnswerValue = type.includes(question.pole) ? 2 : -2;
    return [question.id, value];
  })) as AnswerMap;
}

describe("AI interpretation prompt", () => {
  it("includes the fixed type, all answer evidence, and uncertainty rules", () => {
    const answers = answersFor("INFP");
    const score = scoreAnswers(answers);
    const prompt = buildUserPrompt(answers, score, personalityProfiles.INFP);

    expect(prompt).toContain(PROMPT_VERSION);
    expect(prompt).toContain("固定结果：INFP");
    expect(prompt).toContain("Q1 [EI]");
    expect(prompt).toContain("Q32 [JP]");
    expect(prompt.match(/Q\d+ \[/g)).toHaveLength(32);
    expect(buildSystemPrompt()).toContain("不能重新判型");
    expect(buildSystemPrompt()).toContain("不得编造");
  });
});
