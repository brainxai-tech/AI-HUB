import { analyzeResponseSchema, apiErrorSchema, type AnalyzeRequest, type AnalyzeResponse } from "../shared/schema";

const basePath = normalizeBasePath(import.meta.env.BASE_URL || "/");

export async function analyzeAesthetic(input: AnalyzeRequest): Promise<AnalyzeResponse> {
  const response = await fetch(apiPath("/api/analyze"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    throw new Error(parsed.success ? parsed.data.error.message : "分析请求失败。");
  }

  const parsed = analyzeResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("服务端返回结构不符合约定。");
  }
  return parsed.data;
}

export type ProviderHealth = {
  provider: string;
  label: string;
  configured: boolean;
  model: string;
};

export async function fetchProviderHealth(): Promise<ProviderHealth[]> {
  const response = await fetch(apiPath("/api/providers"), { cache: "no-store" });
  if (!response.ok) return [];
  const payload = await response.json();
  return Array.isArray(payload?.providers) ? payload.providers : [];
}

function apiPath(path: string) {
  return `${basePath}${path}`.replace(/\/{2,}/g, "/");
}

function normalizeBasePath(value: string) {
  if (!value || value === "/") return "";
  return `/${value.replace(/^\/+|\/+$/g, "")}`;
}
