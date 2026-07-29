export type Provider = "openai";

export const providerLabels: Record<Provider, string> = {
  openai: "GPT · AI Routing"
};

export const defaultModels: Record<Provider, string> = {
  openai: "gpt-5.4"
};

export const modelSuggestions: Record<Provider, string[]> = {
  openai: ["gpt-5.4"]
};

export type BranchStatus = "current" | "active" | "abandoned" | "merged";
export type ConflictStatus = "open" | "current" | "incoming" | "manual";

export interface LifeRepoInput {
  repoName: string;
  currentState: string;
  decision: string;
  values: string;
  constraints: string;
  resources: string;
  timeHorizon: string;
}

export interface BranchPlan {
  id: string;
  name: string;
  status: BranchStatus;
  description: string;
  hypothesis: string;
  tradeoffs: string[];
  risks: string[];
  signals: string[];
  rollbackPoint: string;
  nextCommit: string;
}

export interface DiffItem {
  dimension: string;
  current: string;
  incoming: string;
  impact: "low" | "medium" | "high";
}

export interface ConflictPlan {
  id: string;
  title: string;
  branches: string[];
  dimensions: string[];
  severity: "low" | "medium" | "high";
  resolutionStatus: ConflictStatus;
  recommendation: string;
}

export interface CommitPlan {
  id: string;
  branchId: string;
  message: string;
  type: "decision" | "action" | "reflection" | "rollback";
  why: string;
  evidence: string[];
  nextAction: string;
  createdAt: string;
}

export interface TerminalLine {
  command: string;
  output: string;
}

export interface LifeRepoPlan {
  repoName: string;
  head: string;
  statusSummary: string;
  branches: BranchPlan[];
  diff: DiffItem[];
  conflicts: ConflictPlan[];
  commits: CommitPlan[];
  nextCommit: CommitPlan;
  terminalLog: TerminalLine[];
  safetyNote: string;
}

export interface GenerateRequest {
  provider: Provider;
  model: string;
  input: LifeRepoInput;
}

export interface GenerateResponse {
  data: LifeRepoPlan;
  meta: {
    provider: Provider;
    model: string;
    mode: "model";
    generatedAt: string;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}`;
}

export function isProvider(value: unknown): value is Provider {
  return value === "openai";
}

export function isGptModel(value: unknown): value is string {
  return typeof value === "string" && /^gpt-/i.test(value.trim());
}
