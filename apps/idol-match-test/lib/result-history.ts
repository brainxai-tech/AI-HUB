import type { MatchResult } from "./types";

export type MatchHistoryRecord = {
  id: string;
  mode: string;
  modeName: string;
  idolId: string;
  idolName: string;
  score: number;
  confidence: number;
  tags: string[];
  savedAt: string;
  favorite: boolean;
};

export type BuildMatchRecordInput = {
  mode: string;
  modeName: string;
  answerSignature: string;
  match: MatchResult;
  savedAt?: string;
};

export const createMatchRecordId = (mode: string, answerSignature: string) =>
  `${mode}:${answerSignature}`;

export const buildMatchRecord = ({
  mode,
  modeName,
  answerSignature,
  match,
  savedAt = new Date().toISOString()
}: BuildMatchRecordInput): MatchHistoryRecord => ({
  id: createMatchRecordId(mode, answerSignature),
  mode,
  modeName,
  idolId: match.idol.id,
  idolName: match.idol.name,
  score: match.score,
  confidence: match.confidence,
  tags: match.matchedTags.slice(0, 4),
  savedAt,
  favorite: false
});

const isMatchHistoryRecord = (value: unknown): value is MatchHistoryRecord => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<MatchHistoryRecord>;

  return (
    typeof record.id === "string" &&
    typeof record.mode === "string" &&
    typeof record.modeName === "string" &&
    typeof record.idolId === "string" &&
    typeof record.idolName === "string" &&
    typeof record.score === "number" &&
    typeof record.confidence === "number" &&
    Array.isArray(record.tags) &&
    record.tags.every((tag) => typeof tag === "string") &&
    typeof record.savedAt === "string" &&
    typeof record.favorite === "boolean"
  );
};

export const parseMatchHistory = (raw: string | null): MatchHistoryRecord[] => {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isMatchHistoryRecord) : [];
  } catch {
    return [];
  }
};

export const upsertMatchHistory = (
  records: MatchHistoryRecord[],
  nextRecord: MatchHistoryRecord,
  limit = 12
) => {
  const existing = records.find((record) => record.id === nextRecord.id);
  const mergedRecord = {
    ...nextRecord,
    favorite: existing?.favorite ?? nextRecord.favorite
  };

  return [mergedRecord, ...records.filter((record) => record.id !== nextRecord.id)].slice(0, limit);
};

export const toggleFavoriteRecord = (records: MatchHistoryRecord[], recordId: string) =>
  records.map((record) =>
    record.id === recordId ? { ...record, favorite: !record.favorite } : record
  );
