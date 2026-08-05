import type {
  ApiErrorBody,
  DreamHistoryEntry,
  DreamInterpretRequest,
  ProviderStatus,
  UsageStats
} from "../shared/types";

export async function fetchProviders() {
  return request<{ providers: ProviderStatus[]; configured?: boolean; hubUrl?: string }>("/api/providers");
}

export async function fetchHistory() {
  return request<{ entries: DreamHistoryEntry[] }>("/api/history");
}

export async function fetchStats() {
  return request<{ stats: UsageStats }>("/api/stats");
}

export async function interpretDream(input: DreamInterpretRequest) {
  return request<{ entry: DreamHistoryEntry }>("/api/interpret", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiPath(url), init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const errorBody = data as ApiErrorBody | undefined;
    throw new Error(errorBody?.error.message || "请求失败。");
  }

  return data as T;
}

function apiPath(path: string) {
  const normalizedPath = path.replace(/^\/+/, "");
  const baseUrl = import.meta.env.BASE_URL || "/";
  return new URL(normalizedPath, `${window.location.origin}${baseUrl}`).pathname;
}
