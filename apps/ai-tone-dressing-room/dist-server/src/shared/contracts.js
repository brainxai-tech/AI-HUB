import { z } from "zod";

export const providerLabels = {
    openai: "GPT · AI Routing"
};
export const providerSchema = z.enum(["openai"]);
export const realProviderSchema = z.enum(["openai"]);
export const toneSchema = z.enum(["firmer", "softer", "premium", "selfLike", "boundaried"]);
export const toneLabels = {
    firmer: "更坚定",
    softer: "更温柔",
    premium: "更高级",
    selfLike: "更像本人",
    boundaried: "更有边界感"
};
export const toneHints = {
    firmer: "减少犹豫词，强化立场与行动句。",
    softer: "降低压迫感，增加理解与照顾感。",
    premium: "让表达更克制、清晰、有质感。",
    selfLike: "保留原始措辞习惯，只做轻度润色。",
    boundaried: "明确底线、责任归属和可接受范围。"
};
export const defaultModels = {
    openai: "gpt-5.4"
};
export const modelSuggestions = {
    openai: ["gpt-5.4"]
};
export function isGptModel(value) {
    return typeof value === "string" && /^gpt-/i.test(value.trim());
}
export const radarAxes = [
    { key: "firm", label: "坚定度" },
    { key: "soft", label: "温柔度" },
    { key: "premium", label: "高级感" },
    { key: "selfLike", label: "本人感" },
    { key: "boundary", label: "边界感" }
];
export const toneScoreSchema = z.object({
    firm: z.number().min(0).max(100),
    soft: z.number().min(0).max(100),
    premium: z.number().min(0).max(100),
    selfLike: z.number().min(0).max(100),
    boundary: z.number().min(0).max(100)
});
export const rewriteResultSchema = z.object({
    rewrite: z.string().min(1).max(2400),
    shortRewrite: z.string().min(1).max(1200),
    beforeScores: toneScoreSchema,
    afterScores: toneScoreSchema,
    explanation: z.array(z.string().min(1).max(280)).min(2).max(5),
    cautions: z.array(z.string().min(1).max(240)).max(4).default([])
});
export const rewriteRequestSchema = z.object({
    provider: providerSchema,
    model: z.string().trim().regex(/^gpt-/i, "本项目只允许调用 gpt-* 型号。"),
    text: z.string().trim().min(2).max(2000),
    targetTone: toneSchema,
    intensity: z.number().int().min(1).max(3).default(2),
    scenario: z.string().trim().max(120).optional(),
    recipient: z.string().trim().max(80).optional()
}).strict();
