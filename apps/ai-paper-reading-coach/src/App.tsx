import {
  AlertCircle,
  BookOpenText,
  Brain,
  CheckCircle2,
  FileText,
  HelpCircle,
  Layers3,
  Link,
  Loader2,
  Map,
  MessageSquareText,
  NotepadText,
  PanelLeft,
  Search,
  Sparkles,
  Upload,
  Wand2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CoachBlock,
  CoachOutput,
  CoachTask,
  ParsedPaper,
  PaperParagraph,
  Provider,
  UserLevel,
  defaultModels,
  evidenceLabels,
  isGptModel
} from "./shared/contracts";
import { buildPaperMapOutput } from "./shared/paperMap";
import { defaultSelectedParagraphId } from "./shared/paperSelection";
import {
  buildStudyNotebookMarkdown,
  createQaHistoryEntry,
  type QaHistoryEntry
} from "./shared/qaNotebook";

const sampleText = `Learning to Read Scientific Papers
Jane Doe, Max Researcher

Abstract
This paper studies how novice readers understand dense research articles. We introduce a guided reading workflow that breaks papers into claims, evidence, and review prompts.

1 Introduction
Reading papers is hard for new researchers because articles assume background knowledge. A coach can reduce confusion by naming the role of each section and showing the evidence behind each conclusion.

2 Method
We collected annotations from graduate students and compared guided reading against unguided reading. The workflow asks readers to identify the research question, method, experiment, result, limitation, and follow-up question.

3 Results
Participants using the coach produced more accurate summaries and asked more targeted follow-up questions. They also returned to source paragraphs more often during review.

4 Discussion
The workflow is most useful when readers can see uncertainty labels and source paragraphs. It is less useful when a paper is a scanned PDF without a text layer.
`;

type ApiState = "idle" | "loading" | "success" | "error";

type CoachResult = {
  data: CoachOutput;
  model: string;
};

type HubProvider = {
  id: Provider;
  name: string;
  defaultModel: string;
  models: string[];
  enabledModels: string[];
  enabled: boolean;
  configured: boolean;
};

type ProvidersResponse = {
  providers?: HubProvider[];
  configured?: boolean;
  hubUrl?: string;
  error?: string | { message?: string };
  message?: string;
};

const taskTabs: Array<{ id: CoachTask; label: string; icon: typeof Map }> = [
  { id: "paper_map", label: "论文地图", icon: Map },
  { id: "section_explain", label: "解释选段", icon: Brain },
  { id: "qa", label: "提问", icon: MessageSquareText },
  { id: "quiz", label: "复习包", icon: NotepadText }
];

const fallbackProvider: HubProvider = {
  id: "openai",
  name: "GPT · AI Routing",
  defaultModel: defaultModels.openai,
  models: [defaultModels.openai],
  enabledModels: [],
  enabled: false,
  configured: false
};

export default function App() {
  const [paper, setPaper] = useState<ParsedPaper | null>(null);
  const [textInput, setTextInput] = useState(sampleText);
  const [linkInput, setLinkInput] = useState("");
  const [selectedParagraphId, setSelectedParagraphId] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<HubProvider>(fallbackProvider);
  const [model, setModel] = useState(defaultModels.openai);
  const [hubUrl, setHubUrl] = useState("/hub/#models");
  const [configStatus, setConfigStatus] = useState<"loading" | "ready" | "error">("loading");
  const [configMessage, setConfigMessage] = useState("正在读取 Hub 模型配置...");
  const [userLevel, setUserLevel] = useState<UserLevel>("graduate");
  const [outputLanguage, setOutputLanguage] = useState<"zh-CN" | "en">("zh-CN");
  const [activeTask, setActiveTask] = useState<CoachTask>("paper_map");
  const [question, setQuestion] = useState("这篇论文的创新点在哪里？");
  const [result, setResult] = useState<CoachResult | null>(null);
  const [qaHistory, setQaHistory] = useState<QaHistoryEntry[]>([]);
  const [latestPaperMap, setLatestPaperMap] = useState<CoachOutput | null>(null);
  const [latestQuiz, setLatestQuiz] = useState<CoachOutput | null>(null);
  const [status, setStatus] = useState<ApiState>("idle");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProviders() {
      try {
        const response = await fetch(apiPath("/api/providers"), { cache: "no-store" });
        const payload = (await response.json()) as ProvidersResponse;
        if (!response.ok) {
          throw new Error(readResponseMessage(payload) || "读取 Hub 模型配置失败。");
        }

        const nextProvider = normalizeProvider(payload.providers);
        const ready = nextProvider.enabled && nextProvider.configured;
        const selectedModel = pickModel(nextProvider);

        if (cancelled) return;
        setSelectedProvider(nextProvider);
        setModel(selectedModel);
        setHubUrl(payload.hubUrl || "/hub/#models");
        setConfigStatus(ready ? "ready" : "error");
        setConfigMessage(
          ready
            ? `Hub 当前项目型号：${selectedModel}`
            : "请先在 AI Hub 配置 AI Routing Key，并在页面顶部为本项目选择 GPT 型号。"
        );
      } catch (error) {
        if (cancelled) return;
        setConfigStatus("error");
        setConfigMessage(error instanceof Error ? error.message : "读取 Hub 模型配置失败。");
        setSelectedProvider(fallbackProvider);
        setModel(defaultModels.openai);
      }
    }

    void loadProviders();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void parseText(sampleText, "sample-paper.txt");
  }, []);

  const selectedParagraph = useMemo(
    () => paper?.sections.flatMap((section) => section.paragraphs).find((paragraph) => paragraph.id === selectedParagraphId),
    [paper, selectedParagraphId]
  );
  const activeModel = model || pickModel(selectedProvider);
  const canUseModel = Boolean(selectedProvider.enabled && selectedProvider.configured && isGptModel(activeModel));

  const configLabel =
    configStatus === "loading"
      ? "读取 Hub 配置中"
      : canUseModel
        ? `Hub · ${activeModel}`
        : "Hub GPT 未就绪";

  async function parseText(text: string, sourceName = "pasted-text") {
    setStatus("loading");
    setStatusMessage("解析文本中");
    try {
      const payload = await postJson<{ paper: ParsedPaper }>("/api/parse-text", { text, sourceName });
      acceptPaper(payload.paper);
      setStatus("success");
      setStatusMessage("文本已解析");
    } catch (error) {
      showError(error);
    }
  }

  async function parsePdf(file: File) {
    setStatus("loading");
    setStatusMessage("解析 PDF 文本层中");
    try {
      const response = await fetch(apiPath("/api/parse-pdf"), {
        method: "POST",
        headers: {
          "content-type": "application/pdf",
          "x-file-name": encodeURIComponent(file.name)
        },
        body: file
      });
      const payload = await readResponse<{ paper: ParsedPaper }>(response);
      acceptPaper(payload.paper);
      setStatus("success");
      setStatusMessage("PDF 已解析");
    } catch (error) {
      showError(error);
    }
  }

  async function importLink() {
    if (!linkInput.trim()) return;
    setStatus("loading");
    setStatusMessage("导入链接中");
    try {
      const payload = await postJson<{ paper: ParsedPaper }>("/api/import-link", { url: linkInput });
      acceptPaper(payload.paper);
      setStatus("success");
      setStatusMessage("链接已导入");
    } catch (error) {
      showError(error);
    }
  }

  async function generate(task: CoachTask) {
    if (!paper) return;
    setActiveTask(task);

    if (!canUseModel) {
      setStatus("error");
      setStatusMessage("请先在页面顶部为本项目选择可用的 GPT 型号。");
      return;
    }

    setStatus("loading");
    setStatusMessage("Hub 当前 GPT 型号生成中");
    try {
      const payload = await postJson<{ data: CoachOutput }>("/api/generate", {
        provider: "openai",
        model: activeModel,
        task,
        input: buildModelInput(paper, selectedParagraph, question, userLevel, outputLanguage)
      });
      rememberGeneratedOutput(task, payload.data);
      setResult({ data: payload.data, model: activeModel });
      setStatus("success");
      setStatusMessage("生成完成");
    } catch (error) {
      showError(error);
    }
  }

  function acceptPaper(nextPaper: ParsedPaper) {
    setPaper(nextPaper);
    setSelectedParagraphId(defaultSelectedParagraphId(nextPaper));
    setResult(null);
    setQaHistory([]);
    setLatestPaperMap(null);
    setLatestQuiz(null);
  }

  function rememberGeneratedOutput(task: CoachTask, data: CoachOutput) {
    if (task === "paper_map") {
      setLatestPaperMap(data);
    }
    if (task === "quiz") {
      setLatestQuiz(data);
    }
    if (task === "qa") {
      setQaHistory((history) => [
        createQaHistoryEntry(question, data, {
          id: `qa-${Date.now()}`,
          createdAt: new Date().toISOString(),
          mode: "model"
        }),
        ...history
      ].slice(0, 12));
    }
  }

  function downloadStudyNotebook() {
    if (!paper) return;
    const paperMap = latestPaperMap || buildPaperMapOutput(paper);
    const quiz = latestQuiz || buildNotebookQuizFallback(paper);
    const markdown = buildStudyNotebookMarkdown({
      paperTitle: paper.meta.title,
      paperMap,
      qaHistory,
      quiz
    });

    downloadText(markdown, "paper-study-notes.md");
  }

  function showError(error: unknown) {
    setStatus("error");
    setStatusMessage(error instanceof Error ? error.message : "操作失败");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <BookOpenText size={22} />
          <div>
            <h1>AI · 论文阅读教练</h1>
            <span>{paper ? paper.meta.title : "等待导入论文"}</span>
          </div>
        </div>

        <div className="hub-status" aria-label="Hub 当前项目型号">
          <p>切换 GPT 型号请使用页面顶部统一模型选择器；项目内不再配置厂商、模型或 API Key。</p>
          <a className={`config-badge ${canUseModel ? "ready" : configStatus}`} href={hubUrl} title={configMessage}>
            {canUseModel ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {configLabel}
          </a>
        </div>
      </header>

      <section className="controlbar" aria-label="阅读选项">
        <Segmented
          value={userLevel}
          options={[
            ["beginner", "新手版"],
            ["graduate", "研究生版"],
            ["reviewer", "同行评审版"]
          ]}
          onChange={(value) => setUserLevel(value as UserLevel)}
        />
        <Segmented
          value={outputLanguage}
          options={[
            ["zh-CN", "中文"],
            ["en", "English"]
          ]}
          onChange={(value) => setOutputLanguage(value as "zh-CN" | "en")}
        />
        <StatusPill status={status} message={statusMessage} />
      </section>

      <div className="workspace">
        <aside className="left-pane" aria-label="论文导入与章节">
          <section className="import-area">
            <div className="pane-title">
              <PanelLeft size={18} />
              <h2>导入</h2>
            </div>
            <label className="file-drop">
              <Upload size={18} />
              <span>上传 PDF</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void parsePdf(file);
                }}
              />
            </label>
            <div className="link-row">
              <Link size={17} />
              <input
                value={linkInput}
                aria-label="论文链接"
                placeholder="DOI / arXiv / PDF 链接"
                onChange={(event) => setLinkInput(event.target.value)}
              />
              <button type="button" className="icon-button" onClick={importLink} title="导入链接" aria-label="导入链接">
                <Search size={17} />
              </button>
            </div>
            <textarea
              value={textInput}
              aria-label="粘贴论文文本"
              placeholder="也可以直接粘贴论文摘要或正文"
              onChange={(event) => setTextInput(event.target.value)}
            />
            <div className="button-row">
              <button type="button" onClick={() => parseText(textInput)} className="primary-action">
                <FileText size={17} />
                解析文本
              </button>
              <button type="button" onClick={() => parseText(sampleText, "sample-paper.txt")} className="secondary-action">
                <Sparkles size={17} />
                示例
              </button>
            </div>
          </section>

          <section className="sections-list">
            <div className="pane-title">
              <Layers3 size={18} />
              <h2>章节</h2>
            </div>
            {paper?.sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={section.paragraphs.some((paragraph) => paragraph.id === selectedParagraphId) ? "section-item active" : "section-item"}
                onClick={() => setSelectedParagraphId(section.paragraphs[0]?.id || "")}
              >
                <span>{section.title}</span>
                <small>{section.paragraphs.length} 段</small>
              </button>
            ))}
          </section>
        </aside>

        <section className="reader-pane" aria-label="论文阅读区">
          {paper ? (
            <>
              <div className="paper-head">
                <div>
                  <p className="eyebrow">Paper</p>
                  <h2>{paper.meta.title}</h2>
                  <span>{paper.meta.authors.join(", ") || paper.meta.sourceName || "本地文本"}</span>
                </div>
                <div className="stats-grid">
                  <Stat label="章节" value={paper.stats.sections} />
                  <Stat label="段落" value={paper.stats.paragraphs} />
                  <Stat label="字数" value={paper.stats.words} />
                </div>
              </div>

              <div className="paper-body">
                {paper.sections.map((section) => (
                  <article key={section.id} className="paper-section">
                    <header>
                      <h3>{section.title}</h3>
                      <p>{section.summary}</p>
                    </header>
                    {section.paragraphs.map((paragraph) => (
                      <button
                        key={paragraph.id}
                        type="button"
                        className={paragraph.id === selectedParagraphId ? "paragraph active" : "paragraph"}
                        onClick={() => setSelectedParagraphId(paragraph.id)}
                      >
                        <span>{paragraph.citation}</span>
                        <p>{paragraph.text}</p>
                      </button>
                    ))}
                  </article>
                ))}
              </div>
            </>
          ) : (
            <EmptyReader />
          )}
        </section>

        <aside className="coach-pane" aria-label="AI 教练">
          <div className="coach-tabs" role="tablist">
            {taskTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={activeTask === tab.id ? "active" : ""}
                  onClick={() => setActiveTask(tab.id)}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeTask === "qa" && (
            <label className="question-box">
              <span>问题</span>
              <textarea value={question} onChange={(event) => setQuestion(event.target.value)} />
            </label>
          )}

          <div className="selected-box">
            <span>当前选段</span>
            <p>{selectedParagraph ? `${selectedParagraph.citation} ${selectedParagraph.text}` : "未选择段落"}</p>
          </div>

          <button
            type="button"
            className="generate-button"
            onClick={() => generate(activeTask)}
            disabled={!paper || !canUseModel || status === "loading"}
          >
            {status === "loading" ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}
            调用 Hub 当前 GPT 型号
          </button>

          {activeTask === "qa" && (
            <QaHistoryPanel history={qaHistory} onDownload={downloadStudyNotebook} disabled={!paper} />
          )}

          {result ? <CoachOutputView output={result.data} model={result.model} /> : <CoachPlaceholder />}
        </aside>
      </div>
    </main>
  );
}

function Segmented({
  value,
  options,
  onChange
}: {
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented">
      {options.map(([id, label]) => (
        <button key={id} type="button" className={value === id ? "active" : ""} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function StatusPill({ status, message }: { status: ApiState; message: string }) {
  const icon = status === "loading" ? <Loader2 className="spin" size={16} /> : status === "error" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />;
  return <div className={`status-pill ${status}`}>{icon}{message || "待命"}</div>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function CoachOutputView({ output, model }: { output: CoachOutput; model: string }) {
  const sections = [
    { title: "教练要点", blocks: output.blocks },
    { title: "概念卡片", blocks: output.cards },
    { title: "理解题", blocks: output.questions },
    { title: "面试式问题", blocks: output.interviewQuestions }
  ].filter((section) => section.blocks.length > 0);
  const hasStructuredContent = sections.length > 0 || Boolean(output.notesMarkdown.trim());

  return (
    <div className="coach-output">
      <div className="output-head">
        <div>
          <p className="eyebrow">Hub · {model}</p>
          <h2>{output.title}</h2>
        </div>
        <button type="button" className="secondary-action compact" onClick={() => downloadMarkdown(output)}>
          <NotepadText size={16} />
          MD
        </button>
      </div>
      <p className="summary">{output.summary}</p>
      {!hasStructuredContent && (
        <div className="coach-placeholder compact">
          <Brain size={18} />
          <span>模型没有返回可展示的结构化内容</span>
        </div>
      )}
      {sections.map((section) => (
        <OutputGroup key={section.title} title={section.title} blocks={section.blocks} />
      ))}
      {output.notesMarkdown && (
        <section className="output-group">
          <div className="output-group-title">
            <h3>中文笔记</h3>
            <span>Markdown</span>
          </div>
          <pre className="notes-preview">{output.notesMarkdown}</pre>
        </section>
      )}
      {output.uncertainty.length > 0 && (
        <div className="uncertainty">
          <HelpCircle size={16} />
          <span>{output.uncertainty.join("；")}</span>
        </div>
      )}
    </div>
  );
}

function QaHistoryPanel({
  history,
  onDownload,
  disabled
}: {
  history: QaHistoryEntry[];
  onDownload: () => void;
  disabled: boolean;
}) {
  return (
    <section className="qa-history">
      <div className="output-group-title">
        <h3>问答历史</h3>
        <button type="button" className="secondary-action compact" onClick={onDownload} disabled={disabled}>
          <NotepadText size={16} />
          学习笔记
        </button>
      </div>
      {history.length === 0 ? (
        <p className="history-empty">提问后会在这里保留关键回答。</p>
      ) : (
        history.map((item, index) => (
          <details key={item.id} className="history-item" open={index === 0}>
            <summary>
              <span>{item.question}</span>
              <EvidenceTag evidence={item.evidence} />
            </summary>
            <p>{item.answer}</p>
            <small>{item.refs.length ? item.refs.join(" · ") : "暂无引用"}</small>
          </details>
        ))
      )}
    </section>
  );
}

function OutputGroup({ title, blocks }: { title: string; blocks: CoachBlock[] }) {
  return (
    <section className="output-group">
      <div className="output-group-title">
        <h3>{title}</h3>
        <span>{blocks.length}</span>
      </div>
      {blocks.map((block, index) => (
        <CoachBlockCard key={`${title}-${block.heading}-${index}`} block={block} />
      ))}
    </section>
  );
}

function CoachBlockCard({ block }: { block: CoachBlock }) {
  return (
    <article className="coach-block">
      <div>
        <h3>{block.heading}</h3>
        <EvidenceTag evidence={block.evidence} />
      </div>
      <p>{block.body}</p>
      {block.refs.length > 0 && <small>{block.refs.join(" · ")}</small>}
    </article>
  );
}

function EvidenceTag({ evidence }: { evidence: keyof typeof evidenceLabels }) {
  return <span className={`evidence ${evidence}`}>{evidenceLabels[evidence]}</span>;
}

function CoachPlaceholder() {
  return (
    <div className="coach-placeholder">
      <Brain size={20} />
      <span>等待生成</span>
    </div>
  );
}

function EmptyReader() {
  return (
    <div className="empty-reader">
      <FileText size={24} />
      <span>等待论文文本</span>
    </div>
  );
}

function buildModelInput(
  paper: ParsedPaper,
  selectedParagraph: PaperParagraph | undefined,
  userQuestion: string,
  userLevel: UserLevel,
  outputLanguage: "zh-CN" | "en"
) {
  const selectedWindow = selectContextWindow(paper, selectedParagraph);
  return {
    paperMeta: paper.meta,
    sectionSummaries: paper.sections.map((section) => ({
      id: section.id,
      title: section.title,
      role: section.role,
      summary: section.summary
    })),
    selectedText: selectedParagraph ? `${selectedParagraph.citation} ${selectedParagraph.text}` : undefined,
    surroundingContext: selectedWindow.map((paragraph) => `${paragraph.citation} [${paragraph.sectionTitle}] ${paragraph.text}`).join("\n\n"),
    userQuestion,
    userLevel,
    outputLanguage
  };
}

function selectContextWindow(paper: ParsedPaper, selectedParagraph: PaperParagraph | undefined) {
  const all = paper.sections.flatMap((section) => section.paragraphs);
  if (!selectedParagraph) return all.slice(0, 14);
  const index = all.findIndex((paragraph) => paragraph.id === selectedParagraph.id);
  return all.slice(Math.max(0, index - 2), Math.min(all.length, index + 4));
}

function buildNotebookQuizFallback(paper: ParsedPaper): CoachOutput {
  const abstract = findRole(paper, "abstract");
  const method = findRole(paper, "method") || findRole(paper, "experiment");
  const results = findRole(paper, "results");
  const concepts = paper.sections.slice(0, 10).map((section) => ({
    heading: section.title,
    body: section.summary,
    evidence: "based_on_text" as const,
    refs: firstRefs(section)
  }));
  const questions = ["研究问题是什么？", "方法如何支持结论？", "结果是否排除了替代解释？", "最大局限是什么？", "下一步实验可以怎么做？"].map((body) => ({
    heading: "理解题",
    body,
    evidence: "inferred" as const,
    refs: []
  }));
  return {
    title: "复习包",
    summary: "尚未通过 Hub 生成复习包，导出文件仅包含论文结构占位。",
    blocks: [],
    cards: concepts,
    questions,
    interviewQuestions: [],
    notesMarkdown: `# ${paper.meta.title}\n\n## 核心笔记\n\n- ${abstract?.summary || "待补摘要"}\n- ${method?.summary || "待补方法"}\n- ${results?.summary || "待补结果"}`,
    uncertainty: ["请通过 Hub 当前 GPT 型号生成正式复习包。"]
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(apiPath(url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return readResponse<T>(response);
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error?.message === "string" ? payload.error.message : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

function findRole(paper: ParsedPaper, role: string) {
  return paper.sections.find((section) => section.role === role);
}

function firstRefs(section: ParsedPaper["sections"][number] | undefined) {
  return section?.paragraphs.slice(0, 2).map((paragraph) => paragraph.citation) || [];
}

function normalizeProvider(providers?: HubProvider[]) {
  const provider = Array.isArray(providers) ? providers.find((item) => item.id === "openai") : undefined;
  if (!provider) return fallbackProvider;

  const enabledModels = uniqueStrings(provider.enabledModels || []).filter(isGptModel);
  const models = uniqueStrings([...enabledModels, ...(provider.models || []), provider.defaultModel]).filter(isGptModel);
  const defaultModel = isGptModel(provider.defaultModel)
    ? provider.defaultModel.trim()
    : enabledModels[0] || models[0] || defaultModels.openai;
  const ready = Boolean(provider.enabled && provider.configured && models.length);

  return {
    id: "openai" as const,
    name: provider.name || fallbackProvider.name,
    defaultModel,
    models: models.length ? models : [...fallbackProvider.models],
    enabledModels,
    enabled: ready,
    configured: ready
  };
}

function pickModel(provider: HubProvider) {
  return isGptModel(provider.defaultModel)
    ? provider.defaultModel.trim()
    : provider.enabledModels.find(isGptModel) || provider.models.find(isGptModel) || defaultModels.openai;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function readResponseMessage(payload: ProvidersResponse) {
  if (typeof payload.error === "object" && payload.error?.message) {
    return payload.error.message;
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }
  return "";
}

function apiPath(path: string) {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${basePath}${path}`;
}

function downloadMarkdown(output: CoachOutput) {
  const markdown = [
    `# ${output.title}`,
    "",
    output.summary,
    "",
    ...markdownBlockGroup("教练要点", output.blocks),
    ...markdownBlockGroup("概念卡片", output.cards),
    ...markdownBlockGroup("理解题", output.questions),
    ...markdownBlockGroup("面试式问题", output.interviewQuestions),
    output.notesMarkdown ? `## 中文笔记\n\n${output.notesMarkdown}` : "",
    ...markdownUncertainty(output.uncertainty)
  ]
    .filter(Boolean)
    .join("\n\n");
  downloadText(markdown, "paper-coach-notes.md");
}

function downloadText(markdown: string, filename: string) {
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function markdownBlockGroup(title: string, blocks: CoachBlock[]) {
  if (blocks.length === 0) return [];
  return [
    `## ${title}`,
    ...blocks.map((block, index) => {
      const refs = block.refs.length ? ` ${block.refs.join(" ")}` : "";
      return `### ${index + 1}. ${block.heading}\n\n${block.body}\n\n_${evidenceLabels[block.evidence]}${refs}_`;
    })
  ];
}

function markdownUncertainty(items: string[]) {
  if (items.length === 0) return [];
  return ["## 不确定性", ...items.map((item) => `- ${item}`)];
}
