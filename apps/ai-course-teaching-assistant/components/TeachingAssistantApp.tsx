"use client";

import {
  BookOpen,
  CheckCircle2,
  Clipboard,
  Download,
  FileText,
  History,
  Loader2,
  Network,
  PanelRightOpen,
  Presentation,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { FormEvent, useEffect, useState, type ReactNode } from "react";

import {
  formatActivitiesMarkdown,
  formatMindMapMarkdown,
  formatLectureMarkdown,
  formatMistakesMarkdown,
  formatPptMarkdown,
  formatQuizMarkdown,
  formatWordDocumentMarkdown,
  outputFormatIds,
  type OutputFormatId,
  type ProviderId,
  type TeachingBundle,
  type TeachingRequest,
} from "@/lib/teaching";

type FormattedOutputTab = Exclude<OutputFormatId, "teaching_bundle">;
type DetailTab = "lecture" | "quiz" | "mistakes" | "activities";
type ArtifactTab = FormattedOutputTab | DetailTab;
type Drafts = Record<ArtifactTab, string>;

interface HistoryItem {
  id: string;
  title: string;
  createdAt: string;
  bundle: TeachingBundle;
}

interface HubProvider {
  id: ProviderId;
  label: string;
  defaultModel: string;
  models: string[];
  enabledModels: string[];
  enabled: boolean;
  configured: boolean;
}

const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");
const STORAGE_KEY = "ai-course-teaching-assistant-history";

const providerOptions: Array<{ id: ProviderId; label: string; model: string }> = [
  { id: "openai", label: "GPT · AI Routing", model: "gpt-5.4" },
];

function fallbackProviderCatalog(): HubProvider[] {
  return providerOptions.map((provider) => ({
    id: provider.id,
    label: provider.label,
    defaultModel: provider.model,
    models: [provider.model],
    enabledModels: [],
    enabled: false,
    configured: false,
  }));
}

function selectableModels(provider?: HubProvider) {
  if (!provider) return [];
  const models = provider.enabledModels.length ? provider.enabledModels : provider.models;
  return models.filter((model) => /^gpt-/i.test(model));
}

function isProviderReady(provider?: HubProvider) {
  return Boolean(provider?.enabled && provider.configured && selectableModels(provider).length);
}

const outputFormatOptions: Array<{ id: OutputFormatId; label: string; Icon: typeof BookOpen }> = [
  { id: "teaching_bundle", label: "教学包", Icon: BookOpen },
  { id: "word", label: "Word文档", Icon: FileText },
  { id: "ppt", label: "PPT课件", Icon: Presentation },
  { id: "mind_map", label: "思维导图", Icon: Network },
];

const difficultyOptions = ["入门", "基础巩固", "考试复习", "进阶应用", "企业培训"];
const styleOptions = ["讲练结合", "互动探究", "案例导入", "项目制", "讨论式"];
const durationOptions = [30, 40, 45, 50, 60, 90];

const initialRequest: TeachingRequest = {
  topic: "一次函数的图像与性质",
  audience: "初二学生",
  durationMinutes: 45,
  difficulty: "基础巩固",
  teachingStyle: "互动探究",
  quizCount: 5,
  provider: "openai",
  model: "gpt-5.4",
  outputFormat: "teaching_bundle",
  includeExamples: true,
  extraRequirements: "题目难度逐步递进，课堂活动要适合普通教室。",
};

const detailTabs: Array<{ id: DetailTab; label: string }> = [
  { id: "lecture", label: "讲义" },
  { id: "quiz", label: "测验" },
  { id: "mistakes", label: "错题解析" },
  { id: "activities", label: "教学活动" },
];

const formattedOutputTabs: Record<FormattedOutputTab, { id: FormattedOutputTab; label: string }> = {
  word: { id: "word", label: "Word文档" },
  ppt: { id: "ppt", label: "PPT课件" },
  mind_map: { id: "mind_map", label: "思维导图" },
};

const artifactTabLabels: Record<ArtifactTab, string> = {
  word: "Word文档",
  ppt: "PPT课件",
  mind_map: "思维导图",
  lecture: "讲义",
  quiz: "测验",
  mistakes: "错题解析",
  activities: "教学活动",
};

function clsx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function ensureOutputFormat(value: unknown): OutputFormatId {
  return outputFormatIds.includes(value as OutputFormatId) ? (value as OutputFormatId) : "teaching_bundle";
}

function preferredTabForOutputFormat(outputFormat: OutputFormatId): ArtifactTab {
  return outputFormat === "teaching_bundle" ? "lecture" : outputFormat;
}

function visibleTabsForOutputFormat(outputFormat: OutputFormatId): Array<{ id: ArtifactTab; label: string }> {
  if (outputFormat === "teaching_bundle") {
    return detailTabs;
  }

  return [formattedOutputTabs[outputFormat], ...detailTabs];
}

function normalizeBundleForHistory(bundle: TeachingBundle): TeachingBundle {
  return {
    ...bundle,
    request: {
      ...initialRequest,
      ...bundle.request,
      outputFormat: ensureOutputFormat(bundle.request.outputFormat),
    },
  };
}

function buildDrafts(bundle: TeachingBundle): Drafts {
  return {
    word: bundle.formattedOutputs?.word || formatWordDocumentMarkdown(bundle),
    ppt: bundle.formattedOutputs?.ppt || formatPptMarkdown(bundle),
    mind_map: bundle.formattedOutputs?.mindMap || formatMindMapMarkdown(bundle),
    lecture: formatLectureMarkdown(bundle.sections.lecture),
    quiz: formatQuizMarkdown(bundle.sections.quiz),
    mistakes: formatMistakesMarkdown(bundle.sections.mistakeAnalysis),
    activities: formatActivitiesMarkdown(bundle.sections.activities),
  };
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function TeachingAssistantApp() {
  const [input, setInput] = useState<TeachingRequest>(initialRequest);
  const [providers, setProviders] = useState<HubProvider[]>(fallbackProviderCatalog);
  const [modelConfigError, setModelConfigError] = useState("");
  const [bundle, setBundle] = useState<TeachingBundle | null>(null);
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [activeTab, setActiveTab] = useState<ArtifactTab>("lecture");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [copied, setCopied] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }

    try {
      return JSON.parse(stored);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      return [];
    }
  });

  useEffect(() => {
    let cancelled = false;

    async function loadProviders() {
      try {
        const response = await fetch(`${BASE_PATH}/api/providers`, { cache: "no-store" });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.message || "无法读取 Hub 模型配置。");
        }

        const nextProviders = Array.isArray(data.providers) ? (data.providers as HubProvider[]) : fallbackProviderCatalog();
        if (cancelled) return;

        setProviders(nextProviders);
        setModelConfigError("");
        setInput((current) => {
          const currentProvider = nextProviders.find((provider) => provider.id === current.provider);
          const nextProvider = isProviderReady(currentProvider)
            ? currentProvider
            : nextProviders.find(isProviderReady) || currentProvider || nextProviders[0];
          const models = selectableModels(nextProvider);
          return {
            ...current,
            provider: nextProvider?.id || current.provider,
            model: models.includes(current.model || "") ? current.model : models[0] || nextProvider?.defaultModel || current.model,
          };
        });
      } catch (error) {
        if (!cancelled) {
          setModelConfigError(error instanceof Error ? error.message : "无法读取 Hub 模型配置。");
        }
      }
    }

    loadProviders();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProvider = providers.find((provider) => provider.id === input.provider);
  const selectedProviderReady = isProviderReady(selectedProvider);
  const canGenerate = Boolean(input.topic.trim() && input.audience.trim() && input.quizCount >= 3 && selectedProviderReady && input.model);

  function updateInput<K extends keyof TeachingRequest>(key: K, value: TeachingRequest[K]) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  function setOutputFormat(outputFormat: OutputFormatId) {
    updateInput("outputFormat", outputFormat);
    setActiveTab(preferredTabForOutputFormat(outputFormat));
  }

  function persistHistory(nextBundle: TeachingBundle) {
    const item: HistoryItem = {
      id: nextBundle.id,
      title: nextBundle.request.topic,
      createdAt: nextBundle.createdAt,
      bundle: nextBundle,
    };
    const nextHistory = [item, ...history.filter((historyItem) => historyItem.id !== item.id)].slice(0, 10);
    setHistory(nextHistory);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextHistory));
  }

  async function generateBundle(event?: FormEvent) {
    event?.preventDefault();

    if (!canGenerate) {
      setError(
        selectedProviderReady
          ? "请补充知识点、授课对象和测验数量。"
          : "AI Hub 尚未就绪，请先完成统一 Key 配置并为本项目选择 GPT 型号。",
      );
      return;
    }

    setLoading(true);
    setError("");
    setWarning("");
    setCopied("");

    try {
      const response = await fetch(`${BASE_PATH}/api/teaching-bundles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "生成失败，请检查输入。");
      }

      const nextBundle = normalizeBundleForHistory(data.bundle);
      const outputFormat = ensureOutputFormat(nextBundle.request.outputFormat);

      setBundle(nextBundle);
      setDrafts(buildDrafts(nextBundle));
      setWarning(data.warning || "");
      setActiveTab(preferredTabForOutputFormat(outputFormat));
      persistHistory(nextBundle);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "生成失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  async function copyText(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  }

  function downloadMarkdown() {
    if (!bundle || !drafts) {
      return;
    }

    const blob = new Blob([drafts[activeTab]], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${bundle.request.topic}-${artifactTabLabels[activeTab]}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function restoreHistory(item: HistoryItem) {
    const restoredBundle = normalizeBundleForHistory(item.bundle);
    const outputFormat = ensureOutputFormat(restoredBundle.request.outputFormat);

    setInput(restoredBundle.request);
    setBundle(restoredBundle);
    setDrafts(buildDrafts(restoredBundle));
    setActiveTab(preferredTabForOutputFormat(outputFormat));
    setError("");
    setWarning("");
  }

  function resetWorkspace() {
    const provider = providers.find(isProviderReady) || providers[0];
    const models = selectableModels(provider);
    setInput({
      ...initialRequest,
      provider: provider?.id || initialRequest.provider,
      model: models[0] || provider?.defaultModel || initialRequest.model,
    });
    setBundle(null);
    setDrafts(null);
    setActiveTab("lecture");
    setError("");
    setWarning("");
  }

  const activeDraft = drafts?.[activeTab] || "";
  const selectedOutputFormat = ensureOutputFormat(input.outputFormat);
  const selectedOutputOption = outputFormatOptions.find((option) => option.id === selectedOutputFormat);
  const visibleTabs = visibleTabsForOutputFormat(selectedOutputFormat);

  return (
    <main className="min-h-screen px-4 py-5 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-ink/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-cypress/20 bg-white px-3 py-1 text-sm font-semibold text-cypress">
              <BookOpen size={16} />
              AI 课程助教
            </div>
            <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">教学包生成工作台</h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/12 bg-white px-3 text-sm font-semibold shadow-sm transition hover:border-ink/25"
              onClick={resetWorkspace}
              type="button"
            >
              <RotateCcw size={16} />
              重置
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-black disabled:cursor-not-allowed disabled:bg-ink/35"
              disabled={!canGenerate || loading}
              onClick={() => generateBundle()}
              type="button"
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
              生成{selectedOutputOption?.label || "教学包"}
            </button>
          </div>
        </header>

        <section className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)_320px]">
          <aside className="rounded-md border border-ink/10 bg-white p-4 shadow-panel">
            <div className="mb-4 flex items-center gap-2">
              <PanelRightOpen className="text-cypress" size={18} />
              <h2 className="text-lg font-semibold">教学 brief</h2>
            </div>

            <form className="space-y-4" onSubmit={generateBundle}>
              <Field label="知识点" required>
                <input
                  aria-label="知识点"
                  className="h-11 w-full rounded-md border border-ink/12 bg-white px-3 text-sm"
                  onChange={(event) => updateInput("topic", event.target.value)}
                  value={input.topic}
                />
              </Field>

              <Field label="授课对象" required>
                <input
                  aria-label="授课对象"
                  className="h-11 w-full rounded-md border border-ink/12 bg-white px-3 text-sm"
                  onChange={(event) => updateInput("audience", event.target.value)}
                  value={input.audience}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="课时">
                  <select
                    aria-label="课时"
                    className="h-11 w-full rounded-md border border-ink/12 bg-white px-3 text-sm"
                    onChange={(event) => updateInput("durationMinutes", Number(event.target.value))}
                    value={input.durationMinutes}
                  >
                    {durationOptions.map((duration) => (
                      <option key={duration} value={duration}>
                        {duration} 分钟
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="题量">
                  <input
                    aria-label="题量"
                    className="h-11 w-full rounded-md border border-ink/12 bg-white px-3 text-sm"
                    max={12}
                    min={3}
                    onChange={(event) => updateInput("quizCount", Number(event.target.value))}
                    type="number"
                    value={input.quizCount}
                  />
                </Field>
              </div>

              <Field label="难度">
                <SegmentedControl
                  options={difficultyOptions}
                  value={input.difficulty}
                  onChange={(value) => updateInput("difficulty", value)}
                />
              </Field>

              <Field label="教学风格">
                <SegmentedControl
                  options={styleOptions}
                  value={input.teachingStyle}
                  onChange={(value) => updateInput("teachingStyle", value)}
                />
              </Field>

              <Field label="输出形式">
                <div className="grid grid-cols-2 gap-2">
                  {outputFormatOptions.map(({ Icon, id, label }) => (
                    <button
                      aria-pressed={selectedOutputFormat === id}
                      className={clsx(
                        "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition",
                        selectedOutputFormat === id
                          ? "border-cypress bg-[#e8f3ef] text-cypress"
                          : "border-ink/12 bg-white text-ink/65 hover:border-ink/25",
                      )}
                      key={id}
                      onClick={() => setOutputFormat(id)}
                      type="button"
                    >
                      <Icon size={15} />
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Hub 模型">
                <p
                  className={clsx(
                    "mt-2 rounded-md border px-3 py-2 text-xs font-semibold leading-5",
                    selectedProviderReady
                      ? "border-cypress/25 bg-[#e8f3ef] text-cypress"
                      : "border-coral/25 bg-coral/10 text-coral",
                  )}
                >
                  {selectedProviderReady
                    ? `当前项目型号：${input.model}`
                    : modelConfigError || "AI Hub 尚未就绪，请先完成统一 Key 配置并为本项目选择 GPT 型号。"}
                </p>
                <p className="mt-2 text-xs leading-5 text-ink/55">
                  切换 GPT 型号请使用页面顶部的统一模型选择器；项目内不再配置厂商、模型或 API Key。
                </p>
                <a
                  className="mt-2 inline-flex min-h-11 items-center rounded-md border border-cypress/20 bg-[#e8f3ef] px-3 text-sm font-semibold text-cypress transition hover:border-cypress hover:no-underline"
                  href="/hub/#models"
                >
                  打开 Hub 模型配置
                </a>
              </Field>

              <label className="flex items-center gap-2 rounded-md border border-ink/10 bg-paper px-3 py-2 text-sm font-semibold">
                <input
                  aria-label="包含课堂例子"
                  checked={input.includeExamples}
                  className="h-4 w-4 accent-cypress"
                  onChange={(event) => updateInput("includeExamples", event.target.checked)}
                  type="checkbox"
                />
                包含课堂例子
              </label>

              <Field label="补充要求">
                <textarea
                  aria-label="补充要求"
                  className="min-h-24 w-full resize-none rounded-md border border-ink/12 bg-white px-3 py-2 text-sm leading-6"
                  onChange={(event) => updateInput("extraRequirements", event.target.value)}
                  value={input.extraRequirements || ""}
                />
              </Field>
            </form>
          </aside>

          <section className="rounded-md border border-ink/10 bg-white p-4 shadow-panel xl:min-h-[760px]">
            <div className="mb-4 flex flex-col gap-3 border-b border-ink/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold">生成结果</h2>
                <p className="mt-1 text-sm text-ink/55">
                  {bundle ? `${bundle.source} · ${bundle.model} · ${selectedOutputOption?.label}` : "等待生成"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-ink/12 bg-white px-3 text-sm font-semibold transition hover:border-cypress hover:text-cypress disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!bundle || !drafts}
                  onClick={() => drafts && copyText(artifactTabLabels[activeTab], activeDraft)}
                  type="button"
                >
                  <Clipboard size={15} />
                  复制当前
                </button>
                <button
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-ink/12 bg-white px-3 text-sm font-semibold transition hover:border-cypress hover:text-cypress disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!bundle || !drafts}
                  onClick={downloadMarkdown}
                  type="button"
                >
                  <Download size={15} />
                  下载当前
                </button>
                <button
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-cypress px-3 text-sm font-semibold text-white transition hover:bg-cypress/90 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!canGenerate || loading}
                  onClick={() => generateBundle()}
                  type="button"
                >
                  {loading ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
                  重新生成
                </button>
              </div>
            </div>

            {error ? (
              <div className="mb-4 rounded-md border border-coral/25 bg-coral/10 px-4 py-3 text-sm font-medium text-coral">
                {error}
              </div>
            ) : null}

            {warning ? (
              <div className="mb-4 rounded-md border border-gold/30 bg-gold/10 px-4 py-3 text-sm font-medium text-ink/75">
                {warning}
              </div>
            ) : null}

            {loading && !bundle ? (
              <EmptyState loading />
            ) : bundle && drafts ? (
              <div className="space-y-4">
                <div
                  className={clsx(
                    "grid rounded-md border border-ink/10 bg-paper p-1",
                    visibleTabs.length > 4 ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4",
                  )}
                >
                  {visibleTabs.map((tab) => (
                    <button
                      className={clsx(
                        "h-10 rounded text-sm font-semibold transition",
                        activeTab === tab.id
                          ? "bg-white text-cypress shadow-sm"
                          : "text-ink/55 hover:bg-white/70 hover:text-ink",
                      )}
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      type="button"
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <textarea
                  aria-label={`${artifactTabLabels[activeTab]}编辑区`}
                  className="scrollbar-thin min-h-[540px] w-full resize-y rounded-md border border-ink/12 bg-paper/80 px-4 py-3 font-mono text-sm leading-7 text-ink"
                  onChange={(event) =>
                    setDrafts((current) => (current ? { ...current, [activeTab]: event.target.value } : current))
                  }
                  value={activeDraft}
                />
              </div>
            ) : (
              <EmptyState />
            )}
          </section>

          <aside className="flex flex-col gap-5">
            <section className="rounded-md border border-ink/10 bg-white p-4 shadow-panel">
              <div className="mb-4 flex items-center gap-2">
                <CheckCircle2 className="text-cypress" size={18} />
                <h2 className="text-lg font-semibold">质量检查</h2>
              </div>
              {bundle ? (
                <div className="space-y-3">
                  {bundle.qualityChecks.map((item) => (
                    <div className="rounded-md bg-paper px-3 py-2 text-sm leading-6 text-ink/72" key={item}>
                      {item}
                    </div>
                  ))}
                  <div className="border-t border-ink/10 pt-3">
                    <h3 className="mb-2 text-sm font-semibold">老师备注</h3>
                    <ul className="space-y-2 text-sm leading-6 text-ink/65">
                      {bundle.teacherNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-ink/15 px-4 py-8 text-center text-sm leading-6 text-ink/48">
                  生成后显示一致性、答案和人工审核提醒。
                </div>
              )}
            </section>

            <section className="rounded-md border border-ink/10 bg-white p-4 shadow-panel">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="text-slate" size={18} />
                  <h2 className="text-lg font-semibold">历史</h2>
                </div>
                <span className="rounded-md bg-paper px-2.5 py-1 text-xs font-semibold text-ink/55">
                  {history.length}/10
                </span>
              </div>
              {history.length ? (
                <div className="scrollbar-thin max-h-[420px] space-y-3 overflow-auto pr-1">
                  {history.map((item) => (
                    <button
                      className="block w-full rounded-md border border-ink/10 bg-paper p-3 text-left transition hover:border-cypress/35"
                      key={item.id}
                      onClick={() => restoreHistory(item)}
                      type="button"
                    >
                      <span className="block text-sm font-semibold leading-6">{item.title}</span>
                      <span className="mt-1 block text-xs text-ink/45">{formatTime(item.createdAt)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-ink/15 px-4 py-8 text-center text-sm leading-6 text-ink/48">
                  本机保留最近 10 份教学包。
                </div>
              )}
            </section>
          </aside>
        </section>
      </div>

      {copied ? (
        <div className="fixed bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white shadow-panel">
          已复制{copied}
        </div>
      ) : null}
    </main>
  );
}

function Field({ children, label, required }: { children: ReactNode; label: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-sm font-semibold text-ink/85">
        {label}
        {required ? <span className="text-coral">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function SegmentedControl({
  onChange,
  options,
  value,
}: {
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((option) => (
        <button
          aria-pressed={value === option}
          className={clsx(
            "min-h-10 rounded-md border px-3 text-sm font-semibold transition",
            value === option
              ? "border-cypress bg-[#e8f3ef] text-cypress"
              : "border-ink/12 bg-white text-ink/65 hover:border-ink/25",
          )}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ loading }: { loading?: boolean }) {
  return (
    <div className="flex min-h-[540px] items-center justify-center rounded-md border border-dashed border-ink/15 bg-paper p-8 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-cypress/10 text-cypress">
          {loading ? <Loader2 className="animate-spin" size={22} /> : <Sparkles size={22} />}
        </div>
        <h3 className="text-lg font-semibold">{loading ? "生成中" : "等待教学包"}</h3>
        <p className="mt-2 text-sm leading-6 text-ink/55">
          {loading ? "正在整理讲义、测验、错题解析和教学活动。" : "生成后可在这里编辑、复制和下载。"}
        </p>
      </div>
    </div>
  );
}
