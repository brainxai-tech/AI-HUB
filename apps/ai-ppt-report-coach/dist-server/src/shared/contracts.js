import { z } from "zod";
export const DEFAULT_MODEL = "gpt-5.4";
export const reportTypeSchema = z.enum(["progress", "proposal", "review", "analysis"]);
export const audienceSchema = z.enum(["leadership", "cross-team", "client", "all-hands"]);
export const visualTypeSchema = z.enum(["title", "metrics", "chart", "comparison", "timeline", "process", "content", "closing"]);
export const reportTypeLabels = {
    progress: "项目进展",
    proposal: "方案提案",
    review: "经营复盘",
    analysis: "专项分析"
};
export const audienceLabels = {
    leadership: "管理层 / 领导",
    "cross-team": "跨部门团队",
    client: "客户 / 外部伙伴",
    "all-hands": "全员大会"
};
const nonEmpty = z.string().trim().min(1);
export const generationInputSchema = z.object({
    topic: z.string().trim().min(4, "请至少输入一个明确主题。 ").max(5000),
    sourceText: z.string().trim().max(120000).optional().default(""),
    sourceName: z.string().trim().max(260).optional().default(""),
    reportType: reportTypeSchema.default("progress"),
    audience: audienceSchema.default("leadership"),
    durationMinutes: z.number().int().min(5).max(60).default(15),
    slideCount: z.number().int().min(6).max(20).default(10),
    emphasis: z.string().trim().max(500).optional().default("")
});
export const generateRequestSchema = z.object({
    input: generationInputSchema
}).strict();
export const objectiveAudienceSchema = z.object({
    objective: nonEmpty,
    audienceProfile: nonEmpty,
    decisionWanted: nonEmpty,
    successCriteria: z.array(nonEmpty).min(2).max(5),
    communicationStrategy: nonEmpty
});
export const sectionSchema = z.object({
    name: nonEmpty,
    purpose: nonEmpty,
    pageRange: nonEmpty
});
export const structureSchema = z.object({
    narrative: nonEmpty,
    openingHook: nonEmpty,
    sections: z.array(sectionSchema).min(3).max(6),
    closingAction: nonEmpty
});
export const slideSchema = z.object({
    page: z.number().int().min(1),
    title: nonEmpty,
    role: nonEmpty,
    keyMessage: nonEmpty,
    bullets: z.array(nonEmpty).min(1).max(6),
    evidence: nonEmpty,
    dataSuggestion: nonEmpty,
    chartSuggestion: nonEmpty,
    speakerNotes: nonEmpty,
    timingSeconds: z.number().int().min(20).max(900),
    visualType: visualTypeSchema
});
export const questionSchema = z.object({
    question: nonEmpty,
    concernBehindIt: nonEmpty,
    answerStrategy: nonEmpty,
    sampleAnswer: nonEmpty
});
export const coachingSchema = z.object({
    openingScript: nonEmpty,
    transitions: z.array(nonEmpty).min(2).max(8),
    deliveryTips: z.array(nonEmpty).min(3).max(7),
    finalReminder: nonEmpty
});
export const reportPlanSchema = z.object({
    title: nonEmpty,
    subtitle: nonEmpty,
    objectiveAudience: objectiveAudienceSchema,
    structure: structureSchema,
    slides: z.array(slideSchema).min(6).max(20),
    leadershipQuestions: z.array(questionSchema).min(4).max(10),
    coaching: coachingSchema
});
export const exportRequestSchema = z.object({
    report: reportPlanSchema,
    theme: z.enum(["executive", "warm", "minimal"]).default("executive")
});
