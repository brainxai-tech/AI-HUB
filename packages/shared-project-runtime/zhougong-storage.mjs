import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDir = process.env.ZHOUGONG_DATA_DIR || path.resolve(".local-runtime/zhougong-data");
const historyPath = path.join(dataDir, "history.json");
const usageLogPath = path.join(dataDir, "usage.jsonl");
const errorLogPath = path.join(dataDir, "errors.jsonl");

export async function saveHistoryEntry(request, result, meta) {
  const entries = await listHistoryEntries();
  const entry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    request,
    result,
    meta,
  };
  await ensureDataDir();
  await writeFile(historyPath, JSON.stringify([entry, ...entries].slice(0, 200), null, 2), "utf8");
  return entry;
}

export async function listHistoryEntries() {
  await ensureDataDir();
  try {
    const value = JSON.parse(await readFile(historyPath, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return [];
    throw error;
  }
}

export async function getUsageStats() {
  const entries = await listHistoryEntries();
  const providerCounts = { openai: 0, deepseek: 0, anthropic: 0, gemini: 0 };
  for (const entry of entries) {
    if (entry?.meta?.provider in providerCounts) providerCounts[entry.meta.provider] += 1;
  }
  return {
    totalInterpretations: entries.length,
    previewInterpretations: entries.filter((entry) => entry?.meta?.usedPreview).length,
    providerCounts,
  };
}

export async function logUsage(event) {
  await appendJsonLine(usageLogPath, { at: new Date().toISOString(), ...event });
}

export async function logError(event) {
  await appendJsonLine(errorLogPath, { at: new Date().toISOString(), ...event });
}

async function appendJsonLine(filePath, value) {
  await ensureDataDir();
  await appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}
