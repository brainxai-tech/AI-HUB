export type CellValue = string | number | boolean | Date | null | undefined;

export type RawRow = Record<string, CellValue>;

export type ColumnType = "number" | "date" | "category" | "text" | "boolean" | "empty";

export type NumericStats = {
  min: number;
  max: number;
  mean: number;
  median: number;
  q1: number;
  q3: number;
  sum: number;
  standardDeviation: number;
};

export type TopValue = {
  value: string;
  count: number;
  share: number;
};

export type ColumnProfile = {
  name: string;
  type: ColumnType;
  rowCount: number;
  presentCount: number;
  missingCount: number;
  missingRate: number;
  uniqueCount: number;
  sampleValues: string[];
  topValues: TopValue[];
  stats?: NumericStats;
  dateRange?: {
    min: string;
    max: string;
  };
};

export type DataQualityIssue = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
};

export type Anomaly = {
  id: string;
  type: "outlier" | "missingness" | "duplicate" | "trend_shift" | "rare_category";
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
  column?: string;
  rowIndex?: number;
  value?: string | number;
};

export type ChartType = "line" | "bar" | "pie" | "histogram" | "scatter";

export type ChartRecommendation = {
  id: string;
  type: ChartType;
  title: string;
  xKey: string;
  yKey?: string;
  explanation: string;
  data: Array<Record<string, string | number>>;
};

export type Insight = {
  id: string;
  title: string;
  detail: string;
  evidence: string;
};

export type ExecutiveHealth = {
  score: number;
  label: string;
  detail: string;
};

export type ChartNarrative = {
  chartId: string;
  title: string;
  takeaway: string;
  evidence: string;
  nextQuestion: string;
};

export type ExecutiveRisk = {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  evidence: string;
};

export type ExecutiveAction = {
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
  evidence: string;
};

export type ExecutiveReport = {
  summary: string;
  health: ExecutiveHealth;
  keyFindings: Insight[];
  chartNarratives: ChartNarrative[];
  risks: ExecutiveRisk[];
  actions: ExecutiveAction[];
};

export type DatasetAnalysis = {
  rowCount: number;
  columnCount: number;
  columns: ColumnProfile[];
  previewRows: RawRow[];
  duplicateRowCount: number;
  qualityScore: number;
  qualityIssues: DataQualityIssue[];
  anomalies: Anomaly[];
  charts: ChartRecommendation[];
  insights: Insight[];
  recommendations: string[];
};

export type LlmAnalysisPacket = {
  rowCount: number;
  columnCount: number;
  qualityScore: number;
  columns: Array<{
    name: string;
    type: ColumnType;
    missingRate: number;
    uniqueCount: number;
    stats?: NumericStats;
    topValues: TopValue[];
    dateRange?: ColumnProfile["dateRange"];
  }>;
  anomalies: Anomaly[];
  qualityIssues: DataQualityIssue[];
  charts: Array<Pick<ChartRecommendation, "title" | "type" | "explanation" | "xKey" | "yKey" | "data">>;
  sourceRowsForAnomalies: Array<{
    rowIndex: number;
    row: RawRow;
  }>;
  deterministicInsights: Insight[];
  nextStepRecommendations: string[];
  executiveReport: ExecutiveReport;
};

const MISSING_STRINGS = new Set(["", "na", "n/a", "null", "undefined", "-", "--"]);
const MAX_PREVIEW_ROWS = 20;

export function rowsFromGrid(grid: CellValue[][]): RawRow[] {
  const firstNonEmpty = grid.findIndex((row) => row.some((cell) => !isMissing(cell)));
  if (firstNonEmpty < 0) {
    return [];
  }

  const headers = dedupeHeaders(grid[firstNonEmpty].map((cell, index) => {
    const label = stringifyCell(cell).trim();
    return label || `字段 ${index + 1}`;
  }));

  return grid.slice(firstNonEmpty + 1)
    .filter((row) => row.some((cell) => !isMissing(cell)))
    .map((row) => {
      const output: RawRow = {};
      headers.forEach((header, index) => {
        output[header] = normalizeCell(row[index]);
      });
      return output;
    });
}

export function analyzeDataset(rows: RawRow[]): DatasetAnalysis {
  const normalizedRows = normalizeRows(rows);
  const columns = getColumnNames(normalizedRows).map((name) => profileColumn(name, normalizedRows));
  const duplicateRowCount = countDuplicateRows(normalizedRows, columns.map((column) => column.name));
  const qualityIssues = buildQualityIssues(columns, normalizedRows.length, duplicateRowCount);
  const anomalies = detectAnomalies(normalizedRows, columns, duplicateRowCount);
  const charts = recommendCharts(normalizedRows, columns);
  const insights = generateInsights(normalizedRows, columns, charts, anomalies);
  const recommendations = generateRecommendations(columns, anomalies, charts);
  const qualityScore = computeQualityScore(columns, normalizedRows.length, duplicateRowCount, anomalies);

  return {
    rowCount: normalizedRows.length,
    columnCount: columns.length,
    columns,
    previewRows: normalizedRows.slice(0, MAX_PREVIEW_ROWS),
    duplicateRowCount,
    qualityScore,
    qualityIssues,
    anomalies,
    charts,
    insights,
    recommendations,
  };
}

export function buildLlmAnalysisPacket(analysis: DatasetAnalysis): LlmAnalysisPacket {
  return {
    rowCount: analysis.rowCount,
    columnCount: analysis.columnCount,
    qualityScore: analysis.qualityScore,
    columns: analysis.columns.map((column) => ({
      name: column.name,
      type: column.type,
      missingRate: round(column.missingRate, 4),
      uniqueCount: column.uniqueCount,
      stats: column.stats,
      topValues: column.topValues.slice(0, 8),
      dateRange: column.dateRange,
    })),
    qualityIssues: analysis.qualityIssues,
    anomalies: analysis.anomalies.slice(0, 20),
    charts: analysis.charts.map((chart) => ({
      title: chart.title,
      type: chart.type,
      explanation: chart.explanation,
      xKey: chart.xKey,
      yKey: chart.yKey,
      data: chart.data.slice(0, 20),
    })),
    sourceRowsForAnomalies: getSourceRowsForAnomalies(analysis),
    deterministicInsights: analysis.insights,
    nextStepRecommendations: analysis.recommendations,
    executiveReport: buildExecutiveReport(analysis),
  };
}

export function buildExecutiveReport(analysis: DatasetAnalysis): ExecutiveReport {
  const health = buildExecutiveHealth(analysis);
  const chartNarratives = analysis.charts.slice(0, 6).map(buildChartNarrative);
  const risks = buildExecutiveRisks(analysis);
  const actions = buildExecutiveActions(analysis, risks);

  return {
    summary: `共分析 ${analysis.rowCount} 行、${analysis.columnCount} 个字段，数据质量评分 ${analysis.qualityScore}/100；已生成 ${analysis.charts.length} 个图表、${analysis.insights.length} 条洞察和 ${analysis.anomalies.length} 个异常标记。`,
    health,
    keyFindings: analysis.insights.slice(0, 5),
    chartNarratives,
    risks,
    actions,
  };
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
  }).format(value);
}

function buildExecutiveHealth(analysis: DatasetAnalysis): ExecutiveHealth {
  if (analysis.qualityScore >= 85) {
    return {
      score: analysis.qualityScore,
      label: "可直接探索",
      detail: "数据完整性和异常负担较轻，适合直接进入趋势、分组和驱动因素分析。",
    };
  }

  if (analysis.qualityScore >= 70) {
    return {
      score: analysis.qualityScore,
      label: "可用但需复核",
      detail: "数据可以用于初步判断，但导出或对外汇报前应复核缺失值、重复行和异常点。",
    };
  }

  return {
    score: analysis.qualityScore,
    label: "先治理再决策",
    detail: "当前数据质量风险较高，应先完成清洗、口径确认和异常复核，再进入正式决策。",
  };
}

function buildChartNarrative(chart: ChartRecommendation): ChartNarrative {
  const first = chart.data[0];
  const last = chart.data[chart.data.length - 1];
  const measure = chart.yKey ?? "记录数";
  let takeaway = chart.explanation;
  let evidence = `${chart.data.length} 个图表数据点，字段：${chart.xKey}${chart.yKey ? ` / ${chart.yKey}` : ""}。`;
  let nextQuestion = "继续按关键分组拆解，确认是否存在业务口径差异或异常记录。";

  if ((chart.type === "line" || chart.type === "scatter") && first && last && chart.yKey) {
    const start = Number(first[chart.yKey]);
    const end = Number(last[chart.yKey]);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      const delta = end - start;
      takeaway = `${chart.title} 从 ${formatNumber(start)} 变为 ${formatNumber(end)}，${delta >= 0 ? "上升" : "下降"} ${formatNumber(Math.abs(delta))}。`;
      evidence = `首个点 ${formatNumber(start)}，末个点 ${formatNumber(end)}，共 ${chart.data.length} 个点。`;
      nextQuestion = "最大波动发生在哪个时间段，是否与活动、库存、渠道或外部事件有关？";
    }
  }

  if ((chart.type === "bar" || chart.type === "pie") && first) {
    const leader = String(first[chart.xKey]);
    const value = Number(first[measure]);
    takeaway = `${leader} 是 ${chart.title} 中最突出的分组。`;
    evidence = Number.isFinite(value)
      ? `${leader} 的 ${measure} 为 ${formatNumber(value)}，基于前 ${chart.data.length} 个分组。`
      : `${leader} 位于第一位，基于前 ${chart.data.length} 个分组。`;
    nextQuestion = `比较 ${leader} 与其他分组的成本、转化率或毛利，确认领先是否真正带来业务价值。`;
  }

  if (chart.type === "histogram" && first) {
    const highestBucket = chart.data.reduce((winner, point) => (
      Number(point.记录数) > Number(winner.记录数) ? point : winner
    ), first);
    takeaway = `${chart.title} 的样本主要集中在 ${String(highestBucket.区间)}。`;
    evidence = `该区间包含 ${formatNumber(Number(highestBucket.记录数))} 条记录。`;
    nextQuestion = "重点查看分布两端的样本，判断是否需要分层分析或异常处理。";
  }

  return {
    chartId: chart.id,
    title: chart.title,
    takeaway,
    evidence,
    nextQuestion,
  };
}

function buildExecutiveRisks(analysis: DatasetAnalysis): ExecutiveRisk[] {
  const risks: ExecutiveRisk[] = [
    ...analysis.qualityIssues.map((issue) => ({
      severity: issue.severity === "critical" ? "high" as const : issue.severity === "warning" ? "medium" as const : "low" as const,
      title: issue.title,
      detail: issue.detail,
      evidence: "来自数据质量扫描。",
    })),
    ...analysis.anomalies.map((anomaly) => ({
      severity: anomaly.severity === "high" ? "high" as const : anomaly.severity === "medium" ? "medium" as const : "low" as const,
      title: anomaly.title,
      detail: anomaly.detail,
      evidence: anomaly.column
        ? `字段 ${anomaly.column}${anomaly.value !== undefined ? `，值 ${String(anomaly.value)}` : ""}。`
        : "来自异常扫描。",
    })),
  ];

  const ordered = risks.sort((a, b) => riskRank(a.severity) - riskRank(b.severity));
  return ordered.length > 0
    ? ordered.slice(0, 6)
    : [{
      severity: "low",
      title: "暂无显著数据风险",
      detail: "当前未发现高优先级缺失、重复或离群标记。",
      evidence: `${analysis.rowCount} 行、${analysis.columnCount} 个字段通过基础扫描。`,
    }];
}

function buildExecutiveActions(analysis: DatasetAnalysis, risks: ExecutiveRisk[]): ExecutiveAction[] {
  const actions: ExecutiveAction[] = [];
  const blockingRisk = risks.find((risk) => risk.severity === "high" || risk.severity === "medium");
  const lineChart = analysis.charts.find((chart) => chart.type === "line");
  const barChart = analysis.charts.find((chart) => chart.type === "bar");

  if (blockingRisk) {
    actions.push({
      priority: "high",
      title: "先复核会影响判断的数据风险",
      detail: `优先处理「${blockingRisk.title}」，再把报告用于对外汇报或预算决策。`,
      evidence: blockingRisk.detail,
    });
  }

  if (lineChart) {
    actions.push({
      priority: "medium",
      title: "拆解趋势波动来源",
      detail: `围绕「${lineChart.title}」定位波峰、波谷和异常日期，再按渠道、地区或业务动作拆分。`,
      evidence: lineChart.explanation,
    });
  }

  if (barChart) {
    actions.push({
      priority: "medium",
      title: "验证头部分组的真实贡献",
      detail: `对「${barChart.title}」的头部分组补充成本、转化率或毛利口径，避免只看规模。`,
      evidence: barChart.explanation,
    });
  }

  actions.push({
    priority: "low",
    title: "沉淀下一版分析口径",
    detail: "把本次报告中的字段解释、异常处理口径和关键图表保存为团队复用模板。",
    evidence: `当前报告包含 ${analysis.insights.length} 条洞察和 ${analysis.charts.length} 个图表。`,
  });

  return actions.sort((a, b) => actionRank(a.priority) - actionRank(b.priority)).slice(0, 6);
}

function riskRank(severity: ExecutiveRisk["severity"]): number {
  return { high: 0, medium: 1, low: 2 }[severity];
}

function actionRank(priority: ExecutiveAction["priority"]): number {
  return { high: 0, medium: 1, low: 2 }[priority];
}

function getSourceRowsForAnomalies(analysis: DatasetAnalysis): Array<{ rowIndex: number; row: RawRow }> {
  const rowIndexes = [...new Set(analysis.anomalies
    .map((anomaly) => anomaly.rowIndex)
    .filter((rowIndex): rowIndex is number => typeof rowIndex === "number"))];

  return rowIndexes
    .slice(0, 10)
    .map((rowIndex) => ({
      rowIndex,
      row: analysis.previewRows[rowIndex] ?? {},
    }))
    .filter((item) => Object.keys(item.row).length > 0);
}

function normalizeRows(rows: RawRow[]): RawRow[] {
  const columns = getColumnNames(rows);
  return rows.map((row) => {
    const normalized: RawRow = {};
    columns.forEach((column) => {
      normalized[column] = normalizeCell(row[column]);
    });
    return normalized;
  });
}

function getColumnNames(rows: RawRow[]): string[] {
  const seen = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key);
      }
    });
  });
  return [...seen];
}

function dedupeHeaders(headers: string[]): string[] {
  const counts = new Map<string, number>();
  return headers.map((header, index) => {
    const base = header.trim() || `字段 ${index + 1}`;
    const next = (counts.get(base) ?? 0) + 1;
    counts.set(base, next);
    return next === 1 ? base : `${base} ${next}`;
  });
}

function normalizeCell(value: CellValue): CellValue {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return MISSING_STRINGS.has(trimmed.toLowerCase()) ? null : trimmed;
  }
  return value ?? null;
}

function isMissing(value: CellValue): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return MISSING_STRINGS.has(value.trim().toLowerCase());
  }
  return false;
}

function stringifyCell(value: CellValue): string {
  if (isMissing(value)) {
    return "";
  }
  if (value instanceof Date) {
    return formatDate(value);
  }
  return String(value);
}

function profileColumn(name: string, rows: RawRow[]): ColumnProfile {
  const values = rows.map((row) => row[name]);
  const presentValues = values.filter((value) => !isMissing(value));
  const missingCount = values.length - presentValues.length;
  const displayValues = presentValues.map(stringifyCell);
  const uniqueValues = new Set(displayValues);
  const type = inferColumnType(presentValues);

  const profile: ColumnProfile = {
    name,
    type,
    rowCount: values.length,
    presentCount: presentValues.length,
    missingCount,
    missingRate: values.length === 0 ? 0 : missingCount / values.length,
    uniqueCount: uniqueValues.size,
    sampleValues: [...uniqueValues].slice(0, 5),
    topValues: getTopValues(displayValues, values.length),
  };

  if (type === "number") {
    const numbers = presentValues.map(parseNumber).filter(isFiniteNumber);
    profile.stats = getNumericStats(numbers);
  }

  if (type === "date") {
    const dates = presentValues.map(parseDate).filter(isDate);
    if (dates.length > 0) {
      const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
      profile.dateRange = {
        min: formatDate(sorted[0]),
        max: formatDate(sorted[sorted.length - 1]),
      };
    }
  }

  return profile;
}

function inferColumnType(values: CellValue[]): ColumnType {
  if (values.length === 0) {
    return "empty";
  }

  const numberCount = values.map(parseNumber).filter(isFiniteNumber).length;
  const dateCount = values.map(parseDate).filter(isDate).length;
  const booleanCount = values.map(parseBoolean).filter((value) => value !== null).length;
  const uniqueCount = new Set(values.map(stringifyCell)).size;
  const presentCount = values.length;

  if (booleanCount / presentCount >= 0.85) {
    return "boolean";
  }
  if (dateCount / presentCount >= 0.8) {
    return "date";
  }
  if (numberCount / presentCount >= 0.85) {
    return "number";
  }
  if (uniqueCount <= Math.min(50, Math.max(8, Math.ceil(presentCount * 0.3)))) {
    return "category";
  }
  return "text";
}

function parseNumber(value: CellValue): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || looksDateLike(trimmed)) {
    return null;
  }

  const negative = /^\(.+\)$/.test(trimmed);
  const cleaned = trimmed
    .replace(/^[A-Z]{3}\s+/i, "")
    .replace(/[,$\s]/g, "")
    .replace(/%$/, "")
    .replace(/[()]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
}

function parseDate(value: CellValue): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string" || !looksDateLike(value)) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseBoolean(value: CellValue): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "n", "0"].includes(normalized)) {
    return false;
  }
  return null;
}

function looksDateLike(value: string): boolean {
  const trimmed = value.trim();
  return /(\d{4}[-/]\d{1,2})|(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})|([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/.test(trimmed);
}

function getTopValues(values: string[], totalRows: number): TopValue[] {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([value, count]) => ({
      value,
      count,
      share: totalRows === 0 ? 0 : count / totalRows,
    }));
}

function getNumericStats(values: number[]): NumericStats | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((total, value) => total + value, 0);
  const mean = sum / values.length;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: round(mean),
    median: round(quantile(sorted, 0.5)),
    q1: round(quantile(sorted, 0.25)),
    q3: round(quantile(sorted, 0.75)),
    sum: round(sum),
    standardDeviation: round(Math.sqrt(variance)),
  };
}

function getMedianAbsoluteDeviation(values: number[]): { median: number; mad: number } {
  if (values.length === 0) {
    return { median: 0, mad: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  const deviations = values.map((value) => Math.abs(value - median)).sort((a, b) => a - b);
  return {
    median,
    mad: quantile(deviations, 0.5),
  };
}

function quantile(sortedValues: number[], q: number): number {
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }
  const position = (sortedValues.length - 1) * q;
  const base = Math.floor(position);
  const remainder = position - base;
  const next = sortedValues[base + 1];
  return next === undefined ? sortedValues[base] : sortedValues[base] + remainder * (next - sortedValues[base]);
}

function countDuplicateRows(rows: RawRow[], columns: string[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  rows.forEach((row) => {
    const fingerprint = columns.map((column) => stringifyCell(row[column])).join("\u001f");
    if (seen.has(fingerprint)) {
      duplicates += 1;
    } else {
      seen.add(fingerprint);
    }
  });
  return duplicates;
}

function buildQualityIssues(columns: ColumnProfile[], rowCount: number, duplicateRowCount: number): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  if (rowCount === 0) {
    issues.push({
      id: "empty-dataset",
      severity: "critical",
      title: "没有可用数据行",
      detail: "文件中没有检测到非空的数据行。",
    });
  }

  columns
    .filter((column) => column.missingRate >= 0.25)
    .forEach((column) => {
      issues.push({
        id: `missing-${slug(column.name)}`,
        severity: column.missingRate >= 0.6 ? "critical" : "warning",
        title: `${column.name} 缺失较多`,
        detail: `${formatPercent(column.missingRate)} 的行在该字段为空。`,
      });
    });

  if (duplicateRowCount > 0) {
    issues.push({
      id: "duplicate-rows",
      severity: duplicateRowCount / Math.max(rowCount, 1) > 0.1 ? "warning" : "info",
      title: "发现重复行",
      detail: `有 ${duplicateRowCount} 行与前面的记录完全重复。`,
    });
  }

  return issues;
}

function detectAnomalies(rows: RawRow[], columns: ColumnProfile[], duplicateRowCount: number): Anomaly[] {
  const anomalies: Anomaly[] = [];

  if (duplicateRowCount > 0) {
    anomalies.push({
      id: "duplicate-row-anomaly",
      type: "duplicate",
      severity: duplicateRowCount / Math.max(rows.length, 1) > 0.1 ? "medium" : "low",
      title: "存在重复记录",
      detail: `有 ${duplicateRowCount} 行完全重复。做决策前请确认这是否符合业务预期。`,
    });
  }

  columns
    .filter((column) => column.missingRate >= 0.25)
    .forEach((column) => {
      anomalies.push({
        id: `missingness-${slug(column.name)}`,
        type: "missingness",
        severity: column.missingRate >= 0.6 ? "high" : "medium",
        title: `${column.name} 空值较多`,
        detail: `${formatPercent(column.missingRate)} 的缺失值可能影响分组或趋势分析。`,
        column: column.name,
      });
    });

  columns.filter((column) => column.type === "number" && column.stats).forEach((column) => {
    const stats = column.stats;
    if (!stats) {
      return;
    }
    const numericValues = rows.map((row) => parseNumber(row[column.name])).filter(isFiniteNumber);
    const madStats = getMedianAbsoluteDeviation(numericValues);
    const iqr = stats.q3 - stats.q1;
    const lowFence = iqr === 0 ? Number.NEGATIVE_INFINITY : stats.q1 - 1.5 * iqr;
    const highFence = iqr === 0 ? Number.POSITIVE_INFINITY : stats.q3 + 1.5 * iqr;
    rows.forEach((row, rowIndex) => {
      const value = parseNumber(row[column.name]);
      if (value === null) {
        return;
      }
      const modifiedZScore = madStats.mad === 0 ? 0 : 0.6745 * (value - madStats.median) / madStats.mad;
      const isIqrOutlier = value < lowFence || value > highFence;
      const isMadOutlier = Math.abs(modifiedZScore) >= 3.5;
      if (isIqrOutlier || isMadOutlier) {
        anomalies.push({
          id: `outlier-${slug(column.name)}-${rowIndex}`,
          type: "outlier",
          severity: Math.abs(modifiedZScore) >= 7 || value < stats.q1 - 3 * iqr || value > stats.q3 + 3 * iqr ? "high" : "medium",
          title: `${column.name} 存在离群值`,
          detail: `第 ${rowIndex + 1} 行的值为 ${formatNumber(value)}，超出稳健统计范围。`,
          column: column.name,
          rowIndex,
          value,
        });
      }
    });
  });

  detectTrendShifts(rows, columns).forEach((anomaly) => anomalies.push(anomaly));
  detectRareCategories(columns).forEach((anomaly) => anomalies.push(anomaly));

  return anomalies.slice(0, 50);
}

function detectTrendShifts(rows: RawRow[], columns: ColumnProfile[]): Anomaly[] {
  const dateColumn = columns.find((column) => column.type === "date");
  const numericColumn = columns.find((column) => column.type === "number");
  if (!dateColumn || !numericColumn) {
    return [];
  }

  const series = aggregateByDate(rows, dateColumn.name, numericColumn.name);
  if (series.length < 4) {
    return [];
  }

  const values = series.map((point) => Number(point[numericColumn.name]));
  const stats = getNumericStats(values);
  if (!stats || stats.standardDeviation === 0) {
    return [];
  }

  const anomalies: Anomaly[] = [];
  for (let index = 1; index < series.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    const delta = current - previous;
    const pctChange = Math.abs(delta) / Math.max(Math.abs(previous), 1);
    if (pctChange >= 0.75 && Math.abs(delta) >= stats.standardDeviation) {
      anomalies.push({
        id: `trend-shift-${index}`,
        type: "trend_shift",
        severity: pctChange >= 1.5 ? "high" : "medium",
        title: `${String(series[index].日期)} 出现明显${delta > 0 ? "上升" : "下降"}`,
        detail: `${numericColumn.name} 从 ${formatNumber(previous)} 变为 ${formatNumber(current)}。`,
        column: numericColumn.name,
        value: current,
      });
    }
  }

  return anomalies.slice(0, 5);
}

function detectRareCategories(columns: ColumnProfile[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  columns
    .filter((column) => column.type === "category" && column.presentCount >= 20)
    .forEach((column) => {
      const rareCount = Math.max(column.uniqueCount - column.topValues.length, 0);
      if (rareCount >= 10) {
        anomalies.push({
          id: `rare-category-${slug(column.name)}`,
          type: "rare_category",
          severity: "low",
          title: `${column.name} 存在长尾类别`,
          detail: `有 ${rareCount} 个类别值不在前 ${column.topValues.length} 名中，可考虑合并低频类别。`,
          column: column.name,
        });
      }
    });
  return anomalies;
}

function recommendCharts(rows: RawRow[], columns: ColumnProfile[]): ChartRecommendation[] {
  const dateColumn = columns.find((column) => column.type === "date");
  const numericColumns = columns.filter((column) => column.type === "number");
  const categoryColumns = columns.filter((column) => column.type === "category" || column.type === "boolean");
  const charts: ChartRecommendation[] = [];

  if (dateColumn && numericColumns[0]) {
    const measure = numericColumns[0];
    charts.push({
      id: `line-${slug(dateColumn.name)}-${slug(measure.name)}`,
      type: "line",
      title: `${measure.name} 时间趋势`,
      xKey: "日期",
      yKey: measure.name,
      explanation: `按 ${dateColumn.name} 汇总 ${measure.name}，用于观察趋势变化。`,
      data: aggregateByDate(rows, dateColumn.name, measure.name).slice(0, 120),
    });
  }

  if (categoryColumns[0] && numericColumns[0]) {
    const dimension = categoryColumns[0];
    const measure = numericColumns[0];
    charts.push({
      id: `bar-${slug(dimension.name)}-${slug(measure.name)}`,
      type: "bar",
      title: `${dimension.name} 的 ${measure.name} 排名`,
      xKey: dimension.name,
      yKey: measure.name,
      explanation: `按 ${dimension.name} 分组汇总 ${measure.name}，识别贡献最高的类别。`,
      data: aggregateByCategory(rows, dimension.name, measure.name).slice(0, 12),
    });
  }

  if (categoryColumns[0]) {
    const dimension = categoryColumns[0];
    charts.push({
      id: `pie-${slug(dimension.name)}`,
      type: "pie",
      title: `${dimension.name} 占比`,
      xKey: dimension.name,
      yKey: "记录数",
      explanation: `展示不同 ${dimension.name} 的记录分布。`,
      data: aggregateCounts(rows, dimension.name).slice(0, 10),
    });
  }

  if (numericColumns[0]) {
    const measure = numericColumns[0];
    charts.push({
      id: `histogram-${slug(measure.name)}`,
      type: "histogram",
      title: `${measure.name} 分布`,
      xKey: "区间",
      yKey: "记录数",
      explanation: `对 ${measure.name} 分箱，观察数据分布和偏态。`,
      data: buildHistogram(rows, measure.name),
    });
  }

  if (numericColumns.length >= 2) {
    charts.push({
      id: `scatter-${slug(numericColumns[0].name)}-${slug(numericColumns[1].name)}`,
      type: "scatter",
      title: `${numericColumns[0].name} 与 ${numericColumns[1].name} 的关系`,
      xKey: numericColumns[0].name,
      yKey: numericColumns[1].name,
      explanation: "比较两个数值字段，观察是否存在相关关系或异常组合。",
      data: rows
        .map((row) => ({
          [numericColumns[0].name]: parseNumber(row[numericColumns[0].name]) ?? 0,
          [numericColumns[1].name]: parseNumber(row[numericColumns[1].name]) ?? 0,
        }))
        .filter((point) => Number(point[numericColumns[0].name]) !== 0 || Number(point[numericColumns[1].name]) !== 0)
        .slice(0, 300),
    });
  }

  return charts.filter((chart) => chart.data.length > 0);
}

function aggregateByDate(rows: RawRow[], dateColumn: string, measureColumn: string): Array<Record<string, string | number>> {
  const buckets = new Map<string, number>();
  rows.forEach((row) => {
    const date = parseDate(row[dateColumn]);
    const value = parseNumber(row[measureColumn]);
    if (!date || value === null) {
      return;
    }
    const key = formatDate(date);
    buckets.set(key, (buckets.get(key) ?? 0) + value);
  });
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, total]) => ({
      日期: date,
      [measureColumn]: round(total),
    }));
}

function aggregateByCategory(rows: RawRow[], categoryColumn: string, measureColumn: string): Array<Record<string, string | number>> {
  const buckets = new Map<string, number>();
  rows.forEach((row) => {
    const category = stringifyCell(row[categoryColumn]) || "空值";
    const value = parseNumber(row[measureColumn]);
    if (value === null) {
      return;
    }
    buckets.set(category, (buckets.get(category) ?? 0) + value);
  });
  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, total]) => ({
      [categoryColumn]: category,
      [measureColumn]: round(total),
    }));
}

function aggregateCounts(rows: RawRow[], categoryColumn: string): Array<Record<string, string | number>> {
  const buckets = new Map<string, number>();
  rows.forEach((row) => {
    const category = stringifyCell(row[categoryColumn]) || "空值";
    buckets.set(category, (buckets.get(category) ?? 0) + 1);
  });
  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({
      [categoryColumn]: category,
      记录数: count,
    }));
}

function buildHistogram(rows: RawRow[], column: string): Array<Record<string, string | number>> {
  const values = rows.map((row) => parseNumber(row[column])).filter(isFiniteNumber);
  if (values.length === 0) {
    return [];
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [{ 区间: `${formatNumber(min)}`, 记录数: values.length }];
  }
  const bucketCount = Math.min(8, Math.max(4, Math.ceil(Math.sqrt(values.length))));
  const size = (max - min) / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    start: min + index * size,
    end: index === bucketCount - 1 ? max : min + (index + 1) * size,
    count: 0,
  }));
  values.forEach((value) => {
    const index = Math.min(Math.floor((value - min) / size), bucketCount - 1);
    buckets[index].count += 1;
  });
  return buckets.map((bucket) => ({
    区间: `${formatNumber(bucket.start)}-${formatNumber(bucket.end)}`,
    记录数: bucket.count,
  }));
}

function generateInsights(rows: RawRow[], columns: ColumnProfile[], charts: ChartRecommendation[], anomalies: Anomaly[]): Insight[] {
  const insights: Insight[] = [];
  const numericColumns = columns.filter((column) => column.type === "number" && column.stats);
  const categoryColumn = columns.find((column) => column.type === "category");

  if (columns.length > 0) {
    const missingCells = columns.reduce((total, column) => total + column.missingCount, 0);
    const totalCells = Math.max(rows.length * columns.length, 1);
    insights.push({
      id: "data-quality",
      title: "数据质量基线",
      detail: `数据集评分为 ${computeQualityScore(columns, rows.length, countDuplicateRows(rows, columns.map((column) => column.name)), anomalies)}/100，整体缺失单元格占比 ${formatPercent(missingCells / totalCells)}。`,
      evidence: `${rows.length} 行、${columns.length} 个字段、${anomalies.length} 个异常标记。`,
    });
  }

  if (categoryColumn && numericColumns[0]) {
    const aggregate = aggregateByCategory(rows, categoryColumn.name, numericColumns[0].name);
    if (aggregate.length >= 2) {
      const leader = aggregate[0];
      const runnerUp = aggregate[1];
      const leaderValue = Number(leader[numericColumns[0].name]);
      const runnerUpValue = Number(runnerUp[numericColumns[0].name]);
      insights.push({
        id: "top-segment",
        title: `${String(leader[categoryColumn.name])} 在 ${numericColumns[0].name} 上领先`,
        detail: `${String(leader[categoryColumn.name])} 贡献 ${formatNumber(leaderValue)}，比第二名高 ${formatNumber(leaderValue - runnerUpValue)}。`,
        evidence: `按 ${categoryColumn.name} 分组并汇总 ${numericColumns[0].name}。`,
      });
    }
  }

  if (numericColumns.length >= 2) {
    const correlation = computeCorrelation(rows, numericColumns[0].name, numericColumns[1].name);
    if (Math.abs(correlation) >= 0.55) {
      insights.push({
        id: "correlation",
        title: `${numericColumns[0].name} 与 ${numericColumns[1].name} 呈${correlation > 0 ? "正向" : "反向"}关系`,
        detail: `相关系数为 ${round(correlation, 2)}，值得继续按分组拆解验证。`,
        evidence: `基于两个字段均为数值的记录计算。`,
      });
    }
  }

  const highAnomaly = anomalies.find((anomaly) => anomaly.severity === "high");
  if (highAnomaly) {
    insights.push({
      id: "high-anomaly",
      title: highAnomaly.title,
      detail: highAnomaly.detail,
      evidence: highAnomaly.column ? `异常字段：${highAnomaly.column}。` : "由异常扫描识别。",
    });
  }

  if (charts.length > 0) {
    insights.push({
      id: "chart-coverage",
      title: "图表视图已生成",
      detail: `已生成 ${charts.length} 个图表视图，覆盖趋势、排行、分布、占比或关系分析。`,
      evidence: charts.map((chart) => chartTypeLabel(chart.type)).join("、"),
    });
  }

  return insights.slice(0, 8);
}

function generateRecommendations(columns: ColumnProfile[], anomalies: Anomaly[], charts: ChartRecommendation[]): string[] {
  const recommendations: string[] = [];
  const highMissing = columns.filter((column) => column.missingRate >= 0.25);
  if (highMissing.length > 0) {
    recommendations.push(`在用于决策前，先清洗或解释这些字段的缺失值：${highMissing.map((column) => column.name).join("、")}。`);
  }
  if (anomalies.some((anomaly) => anomaly.type === "outlier")) {
    recommendations.push("回到源记录核对数值离群点，再决定是否剔除、截尾或单独分组分析。");
  }
  if (charts.some((chart) => chart.type === "line")) {
    recommendations.push("对最大的趋势波动继续按渠道、地区或业务分组拆解，区分季节性和运营变化。");
  }
  if (columns.some((column) => column.type === "category") && columns.some((column) => column.type === "number")) {
    recommendations.push("把头部和尾部类别与花费、转化率、毛利或其他业务驱动因素进行对比。");
  }
  if (recommendations.length === 0) {
    recommendations.push("补充日期字段或业务结果字段，以解锁趋势、排行和驱动因素分析。");
  }
  recommendations.push("先审阅确定性图表和异常标记，再使用模型生成报告做对外表达。");
  return recommendations.slice(0, 6);
}

function computeQualityScore(columns: ColumnProfile[], rowCount: number, duplicateRowCount: number, anomalies: Anomaly[]): number {
  if (rowCount === 0 || columns.length === 0) {
    return 0;
  }
  const missingCells = columns.reduce((total, column) => total + column.missingCount, 0);
  const totalCells = rowCount * columns.length;
  const missingPenalty = (missingCells / totalCells) * 45;
  const duplicatePenalty = (duplicateRowCount / rowCount) * 25;
  const highAnomalyPenalty = anomalies.filter((anomaly) => anomaly.severity === "high").length * 4;
  const mediumAnomalyPenalty = anomalies.filter((anomaly) => anomaly.severity === "medium").length * 1.5;
  return Math.max(0, Math.round(100 - missingPenalty - duplicatePenalty - highAnomalyPenalty - mediumAnomalyPenalty));
}

function computeCorrelation(rows: RawRow[], firstColumn: string, secondColumn: string): number {
  const points = rows
    .map((row) => ({
      x: parseNumber(row[firstColumn]),
      y: parseNumber(row[secondColumn]),
    }))
    .filter((point): point is { x: number; y: number } => point.x !== null && point.y !== null);
  if (points.length < 3) {
    return 0;
  }
  const meanX = points.reduce((total, point) => total + point.x, 0) / points.length;
  const meanY = points.reduce((total, point) => total + point.y, 0) / points.length;
  const numerator = points.reduce((total, point) => total + (point.x - meanX) * (point.y - meanY), 0);
  const denominatorX = Math.sqrt(points.reduce((total, point) => total + (point.x - meanX) ** 2, 0));
  const denominatorY = Math.sqrt(points.reduce((total, point) => total + (point.y - meanY) ** 2, 0));
  return denominatorX === 0 || denominatorY === 0 ? 0 : numerator / (denominatorX * denominatorY);
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function chartTypeLabel(type: ChartType): string {
  return {
    line: "趋势",
    bar: "排行",
    pie: "占比",
    histogram: "分布",
    scatter: "关系",
  }[type];
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "field";
}

function isDate(value: Date | null): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isFiniteNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
