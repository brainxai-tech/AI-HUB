import { z } from "zod";

export const providerLabels = {
  openai: "GPT · AI Routing"
} as const;

export const providerSchema = z.enum(["openai"]);
export const realProviderSchema = providerSchema;

export const defaultModels = {
  openai: "gpt-5.4"
} as const;

export const modelSuggestions = {
  openai: ["gpt-5.4"]
} as const;

export const channelSchema = z.enum(["message", "email", "social", "work"]);
export const toneGoalSchema = z.enum(["balanced", "softer", "clearer", "professional", "warmer"]);
export const riskLevelSchema = z.enum(["LOW", "MEDIUM", "MEDIUM_HIGH", "HIGH"]);
export const riskTypeSchema = z.enum(["tone", "context", "ambiguity", "relationship", "emotion", "urgency"]);
export const personaSchema = z.enum(["friend", "boss", "stranger", "sensitive"]);

export const channelLabels = {
  message: "消息",
  email: "邮件",
  social: "朋友圈",
  work: "职场通知"
} as const;

export const toneGoalLabels = {
  balanced: "均衡",
  softer: "更温和",
  clearer: "更清楚",
  professional: "更专业",
  warmer: "更亲近"
} as const;

export const personaLabels = {
  friend: "朋友",
  boss: "老板",
  stranger: "陌生人",
  sensitive: "敏感的人"
} as const;

export const riskLevelLabels = {
  LOW: "低风险",
  MEDIUM: "有歧义",
  MEDIUM_HIGH: "容易误解",
  HIGH: "高误解风险"
} as const;

export const misunderstandingInputSchema = z.object({
  text: z.string().min(2, "请输入至少 2 个字。").max(4000, "文本最大 4000 字。"),
  channel: channelSchema,
  intent: z.string().max(800).optional().default(""),
  toneGoal: toneGoalSchema
});

export const analyzeRequestSchema = z.object({
  provider: providerSchema,
  model: z.string().trim().regex(/^gpt-/i, "本项目只允许调用 gpt-* 型号。"),
  input: misunderstandingInputSchema
});

export const riskFactorSchema = z.object({
  type: riskTypeSchema,
  label: z.string().min(1),
  evidence: z.string().min(1),
  advice: z.string().min(1)
});

export const audienceMisreadSchema = z.object({
  persona: personaSchema,
  label: z.string().min(1),
  possibleMisread: z.string().min(1),
  riskScore: z.number().int().min(0).max(100),
  triggerWords: z.array(z.string().min(1)).max(8),
  saferSignal: z.string().min(1)
});

export const rewritesSchema = z.object({
  clear: z.string().min(1),
  soft: z.string().min(1),
  professional: z.string().min(1)
});

export const analysisReportSchema = z.object({
  original: z.string().min(1),
  overallRisk: z.number().int().min(0).max(100),
  riskLevel: riskLevelSchema,
  summary: z.string().min(1),
  topRisks: z.array(riskFactorSchema).min(2).max(6),
  audiences: z.array(audienceMisreadSchema).length(4),
  rewrites: rewritesSchema,
  quickFixes: z.array(z.string().min(1)).min(3).max(5),
  disclaimer: z.string().min(1)
});

export type Provider = z.infer<typeof providerSchema>;
export type RealProvider = z.infer<typeof realProviderSchema>;
export type Channel = z.infer<typeof channelSchema>;
export type ToneGoal = z.infer<typeof toneGoalSchema>;
export type RiskLevel = z.infer<typeof riskLevelSchema>;
export type Persona = z.infer<typeof personaSchema>;
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
export type AnalysisReport = z.infer<typeof analysisReportSchema>;

export type ProviderCatalogItem = {
  id: RealProvider;
  name: string;
  defaultModel: string;
  models: string[];
  enabledModels: string[];
  enabled: boolean;
  configured: boolean;
};

export type AnalyzeResponse = {
  data: AnalysisReport;
  meta: {
    provider: Provider;
    model: string;
    mode: "model";
    generatedAt: string;
  };
};

export function isGptModel(value: unknown): value is string {
  return typeof value === "string" && /^gpt-/i.test(value.trim());
}

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
