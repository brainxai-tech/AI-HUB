import type { GenerateRequest, LifeRepoPlan } from "../src/shared/contracts.js";
import { buildDemoPlan } from "./demo.js";
import { callHubChat, resolveHubModel } from "./hubModels.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";

export class ProviderError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export async function generateLifePlan(request: GenerateRequest): Promise<LifeRepoPlan> {
  const model = await resolveHubModel(request.provider, request.model);
  const effectiveRequest = { ...request, model };
  const system = buildSystemPrompt();
  const user = buildUserPrompt(effectiveRequest);
  const text = await callHubChat({
    provider: effectiveRequest.provider,
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  });
  const parsed = parseJsonObject(text);
  return normalizePlan(parsed, effectiveRequest);
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new ProviderError(502, "INVALID_JSON", "模型返回不是 JSON。", text.slice(0, 800));
    try {
      return JSON.parse(match[0]);
    } catch (error) {
      throw new ProviderError(502, "INVALID_JSON", "模型返回 JSON 解析失败。", { error, text: text.slice(0, 1200) });
    }
  }
}

function normalizePlan(value: unknown, request: GenerateRequest): LifeRepoPlan {
  if (!value || typeof value !== "object") {
    throw new ProviderError(502, "INVALID_PLAN", "模型输出结构不正确。", value);
  }
  const plan = value as LifeRepoPlan;
  if (!Array.isArray(plan.branches) || !Array.isArray(plan.conflicts) || !plan.nextCommit) {
    throw new ProviderError(502, "INVALID_PLAN", "模型输出缺少 branches、conflicts 或 nextCommit。", value);
  }

  return {
    ...buildDemoPlan(request),
    ...plan,
    repoName: stringOr(plan.repoName, request.input.repoName || "life/main"),
    head: stringOr(plan.head, "main"),
    branches: plan.branches,
    conflicts: plan.conflicts,
    diff: Array.isArray(plan.diff) ? plan.diff : [],
    commits: Array.isArray(plan.commits) ? plan.commits : [],
    terminalLog: Array.isArray(plan.terminalLog) ? plan.terminalLog : [],
    safetyNote: stringOr(plan.safetyNote, "这是决策辅助和复盘工具，不替代专业建议。")
  };
}

function stringOr(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}
