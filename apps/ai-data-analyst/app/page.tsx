"use client";

import { ChangeEvent, ReactNode, useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import readXlsxFile from "read-excel-file";
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Brain,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  KeyRound,
  LineChart,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Table2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { ChartPanel } from "@/components/ChartPanel";
import {
  analyzeDataset,
  buildExecutiveReport,
  buildLlmAnalysisPacket,
  formatNumber,
  rowsFromGrid,
  type CellValue,
  type DatasetAnalysis,
  type ExecutiveReport,
  type RawRow,
} from "@/lib/data-analysis";
import type { HubProvider, Provider } from "@/lib/hub-models";
import { buildHubTrackPayload, type HubTrackInput } from "@/lib/hub-tracking";
import { defaultSampleDataset, sampleDatasets, type SampleDataset } from "@/lib/sample-datasets";

type View = "overview" | "charts" | "report" | "preview";

type ProvidersPayload = {
  providers: HubProvider[];
  configured: boolean;
  hubUrl: string;
};

type ApiError = {
  error: {
    code?: string;
    message: string;
  };
};

const viewTabs: Array<{ view: View; icon: LucideIcon; label: string }> = [
  { view: "overview", icon: FileSpreadsheet, label: "总览" },
  { view: "charts", icon: LineChart, label: "图表" },
  { view: "report", icon: FileText, label: "报告" },
  { view: "preview", icon: Table2, label: "预览" },
];

const providerDefaults: Record<Provider, string> = {
  routing: "gpt-5.4",
};

const fallbackProviders: HubProvider[] = [{
  id: "routing",
  name: "GPT · AI Routing",
  defaultModel: providerDefaults.routing,
  models: ["gpt-5.4"],
  enabledModels: [],
  enabled: false,
  configured: false,
}];

export default function Home() {
  const [rows, setRows] = useState<RawRow[]>(defaultSampleDataset.rows);
  const [fileName, setFileName] = useState(defaultSampleDataset.fileName);
  const [selectedSampleId, setSelectedSampleId] = useState(defaultSampleDataset.id);
  const [sourceLabel, setSourceLabel] = useState(`示例：${defaultSampleDataset.name}`);
  const [sourceKind, setSourceKind] = useState<"sample" | "upload">("sample");
  const [activeView, setActiveView] = useState<View>("overview");
  const [providers, setProviders] = useState<HubProvider[]>(fallbackProviders);
  const provider: Provider = "routing";
  const [model, setModel] = useState(providerDefaults.routing);
  const [hubUrl, setHubUrl] = useState("/hub/admin/");
  const [configError, setConfigError] = useState("");
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const [question, setQuestion] = useState("请生成一份面向业务负责人的中文分析报告，包含风险、异常解释和下一步行动建议。");
  const [llmReport, setLlmReport] = useState("");
  const [llmError, setLlmError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [fileError, setFileError] = useState("");
  const [uploadStatus, setUploadStatus] = useState(
    `已加载示例：${defaultSampleDataset.name}，${defaultSampleDataset.rows.length} 行、${countColumns(defaultSampleDataset.rows)} 个字段。`,
  );

  const analysis = useMemo(() => analyzeDataset(rows), [rows]);
  const executiveReport = useMemo(() => buildExecutiveReport(analysis), [analysis]);
  const llmPacket = useMemo(() => buildLlmAnalysisPacket(analysis), [analysis]);
  const selectedProvider = useMemo(
    () => providers.find((item) => item.id === provider) || providers[0],
    [provider, providers],
  );
  const modelOptions = useMemo(() => {
    if (!selectedProvider) return [];
    return selectedProvider.enabledModels.length ? selectedProvider.enabledModels : selectedProvider.models;
  }, [selectedProvider]);
  const canUseModel = Boolean(selectedProvider?.enabled && selectedProvider.configured && modelOptions.includes(model));

  useEffect(() => {
    let cancelled = false;

    async function loadProviders() {
      setIsConfigLoading(true);
      setConfigError("");
      try {
        const response = await fetch(apiPath("/api/providers"), { cache: "no-store" });
        const payload = (await response.json().catch(() => ({
          error: { message: "模型配置接口返回了无法识别的内容。" },
        }))) as ProvidersPayload | ApiError;

        if (!response.ok || "error" in payload) {
          throw new Error("error" in payload ? payload.error.message : "读取 Hub 模型配置失败。");
        }

        if (cancelled) return;

        const nextProviders = payload.providers.length ? payload.providers : fallbackProviders;
        const nextProvider =
          nextProviders.find((item) => item.id === provider && item.enabled && item.configured) ||
          nextProviders.find((item) => item.enabled && item.configured) ||
          nextProviders.find((item) => item.id === provider) ||
          nextProviders[0];

        setProviders(nextProviders);
        setModel(pickModel(nextProvider, model));
        setHubUrl(payload.hubUrl || "/hub/admin/");
      } catch (error) {
        if (!cancelled) {
          setConfigError(error instanceof Error ? error.message : "读取 Hub 模型配置失败。");
        }
      } finally {
        if (!cancelled) {
          setIsConfigLoading(false);
        }
      }
    }

    loadProviders();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileError("");
    setUploadStatus("");
    setLlmReport("");
    try {
      const parsedRows = await parseFile(file);
      if (parsedRows.length === 0) {
        setFileError("没有找到可用的数据行。");
        return;
      }
      setRows(parsedRows);
      setFileName(file.name);
      setSelectedSampleId("");
      setSourceLabel("上传文件");
      setSourceKind("upload");
      setUploadStatus(`上传成功：${file.name}，已解析 ${parsedRows.length} 行、${countColumns(parsedRows)} 个字段。`);
      setActiveView("overview");
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "文件解析失败。");
    } finally {
      event.target.value = "";
    }
  }

  function handleSampleSelect(sample: SampleDataset) {
    if (sourceKind === "upload" && rows.length > 0) {
      const shouldReplace = window.confirm("切换示例会替换当前上传的数据，是否继续？");
      if (!shouldReplace) return;
    }

    setRows(sample.rows);
    setFileName(sample.fileName);
    setSelectedSampleId(sample.id);
    setSourceLabel(`示例：${sample.name}`);
    setSourceKind("sample");
    setFileError("");
    setLlmError("");
    setLlmReport("");
    setUploadStatus(`已加载示例：${sample.name}，${sample.rows.length} 行、${countColumns(sample.rows)} 个字段。`);
    setActiveView("overview");
  }

  async function generateReport() {
    setLlmError("");
    if (!canUseModel) {
      setLlmError("请先在 Hub 完成模型配置，并选择已启用的模型。");
      return;
    }

    const startedAt = performance.now();
    let statusCode = 500;
    setIsGenerating(true);
    try {
      const response = await fetch(apiPath("/api/llm"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          question,
          analysis: llmPacket,
        }),
      });
      statusCode = response.status;
      const payload = await response.json().catch(() => ({
        error: { message: "模型接口返回了无法识别的内容。" },
      }));
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "模型请求失败。");
      }
      setLlmReport(payload.text);
      setActiveView("report");
      sendHubTrackEvent({
        eventType: "generate",
        statusCode: response.status,
        durationMs: performance.now() - startedAt,
      });
    } catch (error) {
      sendHubTrackEvent({
        eventType: "generate",
        statusCode,
        durationMs: performance.now() - startedAt,
      });
      setLlmError(error instanceof Error ? error.message : "模型请求失败。");
    } finally {
      setIsGenerating(false);
    }
  }

  function downloadMarkdown() {
    sendHubTrackEvent({ eventType: "export", statusCode: 200 });
    const report = buildMarkdownReport(analysis, executiveReport, llmReport || null, fileName, sourceLabel);
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName.replace(/\.[^.]+$/, "") || "analysis"}-分析报告.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="side-panel" aria-label="控制区">
          <div className="brand-row">
            <div className="brand-mark" aria-hidden="true">
              <BarChart3 size={22} />
            </div>
            <div>
              <h1>AI 数据分析师</h1>
              <p>{fileName}</p>
            </div>
          </div>

          <label className="upload-zone">
            <Upload size={24} aria-hidden="true" />
            <span>上传 CSV / Excel</span>
            <input aria-label="上传 CSV 或 Excel 文件" type="file" accept=".csv,.xlsx" onChange={handleFileChange} />
          </label>
          {fileError ? <p className="field-error">{fileError}</p> : null}
          {uploadStatus ? (
            <div className="upload-success" role="status">
              <CheckCircle2 size={15} />
              <span>{uploadStatus}</span>
            </div>
          ) : null}

          <div className="control-group">
            <div className="control-title">
              <FileSpreadsheet size={16} />
              <span>示例数据</span>
            </div>
            <div className="sample-grid" role="list">
              {sampleDatasets.map((sample) => (
                <button
                  key={sample.id}
                  className={selectedSampleId === sample.id ? "sample-button is-active" : "sample-button"}
                  type="button"
                  onClick={() => handleSampleSelect(sample)}
                >
                  <strong>{sample.name}</strong>
                  <span>{sample.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <div className="control-title">
              <KeyRound size={16} />
              <span>模型路由</span>
            </div>
            <div className="routing-provider" aria-label="统一模型入口">
              <div>
                <span>统一入口</span>
                <strong>{selectedProvider?.name || "AI Routing"}</strong>
              </div>
              <small className={canUseModel ? "is-ready" : ""}>{canUseModel ? "已就绪" : "未配置"}</small>
              <p>{canUseModel ? `当前项目型号：${model}` : "AI Hub 尚未就绪。"}</p>
            </div>
            <p className="field-hint">切换 GPT 型号请使用页面顶部的统一模型选择器；项目内不再配置厂商、模型或 API Key。</p>
            <div className={canUseModel ? "config-state is-ok" : "config-state"} role="status">
              {canUseModel ? <ShieldCheck size={16} /> : <AlertCircle size={16} />}
              <span>
                {isConfigLoading
                  ? "正在读取 Hub 模型配置..."
                  : canUseModel
                    ? `将通过 AI Routing 调用 ${model}，项目内不接触密钥。`
                    : "请先在 AI HUB 中配置 AI Routing Key，并为本项目选择 GPT 型号。"}
              </span>
              {!canUseModel && !isConfigLoading ? (
                <a href={hubUrl}>
                  去配置
                </a>
              ) : null}
            </div>
            {configError ? <p className="field-error">{configError}</p> : null}
          </div>

          <div className="control-group">
            <div className="control-title">
              <Brain size={16} />
              <span>追问</span>
            </div>
            <textarea aria-label="追问" value={question} onChange={(event) => setQuestion(event.target.value)} rows={5} />
            <button className="primary-button" type="button" onClick={generateReport} disabled={isGenerating || !canUseModel}>
              {isGenerating ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
              生成报告
            </button>
            {llmError ? <p className="field-error">{llmError}</p> : null}
          </div>

          <div className="trust-note">
            <ShieldCheck size={16} />
            <span>模型密钥只保存在 Hub 统一配置中，本项目不会接收或保存密钥。</span>
          </div>
        </aside>

        <section className="main-panel">
          <header className="top-bar">
            <div className="status-pill">
              <CheckCircle2 size={16} />
              <span>{analysis.rowCount} 行数据</span>
            </div>
            <div className="view-tabs" role="tablist" aria-label="分析视图">
              {viewTabs.map(({ view, icon: Icon, label }) => (
                <button
                  key={view}
                  type="button"
                  className={activeView === view ? "tab-button is-active" : "tab-button"}
                  onClick={() => setActiveView(view)}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
            <button className="icon-button" type="button" onClick={downloadMarkdown} aria-label="下载 Markdown 报告" title="下载 Markdown 报告">
              <Download size={18} />
            </button>
          </header>

          {activeView === "overview" ? <Overview analysis={analysis} /> : null}
          {activeView === "charts" ? <ChartsView analysis={analysis} /> : null}
          {activeView === "report" ? <ReportView executiveReport={executiveReport} llmReport={llmReport} /> : null}
          {activeView === "preview" ? <PreviewView analysis={analysis} /> : null}
        </section>
      </section>
    </main>
  );
}

function Overview({ analysis }: { analysis: DatasetAnalysis }) {
  const numericColumns = analysis.columns.filter((column) => column.type === "number").length;
  const dateColumns = analysis.columns.filter((column) => column.type === "date").length;

  return (
    <div className="view-stack">
      <section className="metric-grid">
        <MetricTile label="数据质量" value={`${analysis.qualityScore}/100`} icon={<ShieldCheck size={20} />} />
        <MetricTile label="字段数" value={String(analysis.columnCount)} icon={<Table2 size={20} />} />
        <MetricTile label="指标列" value={String(numericColumns)} icon={<BarChart3 size={20} />} />
        <MetricTile label="日期列" value={String(dateColumns)} icon={<LineChart size={20} />} />
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-heading">
            <h2>洞察</h2>
            <Sparkles size={18} />
          </div>
          <div className="item-list">
            {analysis.insights.map((insight) => (
              <div className="list-item" key={insight.id}>
                <h3>{insight.title}</h3>
                <p>{insight.detail}</p>
                <small>{insight.evidence}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <h2>异常点</h2>
            <AlertTriangle size={18} />
          </div>
          <div className="item-list">
            {analysis.anomalies.slice(0, 8).map((anomaly) => (
              <div className={`list-item severity-${anomaly.severity}`} key={anomaly.id}>
                <h3>{anomaly.title}</h3>
                <p>{anomaly.detail}</p>
              </div>
            ))}
            {analysis.anomalies.length === 0 ? <p className="empty-text">暂未发现异常标记。</p> : null}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>字段</h2>
          <RefreshCw size={18} />
        </div>
        <div className="column-grid">
          {analysis.columns.map((column) => (
            <div className="column-card" key={column.name}>
              <div className="column-card__top">
                <strong>{column.name}</strong>
                <span>{columnTypeLabel(column.type)}</span>
              </div>
              <div className="mini-bars">
                <span style={{ width: `${Math.round(column.missingRate * 100)}%` }} />
              </div>
              <small>{formatNumber(column.uniqueCount)} 个唯一值 · 缺失 {Math.round(column.missingRate * 100)}%</small>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ChartsView({ analysis }: { analysis: DatasetAnalysis }) {
  return (
    <div className="chart-grid">
      {analysis.charts.map((chart) => (
        <ChartPanel key={chart.id} chart={chart} />
      ))}
      {analysis.charts.length === 0 ? <div className="empty-panel">当前字段结构暂无可推荐图表。</div> : null}
    </div>
  );
}

function ReportView({ executiveReport, llmReport }: { executiveReport: ExecutiveReport; llmReport: string }) {
  return (
    <div className="report-layout">
      <article className="panel report-panel">
        <div className="panel-heading">
          <h2>执行摘要</h2>
          <FileText size={18} />
        </div>
        <div className="report-text">
          <h3>{executiveReport.health.label}</h3>
          <p>{executiveReport.summary}</p>
          <p>{executiveReport.health.detail}</p>
          <h3>关键发现</h3>
          <ul>
            {executiveReport.keyFindings.map((insight) => (
              <li key={insight.id}>
                <strong>{insight.title}：</strong>
                {insight.detail}
              </li>
            ))}
          </ul>
        </div>
        {llmReport ? (
          <div className="model-report">
            <h3>模型生成报告</h3>
            <pre className="report-text">{llmReport}</pre>
          </div>
        ) : null}
      </article>

      <article className="panel">
        <div className="panel-heading">
          <h2>图表解读</h2>
          <LineChart size={18} />
        </div>
        <div className="item-list">
          {executiveReport.chartNarratives.map((item) => (
            <div className="list-item" key={item.chartId}>
              <h3>{item.title}</h3>
              <p>{item.takeaway}</p>
              <small>{item.evidence}</small>
              <small>{item.nextQuestion}</small>
            </div>
          ))}
        </div>
      </article>

      <article className="panel">
        <div className="panel-heading">
          <h2>风险</h2>
          <AlertTriangle size={18} />
        </div>
        <div className="item-list">
          {executiveReport.risks.map((risk) => (
            <div className={`list-item severity-${risk.severity}`} key={`${risk.title}-${risk.detail}`}>
              <h3>{risk.title}</h3>
              <p>{risk.detail}</p>
              <small>{risk.evidence}</small>
            </div>
          ))}
        </div>
      </article>

      <article className="panel">
        <div className="panel-heading">
          <h2>行动</h2>
          <CheckCircle2 size={18} />
        </div>
        <div className="action-list">
          {executiveReport.actions.map((action) => (
            <div className="action-item" key={action.title}>
              <span className={`priority-badge priority-${action.priority}`}>{priorityLabel(action.priority)}</span>
              <div>
                <h3>{action.title}</h3>
                <p>{action.detail}</p>
                <small>{action.evidence}</small>
              </div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

function PreviewView({ analysis }: { analysis: DatasetAnalysis }) {
  const columns = analysis.columns.map((column) => column.name);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {analysis.previewRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => (
                <td key={column}>{formatCell(row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricTile({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <article className="metric-tile">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function countColumns(rows: RawRow[]): number {
  const columns = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((column) => columns.add(column));
  });
  return columns.size;
}

async function parseFile(file: File): Promise<RawRow[]> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".csv")) {
    return new Promise((resolve, reject) => {
      Papa.parse<CellValue[]>(file, {
        skipEmptyLines: true,
        complete: (result) => resolve(rowsFromGrid(result.data)),
        error: (error) => reject(error),
      });
    });
  }

  if (lowerName.endsWith(".xlsx")) {
    const grid = await readXlsxFile(file);
    return rowsFromGrid(grid as CellValue[][]);
  }

  throw new Error("暂不支持该文件类型，请上传 CSV 或 .xlsx。");
}

function buildMarkdownReport(
  analysis: DatasetAnalysis,
  executiveReport: ExecutiveReport,
  llmReport: string | null,
  fileName: string,
  sourceLabel: string,
): string {
  const lines = [
    `# ${fileName} 分析报告`,
    "",
    `- 数据来源：${sourceLabel}`,
    `- 行数：${analysis.rowCount}`,
    `- 字段数：${analysis.columnCount}`,
    `- 数据质量评分：${analysis.qualityScore}/100`,
    `- 重复行：${analysis.duplicateRowCount}`,
    "",
    "## 执行摘要",
    `**${executiveReport.health.label}**：${executiveReport.health.detail}`,
    "",
    executiveReport.summary,
    "",
    "## 关键发现",
    ...executiveReport.keyFindings.map((insight) => `- **${insight.title}：** ${insight.detail}（${insight.evidence}）`),
    "",
    "## 图表解读",
    ...executiveReport.chartNarratives.map((chart) => `- **${chart.title}：** ${chart.takeaway}（${chart.evidence}；${chart.nextQuestion}）`),
    "",
    "## 风险",
    ...executiveReport.risks.map((risk) => `- **${risk.title} [${riskSeverityLabel(risk.severity)}]：** ${risk.detail}（${risk.evidence}）`),
    "",
    "## 行动优先级",
    ...executiveReport.actions.map((action, index) => `${index + 1}. **${action.title} [${priorityLabel(action.priority)}]：** ${action.detail}（${action.evidence}）`),
  ];

  if (llmReport) {
    lines.push("", "## 模型生成报告", llmReport);
  }

  return `${lines.join("\n")}\n`;
}

function priorityLabel(priority: "high" | "medium" | "low"): string {
  return {
    high: "高",
    medium: "中",
    low: "低",
  }[priority];
}

function riskSeverityLabel(severity: "high" | "medium" | "low"): string {
  return {
    high: "高风险",
    medium: "中风险",
    low: "低风险",
  }[severity];
}

function pickModel(provider: HubProvider, currentModel?: string) {
  const models = (provider.enabledModels.length ? provider.enabledModels : provider.models).filter((item) => /^gpt-/i.test(item));
  if (currentModel && models.includes(currentModel)) {
    return currentModel;
  }
  return models[0] || provider.defaultModel || providerDefaults[provider.id];
}

function apiPath(path: string) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/data";
  return `${basePath}${path}`;
}

function sendHubTrackEvent(input: HubTrackInput) {
  const payload = buildHubTrackPayload(input);

  fetch("/hub/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

function formatCell(value: CellValue): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return String(value);
}

function columnTypeLabel(type: string): string {
  return {
    number: "数值",
    date: "日期",
    category: "类别",
    text: "文本",
    boolean: "布尔",
    empty: "空列",
  }[type] ?? type;
}
