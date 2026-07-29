import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import type {
  DreamHistoryEntry,
  DreamInterpretRequest,
  DreamInterpretResult,
  Provider,
  UsageStats
} from "../shared/types";

const dataDir = path.resolve(process.cwd(), "data");
const historyPath = path.join(dataDir, "history.json");
const usageLogPath = path.join(dataDir, "usage.jsonl");
const errorLogPath = path.join(dataDir, "errors.jsonl");

export async function saveHistoryEntry(
  request: DreamInterpretRequest,
  result: DreamInterpretResult,
  meta: DreamHistoryEntry["meta"]
) {
  const entries = await listHistoryEntries();
  const entry: DreamHistoryEntry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    request,
    result,
    meta
  };

  const nextEntries = [entry, ...entries].slice(0, 200);
  await ensureDataDir();
  await writeFile(historyPath, JSON.stringify(nextEntries, null, 2), "utf8");
  return entry;
}

export async function listHistoryEntries() {
  await ensureDataDir();
  try {
    const text = await readFile(historyPath, "utf8");
    const value = JSON.parse(text);
    return Array.isArray(value) ? (value as DreamHistoryEntry[]) : [];
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function getUsageStats(): Promise<UsageStats> {
  const entries = await listHistoryEntries();
  const providerCounts = {
    openai: 0
  } satisfies Record<Provider, number>;

  for (const entry of entries) {
    if (entry.meta.provider === "openai") providerCounts.openai += 1;
  }

  return {
    totalInterpretations: entries.length,
    providerCounts
  };
}

export async function logUsage(event: {
  provider: Provider;
  latencyMs: number;
  success: boolean;
}) {
  await appendJsonLine(usageLogPath, {
    at: new Date().toISOString(),
    ...event
  });
}

export async function logError(event: { provider?: Provider; code?: string; error: unknown }) {
  await appendJsonLine(errorLogPath, {
    at: new Date().toISOString(),
    provider: event.provider,
    code: event.code,
    error: event.error
  });
}

async function appendJsonLine(filePath: string, value: unknown) {
  await ensureDataDir();
  await appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}
