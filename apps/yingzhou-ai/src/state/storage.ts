import type { SavedWork } from "../shared/contracts";

const STORAGE_KEY = "yingzhou.saved-works.v1";

export function loadSavedWorks(): SavedWork[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedWork).slice(0, 30);
  } catch {
    return [];
  }
}

export function upsertSavedWork(work: SavedWork) {
  const next = [work, ...loadSavedWorks().filter((item) => item.id !== work.id)].slice(0, 30);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function removeSavedWork(id: string) {
  const next = loadSavedWorks().filter((item) => item.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function isSavedWork(value: unknown): value is SavedWork {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SavedWork>;
  return typeof item.id === "string"
    && typeof item.title === "string"
    && Array.isArray(item.lines)
    && item.lines.length === 4
    && item.lines.every((line) => typeof line === "string")
    && Boolean(item.input && typeof item.input === "object");
}
