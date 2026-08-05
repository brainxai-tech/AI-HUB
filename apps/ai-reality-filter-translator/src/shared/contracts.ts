import { z } from "zod";

export const ProviderSchema = z.enum(["openai"]);
export const WorldSchema = z.enum(["cyber_city", "gentle_animation", "detective_scene", "apocalypse_shelter"]);
export const LanguageSchema = z.enum(["zh-CN", "en"]);

export const defaultSystemPrompt = [
  "你是一个现实照片的世界观翻译器，不是普通修图滤镜。",
  "先认真读取用户上传照片和补充描述，提炼可见事实：地点、主体、物体、光线、空间关系、情绪和生活痕迹。",
  "再把这些事实翻译到所选世界观中，必须保留原图的核心主体和空间逻辑，不要凭空换成无关大场景。",
  "输出要同时服务两件事：一段有画面感的短故事，以及可以直接交给图像模型使用的高质量 prompt。",
  "故事要具体、有留白、有现场感；prompt 要包含镜头、光线、构图、材质、色彩和必须保留的元素。",
  "遇到用户描述不足时，要根据图片可见内容谨慎推断，并在 sourcePhotoFacts 里标明依据有限。"
].join("\n");

export const PhotoInputSchema = z.object({
  dataUrl: z.string().trim().min(1).max(480_000),
  mimeType: z.string().trim().min(3).max(80),
  name: z.string().trim().min(1).max(180),
  size: z.number().int().positive().max(360_000)
});

export const GenerateRealityRequestSchema = z.object({
  provider: ProviderSchema,
  model: z.string().trim().regex(/^gpt-/i, "本项目只允许调用 gpt-* 型号。"),
  world: WorldSchema,
  language: LanguageSchema,
  creativity: z.coerce.number().int().min(1).max(5),
  photo: PhotoInputSchema,
  systemPrompt: z.string().trim().max(2600).optional(),
  photoNote: z.string().trim().max(900).optional(),
  lockedElements: z.string().trim().max(300).optional()
}).strict();

export const VisualDirectivesSchema = z.object({
  camera: z.string().min(1),
  lighting: z.string().min(1),
  palette: z.array(z.string().min(1)).min(3).max(8),
  composition: z.string().min(1),
  texture: z.string().min(1)
});

export const RealityFilterOutputSchema = z.object({
  world: WorldSchema,
  title: z.string().min(1),
  story: z.string().min(1),
  scenePrompt: z.string().min(1),
  negativePrompt: z.string().min(1),
  sourcePhotoFacts: z.array(z.string().min(1)).min(1).max(10),
  visualDirectives: VisualDirectivesSchema,
  safetyNotes: z.array(z.string().min(1)).max(6)
});

export const GenerateRealityResponseSchema = z.object({
  data: RealityFilterOutputSchema,
  meta: z.object({
    provider: ProviderSchema,
    model: z.string().regex(/^gpt-/i),
    mode: z.literal("model"),
    acceptsImage: z.literal(true),
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
export type World = z.infer<typeof WorldSchema>;
export type Language = z.infer<typeof LanguageSchema>;
export type PhotoInput = z.infer<typeof PhotoInputSchema>;
export type GenerateRealityRequest = z.infer<typeof GenerateRealityRequestSchema>;
export type RealityFilterOutput = z.infer<typeof RealityFilterOutputSchema>;
export type GenerateRealityResponse = z.infer<typeof GenerateRealityResponseSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const defaultModels: Record<Provider, string> = {
  openai: "gpt-5.4"
};

export function isGptModel(value: unknown): value is string {
  return typeof value === "string" && /^gpt-/i.test(value.trim());
}

export const worldLabels: Record<World, string> = {
  cyber_city: "赛博都市",
  gentle_animation: "暖风手绘日常",
  detective_scene: "侦探现场",
  apocalypse_shelter: "末日避难所"
};
