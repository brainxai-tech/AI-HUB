import type {
  ActionAdvice,
  DrawnCard,
  QuestionIntent,
  QuestionIntentId,
  ReadingReview,
  ReadingTheme,
  ReviewFeedback,
  SavedReading,
  TarotCard,
} from "./types.ts";

const questionIntentIds = new Set<QuestionIntentId>([
  "relationship-reunion",
  "relationship-progress",
  "relationship-boundary",
  "relationship-communication",
  "relationship-timing",
  "career-opportunity",
  "career-money",
  "career-execution",
  "career-conflict",
  "career-timing",
  "general-judgment",
]);

export const HISTORY_STORAGE_KEY = "ai-tarot-sanctum:readings:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isTheme(value: unknown): value is ReadingTheme {
  return value === "relationship" || value === "career";
}

function isOrientation(value: unknown): value is DrawnCard["orientation"] {
  return value === "upright" || value === "reversed";
}

function isPosition(value: unknown): value is DrawnCard["position"] {
  return value === "root" || value === "present" || value === "trend";
}

function isReviewFeedback(value: unknown): value is ReviewFeedback {
  return value === "pending" || value === "happened" || value === "not-happened" || value === "unclear";
}

function isQuestionIntent(value: unknown): value is QuestionIntent {
  if (!isRecord(value)) {
    return false;
  }

  return (
    questionIntentIds.has(value.id as QuestionIntentId) &&
    isString(value.label) &&
    isString(value.judgmentPath) &&
    Array.isArray(value.matchedKeywords) &&
    value.matchedKeywords.every(isString)
  );
}

function isReadingReview(value: unknown): value is ReadingReview {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.tags) &&
    value.tags.every(isString) &&
    isReviewFeedback(value.feedback) &&
    typeof value.note === "string" &&
    isString(value.updatedAt)
  );
}

function isTarotCard(value: unknown): value is TarotCard {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    (value.arcana === "major" || value.arcana === "minor") &&
    (value.suit === undefined || value.suit === "wands" || value.suit === "cups" || value.suit === "swords" || value.suit === "pentacles") &&
    isString(value.name) &&
    Array.isArray(value.keywords) &&
    value.keywords.every(isString) &&
    isString(value.upright) &&
    isString(value.reversed) &&
    isString(value.relationshipMeaning) &&
    isString(value.careerMeaning) &&
    isString(value.risk) &&
    isString(value.advice)
  );
}

function isDrawnCard(value: unknown): value is DrawnCard {
  if (!isRecord(value)) {
    return false;
  }

  return isTarotCard(value.card) && isString(value.name) && isOrientation(value.orientation) && isPosition(value.position);
}

function isActionAdvice(value: unknown): value is ActionAdvice {
  if (!isRecord(value)) {
    return false;
  }

  return isString(value.nextAction) && isString(value.avoid) && isString(value.sevenDayObservation);
}

export function isSavedReading(value: unknown): value is SavedReading {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.createdAt) &&
    isTheme(value.theme) &&
    typeof value.question === "string" &&
    Array.isArray(value.cards) &&
    value.cards.length === 3 &&
    value.cards.every(isDrawnCard) &&
    (value.intent === undefined || isQuestionIntent(value.intent)) &&
    isString(value.summary) &&
    isActionAdvice(value.actions) &&
    (value.review === undefined || isReadingReview(value.review)) &&
    isString(value.savedAt)
  );
}

export function parseSavedReadings(raw: string | null | undefined): SavedReading[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(toSavedReading)
      .filter((reading): reading is SavedReading => reading !== null);
  } catch {
    return [];
  }
}

export function serializeSavedReadings(readings: unknown[]): string {
  return JSON.stringify(readings.filter(isSavedReading));
}

export function readHistory(storage: Pick<Storage, "getItem"> = localStorage): SavedReading[] {
  try {
    return parseSavedReadings(storage.getItem(HISTORY_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function writeHistory(readings: unknown[], storage: Pick<Storage, "setItem"> = localStorage): boolean {
  try {
    storage.setItem(HISTORY_STORAGE_KEY, serializeSavedReadings(readings));
    return true;
  } catch {
    return false;
  }
}

export function loadReadingHistory(storage?: Pick<Storage, "getItem">): unknown[] {
  if (storage) {
    return readHistory(storage);
  }

  if (typeof localStorage === "undefined") {
    return [];
  }

  return readHistory(localStorage);
}

function actionAdviceFromRecord(value: Record<string, unknown>): ActionAdvice | null {
  if (isActionAdvice(value.actions)) {
    return value.actions;
  }

  const actionList = Array.isArray(value.actionAdvice)
    ? value.actionAdvice
    : Array.isArray(value.actions)
      ? value.actions
      : [];

  if (actionList.length >= 3 && actionList.slice(0, 3).every(isString)) {
    return {
      nextAction: actionList[0],
      avoid: actionList[1],
      sevenDayObservation: actionList[2],
    };
  }

  return null;
}

function toSavedReading(value: unknown): SavedReading | null {
  if (isSavedReading(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  const summary = isString(value.summary) ? value.summary : isString(value.combined) ? value.combined : null;
  const actions = actionAdviceFromRecord(value);
  const candidate = {
    ...value,
    summary,
    actions,
    savedAt: isString(value.savedAt) ? value.savedAt : new Date().toISOString(),
  };

  return isSavedReading(candidate) ? candidate : null;
}

export function saveReadingToHistory(
  reading: unknown,
  storage?: Pick<Storage, "getItem" | "setItem">,
): unknown[] {
  const candidate = toSavedReading(reading);
  const current = storage ? readHistory(storage) : parseSavedReadings(JSON.stringify(loadReadingHistory()));
  const next = candidate ? [candidate, ...current.filter((item) => item.id !== candidate.id)] : current;

  if (storage) {
    writeHistory(next, storage);
  } else if (typeof localStorage !== "undefined") {
    writeHistory(next, localStorage);
  }

  return next;
}

export function clearReadingHistory(storage?: Pick<Storage, "setItem">): unknown[] {
  if (storage) {
    storage.setItem(HISTORY_STORAGE_KEY, "[]");
  } else if (typeof localStorage !== "undefined") {
    localStorage.setItem(HISTORY_STORAGE_KEY, "[]");
  }

  return [];
}
