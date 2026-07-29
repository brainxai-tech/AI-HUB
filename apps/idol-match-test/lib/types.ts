export type QuizOption = {
  id: string;
  label: string;
  tags: string[];
  weights: Record<string, number>;
};

export type QuizQuestion = {
  id: string;
  text: string;
  dimension: string;
  options: QuizOption[];
};

export type IdolProfile = {
  id: string;
  name: string;
  source: string;
  summary: string;
  tags: string[];
  traits: Record<string, number>;
  entryReasons: string[];
  roles: string[];
  region?: string;
  age?: number;
  confidence: number;
};

export type UserPreferenceProfile = {
  selectedOptionIds: string[];
  tags: string[];
  traits: Record<string, number>;
};

export type DimensionScore = {
  label: string;
  score: number;
  matchedTags: string[];
};

export type MatchResult = {
  idol: IdolProfile;
  score: number;
  confidence: number;
  matchedTags: string[];
  reasons: string[];
  dimensionScores: DimensionScore[];
};

export type IdolDataStatus = {
  mode: "rag" | "mock" | "error";
  sourceLabel: string;
  message: string;
  searchedHints: string[];
};

export type IdolDataBundle = {
  status: IdolDataStatus;
  profiles: IdolProfile[];
};
