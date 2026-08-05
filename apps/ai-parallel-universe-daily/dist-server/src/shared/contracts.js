import { z } from "zod";
export const providerLabels = {
    openai: "GPT · AI Routing"
};
export const providerSchema = z.literal("openai");
export const realProviderSchema = providerSchema;
export const toneSchema = z.enum(["calm", "editorial", "incisive"]);
export const universeSchema = z.enum(["persisted", "quit", "drifted"]);
export const defaultModels = {
    openai: "gpt-5.4"
};
export const modelSuggestions = {
    openai: ["gpt-5.4"]
};
export const generateRequestSchema = z.object({
    provider: providerSchema,
    model: z.string().trim().regex(/^gpt-/i, "本项目只允许调用 gpt-* 型号。"),
    activity: z.string().min(4, "请至少写 4 个字").max(1000, "今天这件事最多 1000 字"),
    goal: z.string().max(800).optional().default(""),
    mood: z.string().max(80).optional().default(""),
    tomorrowMinutes: z.coerce.number().int().min(5).max(480).optional().default(25),
    tone: toneSchema.default("editorial"),
    locale: z.literal("zh-CN").default("zh-CN")
});
export const newspaperReportSchema = z.object({
    universe: universeSchema,
    label: z.string().min(1),
    masthead: z.string().min(1),
    dateline: z.string().min(1),
    headline: z.string().min(1),
    subheadline: z.string().min(1),
    lead: z.string().min(1),
    frontPageStory: z.string().min(1),
    editorialNote: z.string().min(1),
    signal: z.string().min(1),
    actionAdvice: z.string().min(1)
});
export const actionPlanSchema = z.object({
    mainAction: z.string().min(1),
    antiDriftReminder: z.string().min(1),
    fallbackAction: z.string().min(1),
    firstStepMinutes: z.number().int().min(5).max(480)
});
export const parallelDailyResultSchema = z.object({
    originalInput: z.string().min(1),
    issueTitle: z.string().min(1),
    editorialBrief: z.string().min(1),
    reports: z.array(newspaperReportSchema).length(3).refine((reports) => {
        const universes = new Set(reports.map((report) => report.universe));
        return universes.has("persisted") && universes.has("quit") && universes.has("drifted");
    }, { message: "reports must contain persisted, quit, and drifted universes" }),
    actionPlan: actionPlanSchema,
    disclaimer: z.string().min(1)
});
