import {
  dimensions,
  personalityTypes,
  questions,
  type AnswerValue,
  type DimensionId,
  type DimensionVector,
  type Question,
  type PersonalityType
} from "../data/personality-test.ts";

export type AnswerMap = Partial<Record<number, AnswerValue>>;

export type ScoreResult = {
  raw: DimensionVector;
  maximums: DimensionVector;
  normalized: DimensionVector;
  answeredCount: number;
};

export type PersonalityMatch = PersonalityType & {
  distance: number;
};

export const createEmptyVector = (): DimensionVector => ({
  SE: 0,
  AC: 0,
  RB: 0,
  RV: 0,
  EE: 0
});

export function getDimensionMaximums(activeQuestions: Question[] = questions): DimensionVector {
  const maximums = createEmptyVector();

  for (const question of activeQuestions) {
    for (const mapping of question.mappings) {
      maximums[mapping.dimension] += 2;
    }
  }

  return maximums;
}

export function calculateScores(answers: AnswerMap, activeQuestions: Question[] = questions): ScoreResult {
  const raw = createEmptyVector();
  let answeredCount = 0;

  for (const question of activeQuestions) {
    const answer = answers[question.id];
    if (!answer) {
      continue;
    }

    answeredCount += 1;
    const delta = answer - 3;

    for (const mapping of question.mappings) {
      raw[mapping.dimension] += delta * mapping.direction;
    }
  }

  const maximums = getDimensionMaximums(activeQuestions);
  const normalized = normalizeVector(raw, maximums);

  return {
    raw,
    maximums,
    normalized,
    answeredCount
  };
}

export function findClosestPersonality(scores: DimensionVector): PersonalityMatch {
  let bestType = personalityTypes[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const type of personalityTypes) {
    const distance = getAnchorDistance(scores, type.anchor);

    if (distance < bestDistance) {
      bestType = type;
      bestDistance = distance;
    }
  }

  return {
    ...bestType,
    distance: bestDistance
  };
}

export function getAnchorDistance(a: DimensionVector, b: DimensionVector): number {
  return dimensions.reduce(
    (total, dimension) => total + Math.abs(a[dimension.id] - b[dimension.id]),
    0
  );
}

function normalizeVector(raw: DimensionVector, maximums: DimensionVector): DimensionVector {
  const normalized = createEmptyVector();

  for (const dimension of dimensions) {
    const max = maximums[dimension.id];
    normalized[dimension.id] = max === 0 ? 0 : clampScore(Math.round((raw[dimension.id] / max) * 100));
  }

  return normalized;
}

function clampScore(score: number): number {
  return Math.max(-100, Math.min(100, score));
}

export function getDimensionPositionLabel(dimension: DimensionId, value: number): string {
  const config = dimensions.find((item) => item.id === dimension);

  if (!config) {
    return "";
  }

  if (value <= -18) {
    return config.negativeLabel;
  }

  if (value >= 18) {
    return config.positiveLabel;
  }

  return "弹性平衡";
}
