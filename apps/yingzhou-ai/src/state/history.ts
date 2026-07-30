export interface PoemHistory {
  entries: string[][];
  index: number;
}

export function createHistory(lines: string[]): PoemHistory {
  return { entries: [[...lines]], index: 0 };
}

export function currentVersion(history: PoemHistory) {
  return [...history.entries[history.index]];
}

export function pushVersion(history: PoemHistory, lines: string[]): PoemHistory {
  const current = history.entries[history.index];
  if (sameLines(current, lines)) return history;
  const entries = history.entries.slice(0, history.index + 1).map((entry) => [...entry]);
  entries.push([...lines]);
  return { entries, index: entries.length - 1 };
}

export function undoVersion(history: PoemHistory): PoemHistory {
  return history.index > 0 ? { ...history, index: history.index - 1 } : history;
}

export function redoVersion(history: PoemHistory): PoemHistory {
  return history.index < history.entries.length - 1 ? { ...history, index: history.index + 1 } : history;
}

function sameLines(left: string[], right: string[]) {
  return left.length === right.length && left.every((line, index) => line === right[index]);
}
