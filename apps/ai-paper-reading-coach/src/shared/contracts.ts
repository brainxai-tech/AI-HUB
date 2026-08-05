import { z } from "zod";

export const ProviderSchema = z.enum(["openai"]);
export const CoachTaskSchema = z.enum(["paper_map", "section_explain", "qa", "quiz"]);
export const UserLevelSchema = z.enum(["beginner", "graduate", "reviewer"]);
export const OutputLanguageSchema = z.enum(["zh-CN", "en"]);
export const EvidenceKindSchema = z.enum(["based_on_text", "inferred", "uncertain"]);

export const PaperMetaSchema = z.object({
  title: z.string().trim().min(1).default("未命名论文"),
  sourceName: z.string().trim().optional(),
  sourceUrl: z.string().trim().optional(),
  authors: z.array(z.string()).default([]),
  importedAt: z.string().default(() => new Date().toISOString())
});

export const PaperParagraphSchema = z.object({
  id: z.string(),
  sectionId: z.string(),
  sectionTitle: z.string(),
  index: z.number(),
  text: z.string(),
  summary: z.string(),
  citation: z.string()
});

export const PaperSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  role: z.string(),
  summary: z.string(),
  paragraphs: z.array(PaperParagraphSchema)
});

export const ParsedPaperSchema = z.object({
  meta: PaperMetaSchema,
  rawText: z.string(),
  sections: z.array(PaperSectionSchema),
  stats: z.object({
    characters: z.number(),
    words: z.number(),
    sections: z.number(),
    paragraphs: z.number(),
    pages: z.number().optional()
  })
});

export const GeneratePaperCoachInputSchema = z.object({
  paperMeta: PaperMetaSchema,
  sectionSummaries: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      role: z.string(),
      summary: z.string()
    })
  ).default([]),
  selectedText: z.string().trim().max(20_000).optional(),
  surroundingContext: z.string().trim().max(40_000).optional(),
  userQuestion: z.string().trim().max(2_000).optional(),
  userLevel: UserLevelSchema,
  outputLanguage: OutputLanguageSchema
});

export const GeneratePaperCoachRequestSchema = z.object({
  provider: ProviderSchema,
  model: z.string().trim().regex(/^gpt-/i, "本项目只允许调用 gpt-* 型号。"),
  task: CoachTaskSchema,
  input: GeneratePaperCoachInputSchema
});

export const CoachBlockSchema = z.object({
  heading: z.string().trim().min(1),
  body: z.string().trim().min(1),
  evidence: EvidenceKindSchema,
  refs: z.array(z.string()).default([])
});

export const CoachOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  blocks: z.array(CoachBlockSchema).default([]),
  cards: z.array(CoachBlockSchema).default([]),
  questions: z.array(CoachBlockSchema).default([]),
  interviewQuestions: z.array(CoachBlockSchema).default([]),
  notesMarkdown: z.string().default(""),
  uncertainty: z.array(z.string()).default([])
});

export const GeneratePaperCoachResponseSchema = z.object({
  data: CoachOutputSchema,
  meta: z.object({
    provider: ProviderSchema,
    model: z.string(),
    task: CoachTaskSchema,
    generatedAt: z.string(),
    mode: z.literal("model")
  })
});

export const ImportLinkRequestSchema = z.object({
  url: z.string().trim().min(1).max(2_000)
});

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional()
  })
});

export type Provider = z.infer<typeof ProviderSchema>;
export type CoachTask = z.infer<typeof CoachTaskSchema>;
export type UserLevel = z.infer<typeof UserLevelSchema>;
export type OutputLanguage = z.infer<typeof OutputLanguageSchema>;
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;
export type PaperMeta = z.infer<typeof PaperMetaSchema>;
export type PaperParagraph = z.infer<typeof PaperParagraphSchema>;
export type PaperSection = z.infer<typeof PaperSectionSchema>;
export type ParsedPaper = z.infer<typeof ParsedPaperSchema>;
export type GeneratePaperCoachInput = z.infer<typeof GeneratePaperCoachInputSchema>;
export type GeneratePaperCoachRequest = z.infer<typeof GeneratePaperCoachRequestSchema>;
export type CoachBlock = z.infer<typeof CoachBlockSchema>;
export type CoachOutput = z.infer<typeof CoachOutputSchema>;
export type GeneratePaperCoachResponse = z.infer<typeof GeneratePaperCoachResponseSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const providerLabels: Record<Provider, string> = {
  openai: "GPT · AI Routing"
};

export const defaultModels: Record<Provider, string> = {
  openai: "gpt-5.4"
};

export function isGptModel(value: unknown): value is string {
  return typeof value === "string" && /^gpt-/i.test(value.trim());
}

export const evidenceLabels: Record<EvidenceKind, string> = {
  based_on_text: "基于论文文本",
  inferred: "推测",
  uncertain: "不确定"
};
