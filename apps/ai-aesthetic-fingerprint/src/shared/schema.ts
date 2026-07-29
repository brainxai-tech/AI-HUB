import { z } from "zod";

export const providerSchema = z.enum(["openai", "demo"]);
export type ModelProvider = z.infer<typeof providerSchema>;

export const imageInputSchema = z.object({
  name: z.string().min(1).max(160),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(5 * 1024 * 1024),
  data: z.string().min(32)
});

export const analyzeRequestSchema = z.object({
  provider: providerSchema.optional(),
  projectGoal: z.string().trim().max(600).optional(),
  images: z.array(imageInputSchema).min(1).max(10)
});

const weightedTraitSchema = z.object({
  label: z.string().min(1),
  evidence: z.string().min(1),
  confidence: z.number().min(0).max(1)
});

export const aestheticReportSchema = z.object({
  summary: z.string().min(1),
  dnaName: z.string().min(1),
  color: z.object({
    palette: z.array(z.string()).min(3).max(8),
    temperature: z.string().min(1),
    contrast: z.string().min(1),
    guidance: z.string().min(1)
  }),
  typography: z.object({
    direction: z.string().min(1),
    hierarchy: z.string().min(1),
    spacing: z.string().min(1)
  }),
  layout: z.object({
    composition: z.string().min(1),
    density: z.string().min(1),
    rhythm: z.string().min(1)
  }),
  mood: z.array(weightedTraitSchema).min(3).max(8),
  taboos: z.array(z.string()).min(3).max(10),
  nextDirections: z.array(z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    whenToUse: z.string().min(1)
  })).min(2).max(4),
  uiPrompt: z.string().min(80),
  imageNotes: z.array(z.object({
    imageName: z.string().min(1),
    observations: z.array(z.string()).min(2).max(6)
  })).min(1),
  caveats: z.array(z.string()).min(1).max(6)
});

export const analyzeResponseSchema = z.object({
  provider: providerSchema,
  model: z.string().min(1),
  report: aestheticReportSchema,
  generatedAt: z.string().datetime()
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional()
  })
});

export type ImageInput = z.infer<typeof imageInputSchema>;
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
export type AestheticReport = z.infer<typeof aestheticReportSchema>;
export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
