export type Dimension = "EI" | "SN" | "TF" | "JP";
export type PersonalityLetter = "E" | "I" | "S" | "N" | "T" | "F" | "J" | "P";
export type AnswerValue = -2 | -1 | 0 | 1 | 2;

export interface Question {
  id: number;
  dimension: Dimension;
  pole: PersonalityLetter;
  scene: string;
  statement: string;
}

export interface AnswerMap {
  [questionId: number]: AnswerValue;
}

export interface DimensionMetric {
  dimension: Dimension;
  first: PersonalityLetter;
  second: PersonalityLetter;
  firstPercent: number;
  secondPercent: number;
  confidence: number;
}

export interface ScoreResult {
  type: string;
  answeredCount: number;
  isComplete: boolean;
  metrics: Record<Dimension, DimensionMetric>;
}

export type PersonalityGroup = "分析家" | "外交家" | "守护者" | "探险家";

export interface PersonalityProfile {
  type: string;
  title: string;
  group: PersonalityGroup;
  motto: string;
  summary: string;
  strengths: string[];
  watchouts: string[];
  workStyle: string;
  relationshipStyle: string;
  growthActions: string[];
}
