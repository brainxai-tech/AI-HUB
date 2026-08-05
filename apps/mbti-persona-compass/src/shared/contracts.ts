import { z } from "zod";

const dimensionSchema = z.enum(["EI", "SN", "TF", "JP"]);
const answerSchema = z.number().int().min(-2).max(2);

export const aiInterpretationRequestSchema = z.object({
  answers: z.record(z.string(), answerSchema),
}).superRefine((value, context) => {
  const keys = Object.keys(value.answers);
  const complete = keys.length === 32 && keys.every((key) => {
    const id = Number(key);
    return Number.isInteger(id) && id >= 1 && id <= 32;
  });
  if (!complete) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["answers"], message: "需要提交完整的 32 道答案。" });
  }
});

const dimensionInsightSchema = z.object({
  dimension: dimensionSchema,
  conclusion: z.string().trim().min(1).max(160),
  reason: z.string().trim().min(1).max(500),
  evidenceQuestionIds: z.array(z.number().int().min(1).max(32)).min(1).max(3),
  nuance: z.string().trim().min(1).max(360),
});

const growthExperimentSchema = z.object({
  title: z.string().trim().min(1).max(40),
  action: z.string().trim().min(1).max(220),
  rationale: z.string().trim().min(1).max(260),
});

export const aiInterpretationSchema = z.object({
  headline: z.string().trim().min(1).max(80),
  reasoningSummary: z.string().trim().min(1).max(800),
  dimensionInsights: z.array(dimensionInsightSchema).length(4),
  crossSignals: z.array(z.string().trim().min(1).max(320)).max(3),
  growthExperiments: z.array(growthExperimentSchema).length(3),
  closingNote: z.string().trim().min(1).max(300),
}).superRefine((value, context) => {
  const dimensions = new Set(value.dimensionInsights.map((item) => item.dimension));
  if (dimensions.size !== 4 || !["EI", "SN", "TF", "JP"].every((item) => dimensions.has(item as never))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["dimensionInsights"], message: "四个维度必须各出现一次。" });
  }
});

export type AiInterpretationRequest = z.infer<typeof aiInterpretationRequestSchema>;
export type AiInterpretation = z.infer<typeof aiInterpretationSchema>;
export type ApiError = { error: { code: string; message: string; details?: unknown } };
