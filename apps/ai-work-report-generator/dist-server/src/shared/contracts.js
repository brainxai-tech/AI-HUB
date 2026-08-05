import { z } from "zod";
export const DEFAULT_MODEL = "gpt-5.4";
export const reportTypeSchema = z.enum(["daily", "weekly", "monthly"]);
export const reportStyleSchema = z.enum(["concise", "formal", "outcome"]);
export const reportTypeLabels = {
    daily: "日报",
    weekly: "周报",
    monthly: "月报"
};
export const reportStyleLabels = {
    concise: "简洁版",
    formal: "正式版",
    outcome: "突出成果版"
};
export const generateRequestSchema = z.object({
    reportType: reportTypeSchema.default("weekly"),
    style: reportStyleSchema.default("formal"),
    rawNotes: z.string().trim().min(8, "请至少输入 8 个字的工作记录").max(50_000),
    context: z.object({
        name: z.string().trim().max(80).optional().default(""),
        department: z.string().trim().max(120).optional().default(""),
        audience: z.string().trim().max(120).optional().default("直属领导 / 管理层"),
        periodStart: z.string().trim().max(20).optional().default(""),
        periodEnd: z.string().trim().max(20).optional().default(""),
        extraInstruction: z.string().trim().max(800).optional().default("")
    }).strict()
}).strict();
const nonEmpty = z.string().trim().min(1);
export const achievementSchema = z.object({
    title: nonEmpty,
    detail: nonEmpty,
    evidence: z.array(nonEmpty).max(6).default([])
});
export const issueSchema = z.object({
    title: nonEmpty,
    impact: nonEmpty,
    action: nonEmpty
});
export const nextPlanSchema = z.object({
    item: nonEmpty,
    goal: nonEmpty,
    timing: nonEmpty
});
export const workReportSchema = z.object({
    reportTitle: nonEmpty,
    period: nonEmpty,
    managementSummary: nonEmpty,
    achievements: z.array(achievementSchema).min(1).max(10),
    issues: z.array(issueSchema).max(6),
    nextPlans: z.array(nextPlanSchema).min(1).max(8),
    closingNote: z.string().trim().max(500).default("")
});
