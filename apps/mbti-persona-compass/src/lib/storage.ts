import type { AnswerMap, AnswerValue } from "../types";

const STORAGE_KEY = "persona-compass.answers.v1";

const validValues: AnswerValue[] = [-2, -1, 0, 1, 2];

export function loadAnswers(): AnswerMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([key, value]) => Number.isInteger(Number(key)) && validValues.includes(value as AnswerValue))
        .map(([key, value]) => [Number(key), value as AnswerValue]),
    );
  } catch {
    return {};
  }
}

export function saveAnswers(answers: AnswerMap): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
}

export function clearAnswers(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
