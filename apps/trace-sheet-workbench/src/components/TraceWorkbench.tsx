"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  ArrowRight,
  Braces,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Database,
  Download,
  FilePlus2,
  FileSpreadsheet,
  GitBranch,
  History,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { analyzeDataset, rowsFromGrid, type CellValue, type RawRow } from "@/lib/data-analysis";
import {
  buildLocalPlan,
  createInitialVersion,
  createSource,
  executePlan,
  formulaForExcelRow,
  normalizePlanRisks,
  planContextFromSources,
  previewPlan,
  sourceColumns,
  summarizeChange,
  validatePlan,
  type ChangeSummary,
  type DataSource,
  type DatasetVersion,
  type PlanExecution,
  type PlanStep,
  type TransformPlan,
  type ValidationIssue,
} from "@/lib/trace-workbench";

type View = "workbench" | "quality" | "history";

type StoredState = {
  sources: DataSource[];
  versions: DatasetVersion[];
  activeSourceId: string;
  currentVersionId: string;
};

const STORAGE_KEY = "trace-sheet-workbench-v1";
const API_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

const sampleSources: DataSource[] = [
  createSource({
    id: "source_orders_demo",
    name: "订单表",
    fileName: "示例订单.xlsx",
    sheetName: "订单",
    rows: [
      { 订单号: "A-1001", 日期: "2026/07/01", 客户: " 星河商店 ", 渠道: "平台", 订单金额: 1280, 成本: 760 },
      { 订单号: "A-1002", 日期: "2026-07-02", 客户: "山岚食品", 渠道: "搜索", 订单金额: 860, 成本: 520 },
      { 订单号: "A-1003", 日期: "2026.07.03", 客户: "远帆贸易", 渠道: "社媒", 订单金额: 2450, 成本: 1510 },
      { 订单号: "A-1003", 日期: "2026.07.03", 客户: "远帆贸易", 渠道: "社媒", 订单金额: 2450, 成本: 1510 },
      { 订单号: "A-1004", 日期: "2026/07/04", 客户: "青禾生活", 渠道: "平台", 订单金额: 4380, 成本: 2120 },
      { 订单号: "A-1005", 日期: "2026/07/05", 客户: "松果便利", 渠道: "邮件", 订单金额: 620, 成本: 410 },
    ],
  }),
  createSource({
    id: "source_refunds_demo",
    name: "退款表",
    fileName: "示例退款.xlsx",
    sheetName: "退款",
    rows: [
      { 订单号: "A-1001", 退款金额: 80, 退款原因: "部分缺货" },
      { 订单号: "A-1003", 退款金额: 300, 退款原因: "客户退货" },
      { 订单号: "A-1006", 退款金额: 120, 退款原因: "未匹配订单" },
    ],
  }),
];

const initialVersion: DatasetVersion = {
  id: "version_orders_demo",
  parentId: null,
  label: "源版本 · 订单表",
  createdAt: "2026-07-31T07:00:00.000Z",
  rows: sampleSources[0].rows.map((row) => ({ ...row })),
  sourceId: sampleSources[0].id,
};

const quickGoals = [
  "按订单号关联退款表，清理空格，统一日期并计算实收金额",
  "按订单号去重，保留第一条",
  "计算毛利率",
];

export function TraceWorkbench() {
  const [sources, setSources] = useState<DataSource[]>(sampleSources);
  const [activeSourceId, setActiveSourceId] = useState(sampleSources[0].id);
  const [versions, setVersions] = useState<DatasetVersion[]>([initialVersion]);
  const [currentVersionId, setCurrentVersionId] = useState(initialVersion.id);
  const [view, setView] = useState<View>("workbench");
  const [goal, setGoal] = useState(quickGoals[0]);
  const [plan, setPlan] = useState<TransformPlan | null>(null);
  const [preview, setPreview] = useState<PlanExecution | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [notice, setNotice] = useState("示例数据已就绪。可以直接生成计划，也可以上传自己的文件。");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPlanning, setIsPlanning] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [highRiskConfirmed, setHighRiskConfirmed] = useState(false);
  const [hasUserFiles, setHasUserFiles] = useState(false);
  const [isRestored, setIsRestored] = useState(false);

  const activeSource = sources.find((source) => source.id === activeSourceId) || sources[0];
  const currentVersion = versions.find((version) => version.id === currentVersionId)
    || versions.find((version) => version.sourceId === activeSourceId)
    || initialVersion;
  const currentRows = currentVersion?.rows || activeSource?.rows || [];
  const analysis = useMemo(() => analyzeDataset(currentRows), [currentRows]);
  const workingSources = useMemo(
    () => sources.map((source) => source.id === activeSourceId ? { ...source, rows: currentRows } : source),
    [sources, activeSourceId, currentRows],
  );
  const hasBlockingIssues = issues.some((issue) => issue.severity === "ERROR");
  const hasHighRisk = Boolean(plan?.steps.some((step) => step.risk === "HIGH"));

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as StoredState;
        if (parsed.sources?.length && parsed.versions?.length) {
          setSources(parsed.sources);
          setVersions(parsed.versions);
          setActiveSourceId(parsed.activeSourceId);
          setCurrentVersionId(parsed.currentVersionId);
          setHasUserFiles(!parsed.sources.every((source) => source.id.includes("_demo")));
          setNotice("已恢复上次的本地工作记录。");
        }
      }
    } catch {
      setNotice("本地历史无法恢复，已载入示例数据。");
    } finally {
      setIsRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!isRestored) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ sources, versions, activeSourceId, currentVersionId } satisfies StoredState));
    } catch {
      setNotice("数据量超过浏览器轻量存储上限；当前会话仍可使用，请及时导出。" );
    }
  }, [sources, versions, activeSourceId, currentVersionId, isRestored]);

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setIsUploading(true);
    setErrorMessage("");
    try {
      const parsed = (await Promise.all(files.map(parseWorkbook))).flat();
      if (!parsed.length) throw new Error("没有解析到可用工作表。" );
      const nextSources = hasUserFiles ? [...sources, ...parsed] : parsed;
      const roots = parsed.map(createInitialVersion);
      setSources(nextSources);
      setVersions(hasUserFiles ? [...versions, ...roots] : roots);
      setActiveSourceId(parsed[0].id);
      setCurrentVersionId(roots[0].id);
      setHasUserFiles(true);
      clearPlan();
      setNotice(`已载入 ${parsed.length} 个工作表，共 ${parsed.reduce((sum, source) => sum + source.rows.length, 0)} 行。`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "文件解析失败。" );
    } finally {
      setIsUploading(false);
    }
  }

  function selectSource(source: DataSource) {
    setActiveSourceId(source.id);
    const existingRoot = versions.find((version) => version.sourceId === source.id && version.parentId === null);
    if (existingRoot) {
      setCurrentVersionId(existingRoot.id);
    } else {
      const root = createInitialVersion(source);
      setVersions((items) => [...items, root]);
      setCurrentVersionId(root.id);
    }
    clearPlan();
  }

  async function generatePlan() {
    if (!goal.trim()) {
      setErrorMessage("请先描述希望完成的表格任务。" );
      return;
    }
    setIsPlanning(true);
    setErrorMessage("");
    setHighRiskConfirmed(false);
    try {
      const context = planContextFromSources(workingSources, activeSourceId);
      const response = await fetch(`${API_BASE_PATH}/api/plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal, context }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.plan) throw new Error(payload?.error?.message || "计划生成失败。" );
      applyGeneratedPlan(payload.plan as TransformPlan, payload.notice || (payload.mode === "AI" ? "AI 已生成结构化计划。" : "本地计划器已生成可复核步骤。"));
    } catch (error) {
      try {
        const fallback = buildLocalPlan(goal, planContextFromSources(workingSources, activeSourceId));
        applyGeneratedPlan(fallback, "模型服务暂不可用，已安全切换到本地计划器。" );
      } catch {
        setErrorMessage(error instanceof Error ? error.message : "计划生成失败。" );
      }
    } finally {
      setIsPlanning(false);
    }
  }

  function applyGeneratedPlan(nextPlan: TransformPlan, nextNotice: string) {
    const normalizedPlan = normalizePlanRisks(nextPlan);
    const nextIssues = validatePlan(normalizedPlan, workingSources);
    setPlan(normalizedPlan);
    setIssues(nextIssues);
    setNotice(nextNotice);
    try {
      setPreview(previewPlan(normalizedPlan, workingSources, currentVersion));
    } catch (error) {
      setPreview(null);
      setErrorMessage(error instanceof Error ? error.message : "无法生成差异预览。" );
    }
  }

  function removeStep(stepId: string) {
    if (!plan) return;
    const nextPlan = { ...plan, steps: plan.steps.filter((step) => step.id !== stepId) };
    if (!nextPlan.steps.length) {
      clearPlan();
      return;
    }
    applyGeneratedPlan(nextPlan, "已更新计划并重新计算预览。" );
  }

  function executeCurrentPlan() {
    if (!plan || !preview || hasBlockingIssues || (hasHighRisk && !highRiskConfirmed)) return;
    const committed = executePlan(plan, workingSources, currentVersion);
    const newVersions = committed.versions.slice(1);
    setVersions((items) => [...items, ...newVersions]);
    setCurrentVersionId(committed.finalVersion.id);
    setNotice(`已执行 ${plan.steps.length} 步并创建 ${newVersions.length} 个不可变版本。`);
    setPlan(null);
    setPreview(null);
    setIssues([]);
    setHighRiskConfirmed(false);
  }

  function checkoutVersion(version: DatasetVersion) {
    setCurrentVersionId(version.id);
    setActiveSourceId(version.sourceId);
    clearPlan();
    setView("workbench");
    setNotice(`已切换到“${version.label}”。后续执行会从该版本创建新分支。`);
  }

  function clearPlan() {
    setPlan(null);
    setPreview(null);
    setIssues([]);
    setHighRiskConfirmed(false);
  }

  function exportWorkbook() {
    const columns = sourceColumns({ rows: currentRows });
    const approvedFormulaColumns = new Set(
      versions
        .map((version) => version.operation?.operation)
        .filter((operation) => operation?.op === "ADD_FORMULA_COLUMN")
        .map((operation) => operation && operation.op === "ADD_FORMULA_COLUMN" ? operation.columnName : ""),
    );
    const sheet = XLSX.utils.aoa_to_sheet([
      columns,
      ...currentRows.map((row) => columns.map((column) => safeExportValue(row[column], approvedFormulaColumns.has(column)))),
    ]);
    currentRows.forEach((row, rowIndex) => {
      columns.forEach((column, columnIndex) => {
        const value = row[column];
        if (approvedFormulaColumns.has(column) && typeof value === "string" && value.startsWith("=")) {
          const address = XLSX.utils.encode_cell({ r: rowIndex + 1, c: columnIndex });
          sheet[address] = { t: "n", f: formulaForExcelRow(value.slice(1), columns, rowIndex + 2) };
        }
      });
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "清洗结果");
    XLSX.writeFile(workbook, `迹算-${activeSource?.name || "结果"}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportAudit() {
    const text = buildAuditMarkdown(activeSource, versions.filter((version) => version.sourceId === activeSourceId), currentVersion);
    downloadText(text, `迹算-${activeSource?.name || "项目"}-审计记录.md`, "text/markdown;charset=utf-8");
  }

  const sourceVersions = versions.filter((version) => version.sourceId === activeSourceId);
  const latestChange = currentVersion.change;

  return (
    <main className="trace-app">
      <header className="app-header">
        <div className="wordmark">
          <span className="wordmark__icon"><Braces size={21} /></span>
          <div><strong>迹算</strong><small>TRACE SHEET</small></div>
        </div>
        <nav className="main-nav" aria-label="主视图">
          <NavButton active={view === "workbench"} onClick={() => setView("workbench")} icon={<WandSparkles size={16} />} label="工作台" />
          <NavButton active={view === "quality"} onClick={() => setView("quality")} icon={<ShieldCheck size={16} />} label="质量与异常" />
          <NavButton active={view === "history"} onClick={() => setView("history")} icon={<History size={16} />} label="版本记录" />
        </nav>
        <div className="header-actions">
          <button className="button button--ghost" type="button" onClick={exportAudit}><Download size={16} />审计记录</button>
          <button className="button button--dark" type="button" onClick={exportWorkbook}><FileSpreadsheet size={16} />导出 Excel</button>
        </div>
      </header>

      <div className="trace-layout">
        <aside className="source-rail">
          <div className="rail-heading"><span>数据源</span><small>{sources.length}</small></div>
          <label className="upload-button">
            {isUploading ? <Loader2 className="spin" size={17} /> : <FilePlus2 size={17} />}
            <span>{isUploading ? "正在解析…" : "添加 Excel / CSV"}</span>
            <input type="file" accept=".xlsx,.csv" multiple onChange={handleFiles} disabled={isUploading} />
          </label>
          <div className="source-list">
            {sources.map((source) => (
              <button key={source.id} type="button" className={source.id === activeSourceId ? "source-item is-active" : "source-item"} onClick={() => selectSource(source)}>
                <span className="source-item__icon"><Table2 size={16} /></span>
                <span><strong>{source.name}</strong><small>{source.rows.length} 行 · {sourceColumns(source).length} 列</small></span>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
          <div className="rail-footer">
            <Database size={16} />
            <span>本地优先<br /><small>原文件不会被覆盖</small></span>
          </div>
        </aside>

        <section className="workspace-stage">
          <div className="dataset-header">
            <div>
              <div className="eyebrow">当前数据版本</div>
              <h1>{activeSource?.name || "未选择数据"}</h1>
              <p>{activeSource?.fileName} · {currentVersion.label}</p>
            </div>
            <div className="metric-strip">
              <Metric label="行数" value={analysis.rowCount.toLocaleString("zh-CN")} />
              <Metric label="字段" value={String(analysis.columnCount)} />
              <Metric label="质量" value={`${analysis.qualityScore}`} accent />
              <Metric label="异常" value={String(analysis.anomalies.length)} warn={analysis.anomalies.length > 0} />
            </div>
          </div>

          {errorMessage ? <div className="banner banner--error"><AlertTriangle size={17} />{errorMessage}</div> : null}
          {notice ? <div className="banner"><CircleDot size={15} />{notice}</div> : null}

          {view === "workbench" ? (
            <div className="workbench-grid">
              <section className="plan-column">
                <div className="section-label"><span>01</span><strong>描述任务</strong></div>
                <div className="prompt-card">
                  <textarea value={goal} onChange={(event) => setGoal(event.target.value)} rows={4} aria-label="自然语言任务" />
                  <div className="quick-goals">
                    {quickGoals.map((item) => <button type="button" key={item} onClick={() => setGoal(item)}>{item}</button>)}
                  </div>
                  <button className="button button--accent button--wide" type="button" onClick={generatePlan} disabled={isPlanning || !sources.length}>
                    {isPlanning ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
                    {isPlanning ? "正在编译计划…" : "生成可追溯计划"}
                  </button>
                </div>

                <div className="section-label"><span>02</span><strong>复核操作计划</strong><small>{plan ? `${plan.steps.length} 步` : "等待生成"}</small></div>
                <div className="step-list">
                  {plan?.steps.map((step, index) => (
                    <article className="step-card" key={step.id}>
                      <div className="step-index">{String(index + 1).padStart(2, "0")}</div>
                      <div className="step-body">
                        <div className="step-title"><strong>{step.title}</strong><RiskBadge risk={step.risk} /></div>
                        <p>{step.reason}</p>
                        <code>{operationSummary(step)}</code>
                      </div>
                      <button className="icon-action" type="button" aria-label={`移除${step.title}`} onClick={() => removeStep(step.id)}><Trash2 size={15} /></button>
                    </article>
                  ))}
                  {!plan ? <EmptyPlan /> : null}
                </div>
                {issues.length ? (
                  <div className="issue-list">
                    {issues.map((issue, index) => <div key={`${issue.code}-${index}`} className={issue.severity === "ERROR" ? "issue is-error" : "issue"}><AlertTriangle size={15} />{issue.message}</div>)}
                  </div>
                ) : null}
              </section>

              <section className="preview-column">
                <div className="section-label"><span>03</span><strong>差异预览</strong><small>执行前</small></div>
                {preview ? <PreviewPanel execution={preview} /> : <PreviewPlaceholder />}
                {plan && preview ? (
                  <div className="commit-panel">
                    <div><strong>确认后才会生成新版本</strong><p>原始文件保持不变，可随时切回任意历史节点。</p></div>
                    {hasHighRisk ? (
                      <label className="risk-confirm"><input type="checkbox" checked={highRiskConfirmed} onChange={(event) => setHighRiskConfirmed(event.target.checked)} /><span>我已复核高风险步骤的影响范围</span></label>
                    ) : null}
                    <button className="button button--dark button--wide" type="button" onClick={executeCurrentPlan} disabled={hasBlockingIssues || (hasHighRisk && !highRiskConfirmed)}><Play size={17} />确认并执行</button>
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}

          {view === "quality" ? <QualityView analysis={analysis} rows={currentRows} /> : null}
          {view === "history" ? <HistoryView versions={sourceVersions} currentId={currentVersionId} onCheckout={checkoutVersion} /> : null}
        </section>
      </div>
      {latestChange && view === "workbench" && !plan ? <div className="change-toast"><Check size={16} /><span>当前版本：{latestChange.changedRows} 行变化，{latestChange.addedColumns.length} 个新增字段</span></div> : null}
    </main>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button type="button" className={active ? "nav-button is-active" : "nav-button"} onClick={onClick}>{icon}{label}</button>;
}

function Metric({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return <div className={accent ? "metric is-accent" : warn ? "metric is-warn" : "metric"}><span>{label}</span><strong>{value}</strong></div>;
}

function RiskBadge({ risk }: { risk: PlanStep["risk"] }) {
  const labels = { LOW: "低风险", MEDIUM: "需复核", HIGH: "高风险" };
  return <span className={`risk risk--${risk.toLowerCase()}`}>{labels[risk]}</span>;
}

function EmptyPlan() {
  return <div className="empty-state"><WandSparkles size={26} /><strong>计划将在这里展开</strong><p>AI 只生成受限操作，数据由确定性引擎执行。</p></div>;
}

function PreviewPlaceholder() {
  return <div className="preview-placeholder"><ArrowRight size={28} /><strong>先生成计划，再查看影响</strong><p>系统会展示行数变化、新增字段、未匹配记录和前后样例。</p></div>;
}

function PreviewPanel({ execution }: { execution: PlanExecution }) {
  const summaries = execution.versions.slice(1).map((version) => version.change).filter(Boolean) as ChangeSummary[];
  const final = summarizeChange(execution.versions[0].rows, execution.finalVersion.rows, summaries.flatMap((summary) => summary.warnings));
  const samples = final?.samples || [];
  const columns = sourceColumns({ rows: execution.finalVersion.rows });
  return (
    <div className="preview-stack">
      <div className="diff-metrics">
        <DiffMetric label="结果行数" value={final?.outputRows || execution.finalVersion.rows.length} />
        <DiffMetric label="变化行" value={final.changedRows} />
        <DiffMetric label="新增字段" value={final.addedColumns.length} />
      </div>
      {final.warnings.map((warning) => <div className="join-warning" key={warning}><AlertTriangle size={15} />{warning}</div>)}
      <div className="table-frame">
        <table>
          <thead><tr><th>#</th>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>{execution.finalVersion.rows.slice(0, 8).map((row, rowIndex) => <tr key={rowIndex}><td>{rowIndex + 1}</td>{columns.map((column) => <td key={column}>{formatCell(row[column])}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {samples.length ? <p className="sample-note">已生成 {samples.length} 条前后差异样例；完整结果仅在确认后成为新版本。</p> : null}
    </div>
  );
}

function DiffMetric({ label, value }: { label: string; value: number }) {
  return <div><span>{label}</span><strong>{value.toLocaleString("zh-CN")}</strong></div>;
}

function QualityView({ analysis, rows }: { analysis: ReturnType<typeof analyzeDataset>; rows: RawRow[] }) {
  return (
    <div className="quality-layout">
      <section className="quality-score"><span>数据质量评分</span><strong>{analysis.qualityScore}</strong><p>基于缺失、重复、类型与异常的确定性计算</p></section>
      <section className="quality-panel"><div className="section-label"><span>A</span><strong>异常证据</strong><small>{analysis.anomalies.length}</small></div><div className="evidence-list">{analysis.anomalies.map((anomaly) => <article key={anomaly.id}><RiskBadge risk={anomaly.severity === "high" ? "HIGH" : anomaly.severity === "medium" ? "MEDIUM" : "LOW"} /><h3>{anomaly.title}</h3><p>{anomaly.detail}</p><small>{anomaly.column ? `字段：${anomaly.column}` : "数据集级异常"}{typeof anomaly.rowIndex === "number" ? ` · 源行：${anomaly.rowIndex + 1}` : ""}</small></article>)}{!analysis.anomalies.length ? <div className="empty-state"><ShieldCheck size={28} /><strong>暂未发现异常</strong></div> : null}</div></section>
      <section className="quality-panel"><div className="section-label"><span>B</span><strong>字段画像</strong><small>{analysis.columns.length}</small></div><div className="profile-list">{analysis.columns.map((column) => <div key={column.name}><span><strong>{column.name}</strong><small>{column.type} · {column.uniqueCount} 个唯一值</small></span><span className="missing-bar"><i style={{ width: `${Math.max(column.missingRate * 100, 2)}%` }} /></span><b>{Math.round(column.missingRate * 100)}% 缺失</b></div>)}</div></section>
      <section className="quality-panel quality-panel--wide"><div className="section-label"><span>C</span><strong>当前版本抽样</strong><small>{rows.length} 行</small></div><DataTable rows={rows.slice(0, 12)} /></section>
    </div>
  );
}

function HistoryView({ versions, currentId, onCheckout }: { versions: DatasetVersion[]; currentId: string; onCheckout: (version: DatasetVersion) => void }) {
  return (
    <div className="history-layout"><div className="history-intro"><GitBranch size={26} /><div><h2>不可变版本链</h2><p>每一步都保留输入、影响摘要和父版本。切回旧版本后再次执行，会创建新分支。</p></div></div><div className="timeline">{versions.map((version, index) => <article key={version.id} className={version.id === currentId ? "timeline-item is-current" : "timeline-item"}><div className="timeline-node">{version.id === currentId ? <Check size={15} /> : index + 1}</div><div className="timeline-card"><div><strong>{version.label}</strong><span>{version.operation ? operationSummary(version.operation) : "原始数据快照"}</span></div><div className="timeline-meta"><span><Clock3 size={14} />{new Date(version.createdAt).toLocaleString("zh-CN")}</span><span>{version.rows.length} 行</span>{version.change ? <span>{version.change.changedRows} 行变化</span> : null}</div>{version.change?.warnings.map((warning) => <p key={warning}>{warning}</p>)}<button type="button" className="button button--ghost" onClick={() => onCheckout(version)} disabled={version.id === currentId}><RotateCcw size={15} />{version.id === currentId ? "当前版本" : "切换到此版本"}</button></div></article>)}</div></div>
  );
}

function DataTable({ rows }: { rows: RawRow[] }) {
  const columns = sourceColumns({ rows });
  return <div className="table-frame"><table><thead><tr><th>#</th>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}><td>{rowIndex + 1}</td>{columns.map((column) => <td key={column}>{formatCell(row[column])}</td>)}</tr>)}</tbody></table></div>;
}

async function parseWorkbook(file: File): Promise<DataSource[]> {
  if (file.size > 50 * 1024 * 1024) throw new Error(`${file.name} 超过 50 MB 的 MVP 上限。`);
  const hash = await hashFile(file);
  if (file.name.toLowerCase().endsWith(".csv")) {
    const rows = await parseCsv(file);
    return [createSource({ name: stripExtension(file.name), fileName: file.name, sheetName: "CSV", rows, contentHash: hash })];
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error(`暂不支持 ${file.name}。`);
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  return workbook.SheetNames.map((sheetName) => {
    const grid = XLSX.utils.sheet_to_json<CellValue[]>(workbook.Sheets[sheetName], { header: 1, defval: null, raw: false }) as CellValue[][];
    return createSource({ name: workbook.SheetNames.length > 1 ? `${stripExtension(file.name)} · ${sheetName}` : stripExtension(file.name), fileName: file.name, sheetName, rows: rowsFromGrid(grid), contentHash: hash });
  }).filter((source) => source.rows.length > 0);
}

function parseCsv(file: File): Promise<RawRow[]> {
  return new Promise((resolve, reject) => Papa.parse<CellValue[]>(file, { skipEmptyLines: true, complete: (result) => resolve(rowsFromGrid(result.data)), error: reject }));
}

async function hashFile(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function operationSummary(step: PlanStep) {
  const operation = step.operation;
  switch (operation.op) {
    case "JOIN": return `LEFT JOIN · ${operation.leftKey} = ${operation.rightKey} · 引入 ${operation.rightColumns.length} 列`;
    case "UNION": return `UNION · 追加 ${operation.sourceIds.length} 个数据源`;
    case "TRIM": return `TRIM · ${operation.columns.join("、")}`;
    case "NORMALIZE_DATE": return `DATE YYYY-MM-DD · ${operation.columns.join("、")}`;
    case "REPLACE": return `REPLACE · ${operation.column} · “${operation.find}” → “${operation.replaceWith}”`;
    case "DEDUP": return `DEDUP · ${operation.keys.join("+")} · 保留${operation.keep === "FIRST" ? "第一条" : "最后一条"}`;
    case "ADD_FORMULA_COLUMN": return `${operation.columnName} = ${operation.expression}`;
  }
}

function safeExportValue(value: CellValue, isApprovedFormula: boolean) {
  if (value instanceof Date) return value;
  if (typeof value !== "string") return value ?? "";
  if (isApprovedFormula && value.startsWith("=")) return value;
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function formatCell(value: CellValue) {
  if (value === null || value === undefined || value === "") return <span className="null-cell">空</span>;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function buildAuditMarkdown(source: DataSource | undefined, versions: DatasetVersion[], current: DatasetVersion) {
  return [`# 迹算审计记录`, ``, `- 数据源：${source?.name || "未知"}`, `- 源文件：${source?.fileName || "未知"}`, `- 内容哈希：${source?.contentHash || "示例数据"}`, `- 当前版本：${current.label}`, `- 导出时间：${new Date().toLocaleString("zh-CN")}`, ``, `## 操作版本`, ``, ...versions.flatMap((version, index) => [`### ${index + 1}. ${version.label}`, ``, `- 版本 ID：${version.id}`, `- 父版本：${version.parentId || "无"}`, `- 创建时间：${version.createdAt}`, `- 行数：${version.rows.length}`, version.operation ? `- 操作：${operationSummary(version.operation)}` : `- 操作：原始快照`, version.change ? `- 变化：${version.change.changedRows} 行；新增 ${version.change.addedRows} 行；删除 ${version.change.removedRows} 行` : `- 变化：无`, ...(version.change?.warnings.map((warning) => `- 警告：${warning}`) || []), ``])].join("\n");
}

function downloadText(text: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}
