import {
  dimensions,
  type DimensionId,
  type DimensionVector,
  type PersonalityType,
  type TestMode
} from "../data/personality-test.ts";

export const RESULT_ARCHIVE_STORAGE_KEY = "qingqing-grassland-result-archive";
export const RESULT_ARCHIVE_LIMIT = 8;

export type ArchiveStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type ArchivedResult = {
  id: string;
  personalityId: string;
  personalityName: string;
  keywords: string[];
  modeId: TestMode["id"];
  modeName: string;
  modeBadge: string;
  answeredCount: number;
  finishedAt: string;
  scores: DimensionVector;
};

export type ArchiveInput = {
  personality: PersonalityType;
  mode: TestMode;
  answeredCount: number;
  scores: DimensionVector;
};

export type ArchiveDelta = {
  personalityChanged: boolean;
  previousPersonalityName: string;
  dimensionDeltas: DimensionVector;
};

export function createArchivedResult(input: ArchiveInput, now = new Date()): ArchivedResult {
  return {
    id: `archive-${now.getTime()}-${input.personality.id}`,
    personalityId: input.personality.id,
    personalityName: input.personality.name,
    keywords: [...input.personality.keywords],
    modeId: input.mode.id,
    modeName: input.mode.name,
    modeBadge: input.mode.badge,
    answeredCount: input.answeredCount,
    finishedAt: now.toISOString(),
    scores: cloneVector(input.scores)
  };
}

export function addArchivedResult(
  entries: ArchivedResult[],
  entry: ArchivedResult,
  limit = RESULT_ARCHIVE_LIMIT
): ArchivedResult[] {
  return [
    entry,
    ...entries.filter((item) => item.id !== entry.id)
  ].slice(0, Math.max(0, limit));
}

export function parseArchive(raw: string | null): ArchivedResult[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isArchivedResult).map((entry) => ({
      ...entry,
      keywords: [...entry.keywords],
      scores: cloneVector(entry.scores)
    }));
  } catch {
    return [];
  }
}

export function serializeArchive(entries: ArchivedResult[]): string {
  return JSON.stringify(entries);
}

export function readArchive(storage: ArchiveStorage): ArchivedResult[] {
  return parseArchive(storage.getItem(RESULT_ARCHIVE_STORAGE_KEY));
}

export function writeArchive(storage: ArchiveStorage, entries: ArchivedResult[]): void {
  storage.setItem(RESULT_ARCHIVE_STORAGE_KEY, serializeArchive(entries));
}

export function clearArchiveStorage(storage: ArchiveStorage): void {
  storage.removeItem(RESULT_ARCHIVE_STORAGE_KEY);
}

export function getArchiveDelta(
  current: ArchivedResult,
  previous?: ArchivedResult
): ArchiveDelta | null {
  if (!previous) {
    return null;
  }

  const dimensionDeltas = dimensions.reduce((collection, dimension) => {
    collection[dimension.id] = current.scores[dimension.id] - previous.scores[dimension.id];
    return collection;
  }, createEmptyVector());

  return {
    personalityChanged: current.personalityId !== previous.personalityId,
    previousPersonalityName: previous.personalityName,
    dimensionDeltas
  };
}

function isArchivedResult(value: unknown): value is ArchivedResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<ArchivedResult>;

  return (
    typeof entry.id === "string" &&
    typeof entry.personalityId === "string" &&
    typeof entry.personalityName === "string" &&
    Array.isArray(entry.keywords) &&
    entry.keywords.every((keyword) => typeof keyword === "string") &&
    (entry.modeId === "professional" || entry.modeId === "experience") &&
    typeof entry.modeName === "string" &&
    typeof entry.modeBadge === "string" &&
    typeof entry.answeredCount === "number" &&
    typeof entry.finishedAt === "string" &&
    isDimensionVector(entry.scores)
  );
}

function isDimensionVector(value: unknown): value is DimensionVector {
  if (!value || typeof value !== "object") {
    return false;
  }

  const vector = value as Partial<Record<DimensionId, unknown>>;

  return dimensions.every((dimension) => typeof vector[dimension.id] === "number");
}

function cloneVector(vector: DimensionVector): DimensionVector {
  return dimensions.reduce((collection, dimension) => {
    collection[dimension.id] = vector[dimension.id];
    return collection;
  }, createEmptyVector());
}

function createEmptyVector(): DimensionVector {
  return {
    SE: 0,
    AC: 0,
    RB: 0,
    RV: 0,
    EE: 0
  };
}
