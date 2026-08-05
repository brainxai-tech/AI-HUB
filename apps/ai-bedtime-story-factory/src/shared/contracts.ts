import { z } from "zod";

export const ProviderSchema = z.enum(["openai"]);

export const ReadingStyleSchema = z.enum(["calm", "playful", "whisper"]);

export const StoryRequestSchema = z.object({
  provider: ProviderSchema,
  model: z.string().trim().min(1, "请选择或填写模型"),
  childAge: z.coerce.number().int().min(2).max(12),
  childName: z.string().trim().max(20).optional(),
  theme: z.string().trim().min(1).max(80),
  characters: z.string().trim().min(1).max(120),
  setting: z.string().trim().max(100).optional(),
  tone: z.string().trim().min(1).max(80),
  lengthMinutes: z.coerce.number().int().min(2).max(12),
  readingStyle: ReadingStyleSchema,
  sequelSeed: z.string().trim().max(500).optional()
}).superRefine((value, context) => {
  if (!/^gpt-/i.test(value.model)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["model"],
      message: "AI Hub 仅允许本项目调用 gpt-* 型号。"
    });
  }
});

export const StoryResponseSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().min(1),
  story: z.string().min(1),
  readAloud: z.string().min(1),
  shareCard: z.object({
    headline: z.string().min(1),
    quote: z.string().min(1),
    caption: z.string().min(1),
    hashtags: z.array(z.string()).min(1).max(6)
  }),
  parentNotes: z.array(z.string()).min(1).max(5),
  sequelSeed: z.string().min(1)
});

export const ApiSuccessSchema = z.object({
  data: StoryResponseSchema,
  meta: z.object({
    provider: ProviderSchema,
    model: z.string(),
    generatedAt: z.string()
  })
});

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional()
  })
});

export type Provider = z.infer<typeof ProviderSchema>;
export type ReadingStyle = z.infer<typeof ReadingStyleSchema>;
export type StoryRequest = z.infer<typeof StoryRequestSchema>;
export type StoryResponse = z.infer<typeof StoryResponseSchema>;
export type ApiSuccess = z.infer<typeof ApiSuccessSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const providerLabels: Record<Provider, string> = {
  openai: "GPT · AI Routing"
};

export const defaultModels: Record<Provider, string> = {
  openai: "gpt-5.4"
};
