export const providers = ["openai"] as const;
export type Provider = (typeof providers)[number];

export const interpretationStyles = ["balanced", "traditional", "psychological"] as const;
export type InterpretationStyle = (typeof interpretationStyles)[number];

export interface DreamSymbol {
  name: string;
  meaning: string;
}

export interface RagCitation {
  id: string;
  category: string;
  original: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceLicense: string;
  score?: number;
}

export interface DreamInterpretRequest {
  dreamText: string;
  mood?: string;
  tags?: string[];
  style: InterpretationStyle;
  provider: Provider;
  model: string;
}

export interface DreamInterpretResult {
  summary: string;
  symbols: DreamSymbol[];
  traditionalReading: string;
  psychologicalReading: string;
  realityInsight: string;
  advice: string;
  luckyKeywords: string[];
  ragCitations: RagCitation[];
  disclaimer: string;
}

export interface DreamHistoryEntry {
  id: string;
  createdAt: string;
  request: DreamInterpretRequest;
  result: DreamInterpretResult;
  meta: {
    provider: Provider;
    model: string;
    mode: "model";
    ragHitCount: number;
    latencyMs: number;
  };
}

export interface ProviderStatus {
  provider: Provider;
  label: string;
  defaultModel: string;
  models: string[];
  enabledModels: string[];
  enabled: boolean;
  configured: boolean;
}

export interface UsageStats {
  totalInterpretations: number;
  providerCounts: Record<Provider, number>;
}

export function isGptModel(value: unknown): value is string {
  return typeof value === "string" && /^gpt-/i.test(value.trim());
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
