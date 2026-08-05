export const providers = ["openai"] as const;

export type Provider = (typeof providers)[number];

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type OutputLanguage = "zh-CN" | "en";

export type QualityWarningCode = "MISSING_OBLIGATIONS" | "MISSING_RISKS" | "WEAK_DISCLAIMER" | "MISSING_EVIDENCE";

export interface QualityWarning {
  code: QualityWarningCode;
  message: string;
}

export interface AnalyzeClauseRequest {
  provider: Provider;
  model: string;
  clauseText: string;
  userRole: string;
  contractType?: string;
  jurisdiction?: string;
  outputLanguage: OutputLanguage;
}

export interface ObligationItem {
  title: string;
  plainMeaning: string;
  trigger?: string;
  consequence?: string;
  evidenceText?: string;
}

export interface RightItem {
  title: string;
  plainMeaning: string;
  condition?: string;
  impactOnUser?: string;
  evidenceText?: string;
}

export interface RiskItem {
  title: string;
  level: RiskLevel;
  riskType?: string;
  whyItMatters: string;
  originalSignal?: string;
  consequence?: string;
  mitigation?: string;
  reviewQuestion?: string;
  evidenceText?: string;
}

export interface ClauseAnalysisResult {
  plainLanguage: string;
  userObligations: ObligationItem[];
  counterpartyRights: RightItem[];
  risks: RiskItem[];
  ambiguousTerms: string[];
  lawyerQuestions: string[];
  negotiationSuggestions: string[];
  confidence: RiskLevel;
  disclaimer: string;
  qualityWarnings?: QualityWarning[];
}

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}
