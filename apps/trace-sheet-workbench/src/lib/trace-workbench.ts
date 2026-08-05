import type { CellValue, RawRow } from "./data-analysis";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type DataSource = {
  id: string;
  name: string;
  fileName: string;
  sheetName: string;
  rows: RawRow[];
  contentHash?: string;
};

export type JoinOperation = {
  op: "JOIN";
  rightSourceId: string;
  leftKey: string;
  rightKey: string;
  rightColumns: string[];
  joinType: "LEFT" | "INNER";
};

export type UnionOperation = {
  op: "UNION";
  sourceIds: string[];
};

export type TrimOperation = {
  op: "TRIM";
  columns: string[];
};

export type NormalizeDateOperation = {
  op: "NORMALIZE_DATE";
  columns: string[];
};

export type ReplaceOperation = {
  op: "REPLACE";
  column: string;
  find: string;
  replaceWith: string;
};

export type DedupOperation = {
  op: "DEDUP";
  keys: string[];
  keep: "FIRST" | "LAST";
};

export type AddFormulaOperation = {
  op: "ADD_FORMULA_COLUMN";
  columnName: string;
  expression: string;
  emptyOnError: boolean;
};

export type TransformOperation =
  | JoinOperation
  | UnionOperation
  | TrimOperation
  | NormalizeDateOperation
  | ReplaceOperation
  | DedupOperation
  | AddFormulaOperation;

export type PlanStep = {
  id: string;
  title: string;
  reason: string;
  risk: RiskLevel;
  operation: TransformOperation;
};

export type TransformPlan = {
  id: string;
  schemaVersion: "1.0";
  goal: string;
  sourceId: string;
  createdAt: string;
  generatedBy: "LOCAL" | "AI";
  steps: PlanStep[];
};

export type ValidationIssue = {
  stepId: string;
  severity: "ERROR" | "WARNING";
  code: string;
  message: string;
};

export type ChangeSample = {
  rowIndex: number;
  before: RawRow | null;
  after: RawRow | null;
};

export type ChangeSummary = {
  inputRows: number;
  outputRows: number;
  addedRows: number;
  removedRows: number;
  changedRows: number;
  addedColumns: string[];
  removedColumns: string[];
  samples: ChangeSample[];
  warnings: string[];
};

export type DatasetVersion = {
  id: string;
  parentId: string | null;
  label: string;
  createdAt: string;
  rows: RawRow[];
  sourceId: string;
  operation?: PlanStep;
  change?: ChangeSummary;
};

export type PlanExecution = {
  plan: TransformPlan;
  versions: DatasetVersion[];
  finalVersion: DatasetVersion;
};

export type PlanContextSource = Pick<DataSource, "id" | "name" | "fileName" | "sheetName"> & {
  columns: string[];
  rowCount: number;
};

export type PlanContext = {
  sources: PlanContextSource[];
  activeSourceId: string;
};

export function createSource(input: Omit<DataSource, "id"> & { id?: string }): DataSource {
  return {
    ...input,
    id: input.id || createId("source"),
    rows: cloneRows(input.rows),
  };
}

export function sourceColumns(source: Pick<DataSource, "rows">): string[] {
  return columnsFromRows(source.rows);
}

export function planContextFromSources(sources: DataSource[], activeSourceId: string): PlanContext {
  return {
    activeSourceId,
    sources: sources.map((source) => ({
      id: source.id,
      name: source.name,
      fileName: source.fileName,
      sheetName: source.sheetName,
      columns: sourceColumns(source),
      rowCount: source.rows.length,
    })),
  };
}

export function normalizePlanRisks(plan: TransformPlan): TransformPlan {
  return {
    ...plan,
    steps: plan.steps.map((step) => (
      step.operation.op === "DEDUP" && step.risk !== "HIGH"
        ? { ...step, risk: "HIGH" }
        : step
    )),
  };
}

export function createInitialVersion(source: DataSource): DatasetVersion {
  return {
    id: createId("version"),
    parentId: null,
    label: `源版本 · ${source.name}`,
    createdAt: new Date().toISOString(),
    rows: cloneRows(source.rows),
    sourceId: source.id,
  };
}

export function validatePlan(plan: TransformPlan, sources: DataSource[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const primary = sourceMap.get(plan.sourceId);

  if (!primary) {
    return [{ stepId: "plan", severity: "ERROR", code: "SOURCE_NOT_FOUND", message: "主数据源不存在。" }];
  }

  let columns = sourceColumns(primary);

  for (const step of plan.steps) {
    const operation = step.operation;
    if (operation.op === "JOIN") {
      const right = sourceMap.get(operation.rightSourceId);
      if (!right) {
        issues.push(error(step.id, "RIGHT_SOURCE_NOT_FOUND", "关联数据源不存在。"));
        continue;
      }
      const rightColumns = sourceColumns(right);
      if (!columns.includes(operation.leftKey)) {
        issues.push(error(step.id, "LEFT_KEY_NOT_FOUND", `主表中不存在字段“${operation.leftKey}”。`));
      }
      if (!rightColumns.includes(operation.rightKey)) {
        issues.push(error(step.id, "RIGHT_KEY_NOT_FOUND", `关联表中不存在字段“${operation.rightKey}”。`));
      }
      for (const column of operation.rightColumns) {
        if (!rightColumns.includes(column)) {
          issues.push(error(step.id, "RIGHT_COLUMN_NOT_FOUND", `关联表中不存在字段“${column}”。`));
        }
      }
      const duplicateCount = countDuplicateKeys(right.rows, [operation.rightKey]);
      if (duplicateCount > 0) {
        issues.push({
          stepId: step.id,
          severity: "WARNING",
          code: "RIGHT_KEY_NOT_UNIQUE",
          message: `关联表有 ${duplicateCount} 个重复键，执行后可能增加行数。`,
        });
      }
      columns = mergeColumnNames(columns, operation.rightColumns);
    }

    if (operation.op === "UNION") {
      const unionSources = operation.sourceIds.map((id) => sourceMap.get(id)).filter(Boolean) as DataSource[];
      if (unionSources.length !== operation.sourceIds.length) {
        issues.push(error(step.id, "UNION_SOURCE_NOT_FOUND", "追加步骤包含不存在的数据源。"));
      }
      columns = mergeColumnNames(columns, unionSources.flatMap(sourceColumns));
    }

    if (operation.op === "TRIM" || operation.op === "NORMALIZE_DATE") {
      for (const column of operation.columns) {
        if (!columns.includes(column)) issues.push(error(step.id, "COLUMN_NOT_FOUND", `不存在字段“${column}”。`));
      }
    }

    if (operation.op === "REPLACE" && !columns.includes(operation.column)) {
      issues.push(error(step.id, "COLUMN_NOT_FOUND", `不存在字段“${operation.column}”。`));
    }

    if (operation.op === "DEDUP") {
      if (operation.keys.length === 0) issues.push(error(step.id, "DEDUP_KEYS_EMPTY", "去重至少需要一个字段。"));
      for (const key of operation.keys) {
        if (!columns.includes(key)) issues.push(error(step.id, "COLUMN_NOT_FOUND", `不存在字段“${key}”。`));
      }
    }

    if (operation.op === "ADD_FORMULA_COLUMN") {
      const referenced = expressionColumns(operation.expression);
      const unknown = referenced.filter((column) => !columns.includes(column));
      for (const column of unknown) {
        issues.push(error(step.id, "FORMULA_COLUMN_NOT_FOUND", `公式引用了不存在的字段“${column}”。`));
      }
      if (!isValidArithmeticExpression(operation.expression)) {
        issues.push(error(step.id, "FORMULA_INVALID", "公式只允许字段引用、数字、括号和 + - * / 运算。"));
      }
      if (!columns.includes(operation.columnName)) columns.push(operation.columnName);
    }
  }

  return issues;
}

export function executePlan(
  plan: TransformPlan,
  sources: DataSource[],
  baseVersion?: DatasetVersion,
): PlanExecution {
  const validation = validatePlan(plan, sources);
  const errors = validation.filter((issue) => issue.severity === "ERROR");
  if (errors.length > 0) {
    throw new Error(errors.map((issue) => issue.message).join(" "));
  }

  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const primary = sourceMap.get(plan.sourceId)!;
  const root = baseVersion || createInitialVersion(primary);
  const versions: DatasetVersion[] = [root];
  let current = root;

  for (const step of plan.steps) {
    const output = executeOperation(current.rows, step.operation, sourceMap);
    const change = summarizeChange(current.rows, output.rows, output.warnings);
    const next: DatasetVersion = {
      id: createId("version"),
      parentId: current.id,
      label: step.title,
      createdAt: new Date().toISOString(),
      rows: output.rows,
      sourceId: plan.sourceId,
      operation: step,
      change,
    };
    versions.push(next);
    current = next;
  }

  return { plan, versions, finalVersion: current };
}

export function previewPlan(plan: TransformPlan, sources: DataSource[], baseVersion?: DatasetVersion): PlanExecution {
  return executePlan(plan, sources, baseVersion);
}

export function buildLocalPlan(goal: string, context: PlanContext): TransformPlan {
  const active = context.sources.find((source) => source.id === context.activeSourceId) || context.sources[0];
  if (!active) throw new Error("请先上传数据文件。" );

  const normalizedGoal = goal.trim();
  const steps: PlanStep[] = [];
  const second = context.sources.find((source) => source.id !== active.id);
  const explicitKey = findMentionedColumn(normalizedGoal, active.columns);

  if (/(左连接|关联|匹配|join|合并.*列)/i.test(normalizedGoal) && second) {
    const commonColumns = active.columns.filter((column) => second.columns.includes(column));
    const key = explicitKey && second.columns.includes(explicitKey) ? explicitKey : commonColumns[0];
    if (key) {
      steps.push({
        id: createId("step"),
        title: `按“${key}”关联 ${second.name}`,
        reason: "使用两个数据源共有的字段进行精确匹配，并保留主表全部记录。",
        risk: "MEDIUM",
        operation: {
          op: "JOIN",
          rightSourceId: second.id,
          leftKey: key,
          rightKey: key,
          rightColumns: second.columns.filter((column) => column !== key),
          joinType: "LEFT",
        },
      });
    }
  } else if (/(追加|纵向合并|合并.*行|union)/i.test(normalizedGoal) && second) {
    steps.push({
      id: createId("step"),
      title: `追加 ${second.name}`,
      reason: "把两个数据源按行追加，并按列名自动对齐。",
      risk: "MEDIUM",
      operation: { op: "UNION", sourceIds: [second.id] },
    });
  }

  if (/(空格|trim|清理文本)/i.test(normalizedGoal)) {
    const textColumns = active.columns.filter((column) => /名称|姓名|客户|渠道|地区|地址|编号|号|文本|备注/i.test(column));
    steps.push({
      id: createId("step"),
      title: "清理文本首尾空格",
      reason: "统一文本键值，减少关联和去重时的假性差异。",
      risk: "LOW",
      operation: { op: "TRIM", columns: textColumns.length ? textColumns : active.columns },
    });
  }

  if (/(日期|时间格式)/i.test(normalizedGoal)) {
    const dateColumns = active.columns.filter((column) => /日期|时间|date|time/i.test(column));
    if (dateColumns.length) {
      steps.push({
        id: createId("step"),
        title: "统一日期格式",
        reason: "将可识别日期统一为 YYYY-MM-DD。",
        risk: "LOW",
        operation: { op: "NORMALIZE_DATE", columns: dateColumns },
      });
    }
  }

  if (/(去重|重复)/i.test(normalizedGoal)) {
    const key = explicitKey || active.columns.find((column) => /订单号|编号|id$/i.test(column)) || active.columns[0];
    if (key) {
      steps.push({
        id: createId("step"),
        title: `按“${key}”去重`,
        reason: "删除重复键记录，默认保留首次出现的一条。",
        risk: "HIGH",
        operation: { op: "DEDUP", keys: [key], keep: /最新|最后/i.test(normalizedGoal) ? "LAST" : "FIRST" },
      });
    }
  }

  const formula = inferFormula(normalizedGoal, mergeColumnNames(active.columns, second?.columns || []));
  if (formula) {
    steps.push({
      id: createId("step"),
      title: `新增公式列“${formula.columnName}”`,
      reason: `使用 ${formula.expression} 生成可导出的 Excel 公式。`,
      risk: "LOW",
      operation: { op: "ADD_FORMULA_COLUMN", ...formula, emptyOnError: true },
    });
  }

  if (steps.length === 0) {
    const fallbackColumns = active.columns.filter((column) => /名称|姓名|客户|渠道|地区|地址|编号|号/i.test(column));
    steps.push({
      id: createId("step"),
      title: "规范化文本字段",
      reason: "当前请求信息较少，先进行不会删除数据的低风险清洗。",
      risk: "LOW",
      operation: { op: "TRIM", columns: fallbackColumns.length ? fallbackColumns : active.columns },
    });
  }

  return {
    id: createId("plan"),
    schemaVersion: "1.0",
    goal: normalizedGoal || "规范化当前数据",
    sourceId: active.id,
    createdAt: new Date().toISOString(),
    generatedBy: "LOCAL",
    steps,
  };
}

export function summarizeChange(before: RawRow[], after: RawRow[], warnings: string[] = []): ChangeSummary {
  const beforeColumns = columnsFromRows(before);
  const afterColumns = columnsFromRows(after);
  const maxRows = Math.max(before.length, after.length);
  const samples: ChangeSample[] = [];
  let changedRows = 0;

  for (let index = 0; index < maxRows; index += 1) {
    const left = before[index] || null;
    const right = after[index] || null;
    if (stableRow(left) !== stableRow(right)) {
      changedRows += 1;
      if (samples.length < 5) samples.push({ rowIndex: index, before: left, after: right });
    }
  }

  return {
    inputRows: before.length,
    outputRows: after.length,
    addedRows: Math.max(after.length - before.length, 0),
    removedRows: Math.max(before.length - after.length, 0),
    changedRows,
    addedColumns: afterColumns.filter((column) => !beforeColumns.includes(column)),
    removedColumns: beforeColumns.filter((column) => !afterColumns.includes(column)),
    samples,
    warnings,
  };
}

export function expressionColumns(expression: string): string[] {
  return Array.from(expression.matchAll(/\[([^\]]+)\]/g), (match) => match[1].trim()).filter(Boolean);
}

export function isValidArithmeticExpression(expression: string): boolean {
  if (!expression.trim() || expressionColumns(expression).length === 0) return false;
  const stripped = expression.replace(/\[[^\]]+\]/g, "1");
  return /^[\d\s.+\-*/()]+$/.test(stripped) && parenthesesBalanced(stripped);
}

export function formulaForExcelRow(expression: string, columns: string[], rowNumber: number): string {
  const converted = expression.replace(/\[([^\]]+)\]/g, (_match, column: string) => {
    const index = columns.indexOf(column.trim());
    if (index < 0) return "#REF!";
    return `${excelColumnName(index)}${rowNumber}`;
  });
  return `IFERROR(${converted},\"\")`;
}

function executeOperation(rows: RawRow[], operation: TransformOperation, sourceMap: Map<string, DataSource>) {
  switch (operation.op) {
    case "JOIN":
      return joinRows(rows, sourceMap.get(operation.rightSourceId)?.rows || [], operation);
    case "UNION": {
      const appended = operation.sourceIds.flatMap((id) => sourceMap.get(id)?.rows || []);
      const columns = mergeColumnNames(columnsFromRows(rows), columnsFromRows(appended));
      return { rows: [...rows, ...appended].map((row) => alignRow(row, columns)), warnings: [] as string[] };
    }
    case "TRIM":
      return {
        rows: rows.map((row) => mapColumns(row, operation.columns, (value) => (typeof value === "string" ? value.trim() : value))),
        warnings: [] as string[],
      };
    case "NORMALIZE_DATE":
      return {
        rows: rows.map((row) => mapColumns(row, operation.columns, normalizeDateValue)),
        warnings: [] as string[],
      };
    case "REPLACE":
      return {
        rows: rows.map((row) => ({
          ...row,
          [operation.column]: typeof row[operation.column] === "string"
            ? String(row[operation.column]).split(operation.find).join(operation.replaceWith)
            : row[operation.column],
        })),
        warnings: [] as string[],
      };
    case "DEDUP":
      return { rows: deduplicate(rows, operation.keys, operation.keep), warnings: [] as string[] };
    case "ADD_FORMULA_COLUMN":
      return {
        rows: rows.map((row) => ({ ...row, [operation.columnName]: `=${operation.expression}` })),
        warnings: [] as string[],
      };
  }
}

function joinRows(leftRows: RawRow[], rightRows: RawRow[], operation: JoinOperation) {
  const index = new Map<string, RawRow[]>();
  for (const row of rightRows) {
    const key = normalizeKey(row[operation.rightKey]);
    const list = index.get(key) || [];
    list.push(row);
    index.set(key, list);
  }

  const leftColumns = columnsFromRows(leftRows);
  const output: RawRow[] = [];
  let unmatched = 0;

  for (const left of leftRows) {
    const matches = index.get(normalizeKey(left[operation.leftKey])) || [];
    if (matches.length === 0) {
      unmatched += 1;
      if (operation.joinType === "LEFT") output.push({ ...left });
      continue;
    }
    for (const right of matches) {
      const merged: RawRow = { ...left };
      for (const column of operation.rightColumns) {
        const target = leftColumns.includes(column) ? `${column}（关联）` : column;
        merged[target] = right[column] ?? null;
      }
      output.push(merged);
    }
  }

  const warnings = unmatched > 0 ? [`${unmatched} 行未找到关联记录。`] : [];
  return { rows: output, warnings };
}

function deduplicate(rows: RawRow[], keys: string[], keep: "FIRST" | "LAST") {
  const source = keep === "LAST" ? [...rows].reverse() : rows;
  const seen = new Set<string>();
  const result = source.filter((row) => {
    const key = keys.map((column) => normalizeKey(row[column])).join("\u001f");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return keep === "LAST" ? result.reverse() : result;
}

function inferFormula(goal: string, columns: string[]) {
  const findColumn = (patterns: RegExp[]) => columns.find((column) => patterns.some((pattern) => pattern.test(column)));
  if (/实收|净收入/.test(goal)) {
    const amount = findColumn([/订单金额/, /销售额/, /收入/, /金额/]);
    const refund = findColumn([/退款金额/, /退款/]);
    if (amount && refund) return { columnName: /净收入/.test(goal) ? "净收入" : "实收金额", expression: `[${amount}]-[${refund}]` };
  }
  if (/毛利率/.test(goal)) {
    const revenue = findColumn([/销售额/, /收入/, /订单金额/]);
    const cost = findColumn([/成本/]);
    if (revenue && cost) return { columnName: "毛利率", expression: `([${revenue}]-[${cost}])/[${revenue}]` };
  }
  const explicit = goal.match(/(?:新增|生成|计算)([^=，,。]+?)(?:列)?\s*[=:：]\s*([^，,。]+)/);
  if (explicit && isValidArithmeticExpression(explicit[2])) {
    return { columnName: explicit[1].trim(), expression: explicit[2].trim().replace(/^=/, "") };
  }
  return null;
}

function findMentionedColumn(goal: string, columns: string[]) {
  return [...columns].sort((a, b) => b.length - a.length).find((column) => goal.includes(column));
}

function mapColumns(row: RawRow, columns: string[], mapper: (value: CellValue) => CellValue): RawRow {
  const output = { ...row };
  for (const column of columns) {
    if (column in output) output[column] = mapper(output[column]);
  }
  return output;
}

function normalizeDateValue(value: CellValue): CellValue {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatLocalDate(value);
  if (typeof value !== "string" && typeof value !== "number") return value;
  if (typeof value === "string") {
    const calendarDate = value.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (calendarDate) {
      const year = Number(calendarDate[1]);
      const month = Number(calendarDate[2]);
      const day = Number(calendarDate[3]);
      const candidate = new Date(Date.UTC(year, month - 1, day));
      if (candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day) {
        return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
      }
      return value;
    }
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatLocalDate(date);
}

function formatLocalDate(date: Date) {
  return `${date.getFullYear().toString().padStart(4, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

function countDuplicateKeys(rows: RawRow[], keys: string[]) {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of rows) {
    const key = keys.map((column) => normalizeKey(row[column])).join("\u001f");
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  return duplicates;
}

function columnsFromRows(rows: RawRow[]) {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const column of Object.keys(row)) {
      if (!seen.has(column)) {
        seen.add(column);
        columns.push(column);
      }
    }
  }
  return columns;
}

function mergeColumnNames(first: string[], second: string[]) {
  return Array.from(new Set([...first, ...second]));
}

function alignRow(row: RawRow, columns: string[]) {
  return Object.fromEntries(columns.map((column) => [column, row[column] ?? null])) as RawRow;
}

function normalizeKey(value: CellValue) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim().toLocaleLowerCase();
}

function cloneRows(rows: RawRow[]) {
  return rows.map((row) => ({ ...row }));
}

function stableRow(row: RawRow | null) {
  if (!row) return "";
  return JSON.stringify(Object.keys(row).sort().map((key) => [key, row[key] instanceof Date ? row[key].toISOString() : row[key]]));
}

function parenthesesBalanced(value: string) {
  let depth = 0;
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function excelColumnName(index: number) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function error(stepId: string, code: string, message: string): ValidationIssue {
  return { stepId, severity: "ERROR", code, message };
}

function createId(prefix: string) {
  const uuid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${uuid}`;
}
