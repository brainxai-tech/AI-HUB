import { questions as defaultQuestions } from "../data/questions.js";
import type { AnswerMap, Dimension, DimensionMetric, PersonalityLetter, Question, ScoreResult } from "../types.js";

const dimensionPoles: Record<Dimension, [PersonalityLetter, PersonalityLetter]> = {
  EI: ["E", "I"],
  SN: ["S", "N"],
  TF: ["T", "F"],
  JP: ["J", "P"],
};

export function scoreAnswers(answers: AnswerMap, questions: Question[] = defaultQuestions): ScoreResult {
  const raw: Record<Dimension, number> = { EI: 0, SN: 0, TF: 0, JP: 0 };
  const answeredPerDimension: Record<Dimension, number> = { EI: 0, SN: 0, TF: 0, JP: 0 };

  for (const question of questions) {
    const answer = answers[question.id];
    if (answer === undefined) continue;
    const [first] = dimensionPoles[question.dimension];
    raw[question.dimension] += answer * (question.pole === first ? 1 : -1);
    answeredPerDimension[question.dimension] += 1;
  }

  const metrics = {} as Record<Dimension, DimensionMetric>;
  let type = "";

  (Object.keys(dimensionPoles) as Dimension[]).forEach((dimension) => {
    const [first, second] = dimensionPoles[dimension];
    const maxAbsolute = Math.max(answeredPerDimension[dimension] * 2, 1);
    const firstPercent = Math.round(50 + (raw[dimension] / maxAbsolute) * 50);
    const clampedFirst = Math.max(0, Math.min(100, firstPercent));
    const secondPercent = 100 - clampedFirst;
    const winningLetter = clampedFirst >= 50 ? first : second;
    type += winningLetter;
    metrics[dimension] = {
      dimension,
      first,
      second,
      firstPercent: clampedFirst,
      secondPercent,
      confidence: Math.abs(clampedFirst - 50) * 2,
    };
  });

  const answeredCount = Object.keys(answers).filter((key) =>
    questions.some((question) => question.id === Number(key)),
  ).length;

  return {
    type,
    answeredCount,
    isComplete: answeredCount === questions.length,
    metrics,
  };
}

export function getFirstUnansweredIndex(answers: AnswerMap, questions: Question[] = defaultQuestions): number {
  const index = questions.findIndex((question) => answers[question.id] === undefined);
  return index === -1 ? questions.length - 1 : index;
}
