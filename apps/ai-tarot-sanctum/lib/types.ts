export type ReadingTheme = "relationship" | "career";

export type Arcana = "major" | "minor";

export type TarotSuit = "wands" | "cups" | "swords" | "pentacles";

export type Orientation = "upright" | "reversed";

export type SpreadPosition = "root" | "present" | "trend";

export type QuestionIntentId =
  | "relationship-reunion"
  | "relationship-progress"
  | "relationship-boundary"
  | "relationship-communication"
  | "relationship-timing"
  | "career-opportunity"
  | "career-money"
  | "career-execution"
  | "career-conflict"
  | "career-timing"
  | "general-judgment";

export interface QuestionIntent {
  id: QuestionIntentId;
  label: string;
  judgmentPath: string;
  matchedKeywords: string[];
}

export interface VerdictSignal {
  cardName: string;
  position: SpreadPosition;
  orientation: Orientation;
  contribution: number;
  text: string;
}

export type ReviewFeedback = "pending" | "happened" | "not-happened" | "unclear";

export interface ReadingReview {
  tags: string[];
  feedback: ReviewFeedback;
  note: string;
  updatedAt: string;
}

export interface TarotCard {
  id: string;
  arcana: Arcana;
  suit?: TarotSuit;
  name: string;
  keywords: string[];
  upright: string;
  reversed: string;
  relationshipMeaning: string;
  careerMeaning: string;
  risk: string;
  advice: string;
}

export interface DrawnCard extends TarotCard {
  card: TarotCard;
  orientation: Orientation;
  position: SpreadPosition;
}

export interface ActionAdvice {
  nextAction: string;
  avoid: string;
  sevenDayObservation: string;
}

export type VerdictAnswer = "supportive" | "blocked" | "unknown";

export type VerdictConfidence = "high" | "medium" | "low" | "none";

export interface VerdictScoreFactor {
  cardId: string;
  cardName: string;
  position: SpreadPosition;
  orientation: Orientation;
  positionWeight: number;
  orientationScore: number;
  arcanaBias: number;
  suitBias: number;
  contribution: number;
}

export interface ReadingVerdict {
  answer: VerdictAnswer;
  confidence: VerdictConfidence;
  why: string;
  whatToDo: string[];
  score: number;
  scoreBreakdown: VerdictScoreFactor[];
  supportSignals: VerdictSignal[];
  resistanceSignals: VerdictSignal[];
  changeCondition: string;
}

export interface GeneratedReading {
  id: string;
  createdAt: string;
  theme: ReadingTheme;
  question: string;
  cards: DrawnCard[];
  intent?: QuestionIntent;
  summary?: string;
  actions?: ActionAdvice;
}

export interface CardInterpretation {
  position: SpreadPosition;
  cardName: string;
  orientation: Orientation;
  title: string;
  meaning: string;
  risk: string;
  advice: string;
}

export interface ReadingInterpretation {
  intent: QuestionIntent;
  verdict: ReadingVerdict;
  summary: string;
  cardSections: CardInterpretation[];
  combination: string;
  riskNotes: string[];
  actions: ActionAdvice;
  disclaimer: string;
}

export interface SavedReading extends GeneratedReading {
  verdict?: ReadingVerdict;
  summary: string;
  actions: ActionAdvice;
  review?: ReadingReview;
  savedAt: string;
}
