import { z } from "zod";
export const providerLabels = {
    openai: "GPT · AI Routing"
};
export const providerSchema = z.literal("openai");
export const realProviderSchema = providerSchema;
export const toneSchema = z.enum(["gentle", "sharp", "heroic", "anime", "coach"]);
export const toneLabels = {
    gentle: "温柔但不纵容",
    sharp: "毒舌但不羞辱",
    heroic: "热血闯关",
    anime: "中二漫画",
    coach: "行动教练"
};
export const cardStyleSchema = z.enum(["rpg", "tarot", "office", "manga"]);
export const cardStyleLabels = {
    rpg: "RPG Boss 图鉴",
    tarot: "塔罗怪谈",
    office: "办公室怪谈",
    manga: "少年漫画反派"
};
export const defaultModels = {
    openai: "gpt-5.4"
};
export const modelSuggestions = {
    openai: ["gpt-5.4"]
};
export const attributeSchema = z.object({
    label: z.string().min(1),
    value: z.number().int().min(0).max(100),
    note: z.string().min(1)
});
export const skillSchema = z.object({
    name: z.string().min(1),
    trigger: z.string().min(1),
    effect: z.string().min(1),
    counter: z.string().min(1)
});
export const strategySchema = z.object({
    todayQuest: z.string().min(1),
    antiSkill: z.string().min(1),
    environmentRule: z.string().min(1),
    recoveryPlan: z.string().min(1),
    bossFightPlan: z.array(z.string().min(1)).min(3).max(5)
});
export const villainCardSchema = z.object({
    goal: z.string().min(1),
    title: z.string().min(1),
    villainName: z.string().min(1),
    archetype: z.string().min(1),
    level: z.number().int().min(1).max(99),
    element: z.string().min(1),
    catchphrase: z.string().min(1),
    hiddenFear: z.string().min(1),
    disguise: z.string().min(1),
    spawnScenes: z.array(z.string().min(1)).min(3).max(5),
    attributes: z.array(attributeSchema).min(4).max(4),
    skills: z.array(skillSchema).min(3).max(4),
    ultimate: z.string().min(1),
    weakness: z.array(z.string().min(1)).min(3).max(5),
    loot: z.array(z.string().min(1)).min(2).max(5),
    strategy: strategySchema,
    imagePrompt: z.string().min(1),
    shareCopy: z.string().min(1),
    boundary: z.string().min(1),
    safetyMode: z.boolean().default(false)
});
export const generateRequestSchema = z.object({
    provider: providerSchema,
    model: z.string().trim().regex(/^gpt-/i, "本项目只允许调用 gpt-* 型号。"),
    goal: z.string().min(3).max(800),
    blockerHint: z.string().max(500).optional().default(""),
    deadline: z.string().max(80).optional().default(""),
    tone: toneSchema,
    cardStyle: cardStyleSchema
});
