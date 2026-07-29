import { z } from "zod";

export const providerLabels = {
  openai: "GPT · AI Routing",
  demo: "本地预览"
} as const;

export const providerSchema = z.enum(["openai", "demo"]);
export const realProviderSchema = z.enum(["openai"]);
export const toneSchema = z.enum(["rational", "gentle", "sharp"]);
export const depthSchema = z.enum(["light", "standard", "deep"]);

export const defaultModels = {
  openai: "gpt-5.4",
  demo: "local-preview"
} as const;

export const modelSuggestions = {
  openai: ["gpt-5.4"],
  demo: ["local-preview"]
} as const;

export const timelineNodeSchema = z.object({
  period: z.string().min(1),
  label: z.string().min(1),
  content: z.string().min(1)
});

export const riskRewardSchema = z.object({
  rewardScore: z.number().int().min(1).max(5),
  riskScore: z.number().int().min(1).max(5),
  uncertainty: z.enum(["low", "medium", "high"]),
  emotion: z.string().min(1)
});

export const branchSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  branchType: z.enum(["upside", "cost", "opportunity"]),
  timeline: z.array(timelineNodeSchema).min(3).max(3),
  shortTermResult: z.string().min(1),
  longTermCost: z.string().min(1),
  hiddenOpportunity: z.string().min(1),
  realityAdvice: z.string().min(1),
  riskReward: riskRewardSchema
});

export const counterfactualResultSchema = z.object({
  question: z.string().min(1),
  reframe: z.string().min(1),
  disclaimer: z.string().min(1),
  branches: z.array(branchSchema).min(3).max(3),
  overallAdvice: z.string().min(1)
});

export const generateRequestSchema = z.object({
  provider: providerSchema,
  model: z.string().min(1),
  question: z.string().min(8).max(1000),
  context: z.string().max(3000).optional().default(""),
  tone: toneSchema,
  depth: depthSchema
}).superRefine((value, context) => {
  if (value.provider === "openai" && !/^gpt-/i.test(value.model)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["model"],
      message: "本项目只允许调用 gpt-* 型号。"
    });
  }
});

export type Provider = z.infer<typeof providerSchema>;
export type RealProvider = z.infer<typeof realProviderSchema>;
export type Tone = z.infer<typeof toneSchema>;
export type Depth = z.infer<typeof depthSchema>;
export type GenerateRequest = z.infer<typeof generateRequestSchema>;
export type TimelineNode = z.infer<typeof timelineNodeSchema>;
export type Branch = z.infer<typeof branchSchema>;
export type CounterfactualResult = z.infer<typeof counterfactualResultSchema>;

export type GenerateResponse = {
  data: CounterfactualResult;
  meta: {
    provider: Provider;
    model: string;
    mode: "local_preview" | "model";
    generatedAt: string;
  };
};

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
