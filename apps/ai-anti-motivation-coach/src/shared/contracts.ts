import { z } from "zod";

export const providerLabels = {
  openai: "GPT · AI Routing",
  demo: "本地预览"
} as const;

export const providerSchema = z.enum(["openai", "demo"]);
export const realProviderSchema = z.enum(["openai"]);
export const styleSchema = z.enum(["calm", "sharp", "friend"]);

export const styleLabels = {
  calm: "冷静版",
  sharp: "毒舌版",
  friend: "朋友版"
} as const;

export const defaultModels = {
  openai: "gpt-5.4",
  demo: "local-preview"
} as const;

export const modelSuggestions = {
  openai: ["gpt-5.4"],
  demo: ["local-preview"]
} as const;

export const emptyPhraseSchema = z.object({
  phrase: z.string().min(1),
  whyItIsEmpty: z.string().min(1),
  replaceWith: z.string().min(1)
});

export const actionSchema = z.object({
  title: z.string().min(1),
  minutes: z.number().int().min(1).max(120),
  firstStep: z.string().min(1),
  proof: z.string().min(1)
});

export const coachResultSchema = z.object({
  originalInput: z.string().min(1),
  headline: z.string().min(1),
  verdict: z.string().min(1),
  emptyPhrases: z.array(emptyPhraseSchema).min(1).max(4),
  realityCheck: z.string().min(1),
  actions: z.array(actionSchema).min(1).max(3),
  reviewQuestion: z.string().min(1),
  boundary: z.string().min(1),
  safetyMode: z.boolean().default(false)
});

export const generateRequestSchema = z.object({
  provider: providerSchema,
  model: z.string().min(1),
  style: styleSchema,
  userText: z.string().min(2).max(1000)
}).superRefine((value, context) => {
  if (value.provider === "openai" && !/^gpt-/i.test(value.model)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["model"],
      message: "AI Hub 仅允许本项目调用 gpt-* 型号。"
    });
  }
});

export type Provider = z.infer<typeof providerSchema>;
export type RealProvider = z.infer<typeof realProviderSchema>;
export type CoachStyle = z.infer<typeof styleSchema>;
export type GenerateRequest = z.infer<typeof generateRequestSchema>;
export type CoachResult = z.infer<typeof coachResultSchema>;

export type GenerateResponse = {
  data: CoachResult;
  meta: {
    provider: Provider;
    model: string;
    mode: "demo" | "model" | "safety";
    generatedAt: string;
    quality?: {
      score: number;
      passed: boolean;
      rewritten: boolean;
      issues: string[];
    };
  };
};

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
