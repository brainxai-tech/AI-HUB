import type { ApiError, ApiResponse, GeneratePoemsRequest, GeneratePoemsResult } from "./shared/contracts";

export async function requestPoems(request: GeneratePoemsRequest): Promise<ApiResponse<GeneratePoemsResult>> {
  const base = import.meta.env.BASE_URL.replace(/\/$/u, "");
  const response = await fetch(`${base}/api/poems/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });
  const body = await response.json() as ApiResponse<GeneratePoemsResult> | ApiError;
  if (!response.ok || "error" in body) {
    throw new Error("error" in body ? body.error.message : `生成失败：HTTP ${response.status}`);
  }
  return body;
}
