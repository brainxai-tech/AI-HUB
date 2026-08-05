import { describe, expect, it } from "vitest";
import {
  buildLocalPlan,
  createSource,
  executePlan,
  formulaForExcelRow,
  normalizePlanRisks,
  planContextFromSources,
  validatePlan,
  type TransformPlan,
} from "../src/lib/trace-workbench";

const orders = createSource({
  id: "orders",
  name: "订单",
  fileName: "orders.xlsx",
  sheetName: "订单",
  rows: [
    { 订单号: "A-1", 客户: " 张三 ", 订单金额: 100 },
    { 订单号: "A-2", 客户: "李四", 订单金额: 200 },
    { 订单号: "A-2", 客户: "李四", 订单金额: 200 },
  ],
});

const refunds = createSource({
  id: "refunds",
  name: "退款",
  fileName: "refunds.xlsx",
  sheetName: "退款",
  rows: [
    { 订单号: "A-1", 退款金额: 10 },
    { 订单号: "A-3", 退款金额: 30 },
  ],
});

describe("trace workbench", () => {
  it("creates a local join and formula plan from natural language", () => {
    const context = planContextFromSources([orders, refunds], orders.id);
    const plan = buildLocalPlan("按订单号关联退款表，清理空格，计算实收金额", context);

    expect(plan.steps.map((step) => step.operation.op)).toEqual(["JOIN", "TRIM", "ADD_FORMULA_COLUMN"]);
    expect(validatePlan(plan, [orders, refunds]).filter((issue) => issue.severity === "ERROR")).toHaveLength(0);
  });

  it("executes steps as immutable versions and preserves the source", () => {
    const context = planContextFromSources([orders, refunds], orders.id);
    const plan = buildLocalPlan("按订单号关联退款表，清理空格，计算实收金额", context);
    const execution = executePlan(plan, [orders, refunds]);

    expect(execution.versions).toHaveLength(plan.steps.length + 1);
    expect(execution.finalVersion.rows[0]).toMatchObject({ 客户: "张三", 退款金额: 10, 实收金额: "=[订单金额]-[退款金额]" });
    expect(execution.finalVersion.rows[1]).toMatchObject({ 订单号: "A-2" });
    expect(orders.rows[0].客户).toBe(" 张三 ");
  });

  it("detects duplicate join keys and blocks unknown formula columns", () => {
    const duplicateRefunds = createSource({ ...refunds, id: "refunds-duplicate", rows: [...refunds.rows, refunds.rows[0]] });
    const plan: TransformPlan = {
      id: "plan",
      schemaVersion: "1.0",
      goal: "test",
      sourceId: orders.id,
      createdAt: new Date().toISOString(),
      generatedBy: "LOCAL",
      steps: [
        {
          id: "join",
          title: "join",
          reason: "test",
          risk: "MEDIUM",
          operation: {
            op: "JOIN",
            rightSourceId: duplicateRefunds.id,
            leftKey: "订单号",
            rightKey: "订单号",
            rightColumns: ["退款金额"],
            joinType: "LEFT",
          },
        },
        {
          id: "formula",
          title: "formula",
          reason: "test",
          risk: "LOW",
          operation: { op: "ADD_FORMULA_COLUMN", columnName: "错误", expression: "[不存在]+1", emptyOnError: true },
        },
      ],
    };

    const issues = validatePlan(plan, [orders, duplicateRefunds]);
    expect(issues.some((issue) => issue.code === "RIGHT_KEY_NOT_UNIQUE" && issue.severity === "WARNING")).toBe(true);
    expect(issues.some((issue) => issue.code === "FORMULA_COLUMN_NOT_FOUND" && issue.severity === "ERROR")).toBe(true);
  });

  it("deduplicates deterministically and creates row-aware Excel formulas", () => {
    const plan = buildLocalPlan("按订单号去重，保留第一条", planContextFromSources([orders], orders.id));
    const execution = executePlan(plan, [orders]);

    expect(execution.finalVersion.rows).toHaveLength(2);
    expect(formulaForExcelRow("([销售额]-[成本])/[销售额]", ["销售额", "成本", "毛利率"], 2)).toBe('IFERROR((A2-B2)/A2,"")');
  });

  it("forces model-provided DEDUP steps to high risk without mutating the source plan", () => {
    const plan: TransformPlan = {
      id: "model-plan",
      schemaVersion: "1.0",
      goal: "按订单号去重",
      sourceId: orders.id,
      createdAt: new Date().toISOString(),
      generatedBy: "AI",
      steps: [{
        id: "dedup",
        title: "去重",
        reason: "订单号应唯一",
        risk: "LOW",
        operation: { op: "DEDUP", keys: ["订单号"], keep: "FIRST" },
      }],
    };

    const normalized = normalizePlanRisks(plan);

    expect(normalized.steps[0].risk).toBe("HIGH");
    expect(plan.steps[0].risk).toBe("LOW");
  });

  it("normalizes calendar dates without timezone shifts", () => {
    const dated = createSource({
      id: "dated",
      name: "日期",
      fileName: "dated.xlsx",
      sheetName: "日期",
      rows: [{ 日期: "2026/07/01" }, { 日期: "2026.07.03" }, { 日期: "2026-02-30" }],
    });
    const plan: TransformPlan = {
      id: "date-plan",
      schemaVersion: "1.0",
      goal: "统一日期",
      sourceId: dated.id,
      createdAt: new Date().toISOString(),
      generatedBy: "LOCAL",
      steps: [{
        id: "date-step",
        title: "统一日期",
        reason: "test",
        risk: "LOW",
        operation: { op: "NORMALIZE_DATE", columns: ["日期"] },
      }],
    };

    const result = executePlan(plan, [dated]).finalVersion.rows;
    expect(result[0].日期).toBe("2026-07-01");
    expect(result[1].日期).toBe("2026-07-03");
    expect(result[2].日期).toBe("2026-02-30");
  });
});
