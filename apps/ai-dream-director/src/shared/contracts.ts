import { z } from "zod";

export const ProviderSchema = z.enum(["demo", "openai"]);
export const RealProviderSchema = z.enum(["openai"]);
export const DreamStyleSchema = z.enum(["surreal", "film_noir", "animation", "arthouse", "soft_horror", "warm_fantasy"]);
export const LanguageSchema = z.enum(["zh-CN", "en"]);
export const RevisionModeSchema = z.enum([
  "more_faithful",
  "more_surreal",
  "more_cinematic",
  "stronger_poster",
  "stronger_shots",
  "less_explanatory"
]);

export const GenerateDreamRequestSchema = z.object({
  provider: ProviderSchema,
  model: z.string().trim().min(1),
  dreamText: z.string().trim().min(10, "梦境至少需要 10 个字").max(5000),
  titleHint: z.string().trim().max(60).optional(),
  style: DreamStyleSchema,
  tone: z.string().trim().min(1).max(100),
  durationMinutes: z.coerce.number().int().min(1).max(8),
  intensity: z.coerce.number().int().min(1).max(5),
  language: LanguageSchema,
  revisionMode: RevisionModeSchema.optional()
}).superRefine((value, context) => {
  if (value.provider === "openai" && !/^gpt-/i.test(value.model)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["model"], message: "本项目只允许调用 gpt-* 型号。" });
  }
});

export const DreamElementStatusSchema = z.enum(["used", "adapted", "missing"]);
export const DreamElementTypeSchema = z.enum(["place", "object", "person", "action", "time", "event", "image", "sound", "emotion", "other"]);

export const DreamElementSchema = z.object({
  label: z.string().min(1),
  type: DreamElementTypeSchema,
  source: z.string().min(1),
  status: DreamElementStatusSchema,
  usage: z.string().min(1)
});

export const FidelityReportSchema = z.object({
  score: z.number().int().min(0).max(100),
  preserved: z.array(z.string()).min(1),
  adapted: z.array(z.string()),
  missing: z.array(z.string()),
  note: z.string().min(1)
});

export const CharacterSchema = z.object({
  name: z.string().min(1),
  function: z.string().min(1),
  visual: z.string().min(1),
  desire: z.string().min(1),
  symbol: z.string().min(1)
});

export const ActSchema = z.object({
  act: z.number().int().min(1).max(3),
  title: z.string().min(1),
  plot: z.string().min(1),
  emotion: z.string().min(1),
  keyFrame: z.string().min(1)
});

export const ShotSchema = z.object({
  no: z.number().int().min(1),
  act: z.number().int().min(1).max(3),
  timecode: z.string().min(1),
  shotSize: z.string().min(1),
  camera: z.string().min(1),
  image: z.string().min(1),
  composition: z.string().min(1),
  lighting: z.string().min(1),
  videoPrompt: z.string().min(1),
  negativePrompt: z.string().min(1),
  continuity: z.string().min(1),
  action: z.string().min(1),
  voiceOver: z.string().min(1),
  sound: z.string().min(1),
  transition: z.string().min(1)
});

export const PosterSchema = z.object({
  title: z.string().min(1),
  tagline: z.string().min(1),
  copy: z.string().min(1),
  prompt: z.string().min(1),
  negativePrompt: z.string().min(1)
});

export const DreamDirectorOutputSchema = z.object({
  title: z.string().min(1),
  logline: z.string().min(1),
  directorStatement: z.string().min(1),
  dreamElements: z.array(DreamElementSchema).min(1).max(12),
  fidelity: FidelityReportSchema,
  visualBible: z.object({
    genre: z.string().min(1),
    palette: z.array(z.string()).min(3).max(8),
    texture: z.string().min(1),
    lens: z.string().min(1),
    soundKeywords: z.array(z.string()).min(3).max(8)
  }),
  characters: z.array(CharacterSchema).min(2).max(6),
  acts: z.array(ActSchema).length(3),
  shots: z.array(ShotSchema).min(6).max(10),
  voiceOver: z.array(z.string()).min(3).max(8),
  poster: PosterSchema
});

export const GenerateDreamResponseSchema = z.object({
  data: DreamDirectorOutputSchema,
  meta: z.object({
    provider: ProviderSchema,
    model: z.string(),
    mode: z.enum(["model", "local_preview"]),
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
export type RealProvider = z.infer<typeof RealProviderSchema>;
export type DreamStyle = z.infer<typeof DreamStyleSchema>;
export type RevisionMode = z.infer<typeof RevisionModeSchema>;
export type DreamElement = z.infer<typeof DreamElementSchema>;
export type DreamElementStatus = z.infer<typeof DreamElementStatusSchema>;
export type GenerateDreamRequest = z.infer<typeof GenerateDreamRequestSchema>;
export type DreamDirectorOutput = z.infer<typeof DreamDirectorOutputSchema>;
export type GenerateDreamResponse = z.infer<typeof GenerateDreamResponseSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const providerLabels: Record<Provider, string> = {
  demo: "本地演示",
  openai: "GPT · AI Routing"
};

export const defaultModels: Record<Provider, string> = {
  demo: "local-dream-director",
  openai: "gpt-5.4"
};

export const modelSuggestions: Record<Provider, string[]> = {
  demo: ["local-dream-director"],
  openai: ["gpt-5.4"]
};

export const styleLabels: Record<DreamStyle, string> = {
  surreal: "超现实",
  film_noir: "梦核黑色",
  animation: "动画寓言",
  arthouse: "艺术短片",
  soft_horror: "轻恐梦境",
  warm_fantasy: "温柔奇幻"
};

export const revisionModeLabels: Record<RevisionMode, string> = {
  more_faithful: "更忠于原梦",
  more_surreal: "更惊悚",
  more_cinematic: "更艺术片",
  stronger_poster: "加强海报感",
  stronger_shots: "加强镜头细节",
  less_explanatory: "减少解释感"
};
