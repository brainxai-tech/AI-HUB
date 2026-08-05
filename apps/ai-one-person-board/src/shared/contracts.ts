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

export const boardRoleSchema = z.enum(["ceo", "cfo", "user", "engineer", "designer"]);
export const voteSchema = z.enum(["GO", "PIVOT", "VALIDATE", "KILL"]);
export const recommendationSchema = z.enum(["GO", "PIVOT", "VALIDATE", "KILL"]);

export const roleLabels = {
  ceo: "CEO",
  cfo: "CFO",
  user: "用户",
  engineer: "工程师",
  designer: "设计师"
} as const;

export const voteLabels = {
  GO: "继续做",
  PIVOT: "调整后做",
  VALIDATE: "先验证",
  KILL: "不建议做"
} as const;

export const ideaInputSchema = z.object({
  idea: z.string().min(6, "请至少输入一句项目想法。").max(4000),
  targetUser: z.string().max(800).optional().default(""),
  problem: z.string().max(1000).optional().default(""),
  businessModel: z.string().max(1000).optional().default(""),
  constraints: z.string().max(1000).optional().default("")
});

export const directorFindingSchema = z.object({
  role: boardRoleSchema,
  stance: z.string().min(1),
  questions: z.array(z.string().min(1)).min(3).max(3),
  strongestRisk: z.string().min(1),
  suggestedExperiment: z.string().min(1),
  vote: voteSchema,
  rationale: z.string().min(1)
});

export const boardReportSchema = z.object({
  ideaSummary: z.object({
    title: z.string().min(1),
    targetUser: z.string().min(1),
    problem: z.string().min(1),
    solution: z.string().min(1),
    riskiestAssumption: z.string().min(1),
    aiValue: z.string().min(1)
  }),
  directors: z.array(directorFindingSchema).length(5),
  voteTally: z.object({
    GO: z.number().int().min(0).max(5),
    PIVOT: z.number().int().min(0).max(5),
    VALIDATE: z.number().int().min(0).max(5),
    KILL: z.number().int().min(0).max(5)
  }),
  finalDecision: z.object({
    recommendation: recommendationSchema,
    confidence: z.number().int().min(0).max(100),
    summary: z.string().min(1),
    reason: z.string().min(1),
    sevenDayPlan: z.array(z.string().min(1)).min(5).max(7),
    killCriteria: z.array(z.string().min(1)).min(2).max(4),
    nextQuestion: z.string().min(1)
  })
});

export const generateRequestSchema = z.object({
  provider: providerSchema,
  model: z.string().trim().regex(/^gpt-/i, "本项目只允许调用 gpt-* 型号。"),
  input: ideaInputSchema
});

export type Provider = z.infer<typeof providerSchema>;
export type RealProvider = z.infer<typeof realProviderSchema>;
export type BoardRole = z.infer<typeof boardRoleSchema>;
export type Vote = z.infer<typeof voteSchema>;
export type BoardReport = z.infer<typeof boardReportSchema>;
export type GenerateRequest = z.infer<typeof generateRequestSchema>;

export type GenerateResponse = {
  data: BoardReport;
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
