"use client";

import {
  Clipboard,
  History,
  Loader2,
  PenLine,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type {
  CopyLength,
  CopywritingInput,
  CopywritingResult,
  CopywritingType,
  HistoryItem,
} from "@/lib/types";

const STORAGE_KEY = "xhs-copywriting-master-history";
const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");

const copyTypes: CopywritingType[] = [
  "种草",
  "测评",
  "探店",
  "教程",
  "清单",
  "避坑",
  "引流",
];

const lengths: CopyLength[] = ["短", "中", "长"];
const tones = ["真诚口语", "专业克制", "轻松活泼", "高级质感", "干货清单"];
const optimizeModes = ["更口语", "更种草", "更高级", "更短", "标题更抓人"];

const initialInput: CopywritingInput = {
  topic: "春夏通勤防晒霜种草",
  productName: "",
  sellingPoints: "清爽不黏、通勤补涂方便、适合日常防晒",
  targetAudience: "上班族和学生党",
  scenario: "早八通勤、办公室、午休外出",
  tone: "真诚口语",
  type: "种草",
  length: "中",
  forbiddenWords: "最强、永久、百分百、治疗",
  extraRequirements: "",
};

function clsx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function Home() {
  const [input, setInput] = useState<CopywritingInput>(initialInput);
  const [result, setResult] = useState<CopywritingResult | null>(null);
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
  const [loadingMode, setLoadingMode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [source, setSource] = useState<"mock" | "ai" | null>(null);

  const canGenerate = useMemo(
    () =>
      Boolean(
        input.topic.trim() &&
          input.sellingPoints.trim() &&
          input.targetAudience.trim(),
      ),
    [input.sellingPoints, input.targetAudience, input.topic],
  );

  function updateInput<K extends keyof CopywritingInput>(
    key: K,
    value: CopywritingInput[K],
  ) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  function persistHistory(nextResult: CopywritingResult) {
    const item: HistoryItem = {
      id: nextResult.id,
      title: nextResult.titles[0] || nextResult.input.topic,
      createdAt: nextResult.createdAt,
      result: nextResult,
    };
    const nextHistory = [
      item,
      ...history.filter((historyItem) => historyItem.id !== item.id),
    ].slice(0, 12);
    setHistory(nextHistory);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextHistory));
  }

  async function generateCopy(optimizeMode?: string) {
    if (!canGenerate) {
      setError("请先填写主题、卖点和目标人群。");
      return;
    }

    setError("");
    setCopied("");
    setLoadingMode(optimizeMode || "生成文案");

    try {
      const response = await fetch(`${BASE_PATH}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          existing: result,
          optimizeMode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "生成失败，请稍后重试。");
      }

      setResult(data.result);
      setSource(data.source);
      persistHistory(data.result);
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "生成失败，请稍后重试。",
      );
    } finally {
      setLoadingMode(null);
    }
  }

  async function copyText(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1800);
  }

  function restoreHistory(item: HistoryItem) {
    setInput(item.result.input);
    setResult(item.result);
    setSource(null);
    setError("");
  }

  function deleteHistory(id: string) {
    const nextHistory = history.filter((item) => item.id !== id);
    setHistory(nextHistory);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextHistory));
  }

  function resetForm() {
    setInput(initialInput);
    setResult(null);
    setError("");
    setSource(null);
  }

  return (
    <main className="min-h-screen px-4 py-5 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-black/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-xhs/20 bg-white/75 px-3 py-1 text-sm font-medium text-xhs">
              <Sparkles size={16} />
              AI 文案工作台
            </div>
            <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
              小红书文案写作大师
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-black/62 sm:text-base">
              输入主题、卖点和人群，快速生成标题、正文、标签和发布建议。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-sm font-medium shadow-sm transition hover:border-black/24"
              onClick={resetForm}
              type="button"
            >
              <RotateCcw size={16} />
              重置
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-black disabled:cursor-not-allowed disabled:bg-black/35"
              disabled={!canGenerate || Boolean(loadingMode)}
              onClick={() => generateCopy()}
              type="button"
            >
              {loadingMode === "生成文案" ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Wand2 size={16} />
              )}
              生成文案
            </button>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[390px_minmax(0,1fr)_310px]">
          <aside className="rounded-lg border border-black/10 bg-white/88 p-4 shadow-soft">
            <div className="mb-4 flex items-center gap-2">
              <PenLine className="text-xhs" size={18} />
              <h2 className="text-lg font-semibold">输入 brief</h2>
            </div>

            <form className="space-y-4" onSubmit={(event: FormEvent) => {
              event.preventDefault();
              generateCopy();
            }}>
              <Field label="主题" required>
                <input
                  className="h-11 w-full rounded-md border border-black/12 bg-white px-3 text-sm"
                  onChange={(event) => updateInput("topic", event.target.value)}
                  placeholder="例如：春夏通勤防晒霜种草"
                  value={input.topic}
                />
              </Field>

              <Field label="产品/服务名称">
                <input
                  className="h-11 w-full rounded-md border border-black/12 bg-white px-3 text-sm"
                  onChange={(event) =>
                    updateInput("productName", event.target.value)
                  }
                  placeholder="可选"
                  value={input.productName}
                />
              </Field>

              <Field label="核心卖点" required>
                <textarea
                  className="min-h-24 w-full resize-none rounded-md border border-black/12 bg-white px-3 py-2 text-sm leading-6"
                  onChange={(event) =>
                    updateInput("sellingPoints", event.target.value)
                  }
                  placeholder="写出 2-4 个关键卖点"
                  value={input.sellingPoints}
                />
              </Field>

              <Field label="目标人群" required>
                <input
                  className="h-11 w-full rounded-md border border-black/12 bg-white px-3 text-sm"
                  onChange={(event) =>
                    updateInput("targetAudience", event.target.value)
                  }
                  placeholder="例如：新手妈妈、学生党、上班族"
                  value={input.targetAudience}
                />
              </Field>

              <Field label="使用场景">
                <input
                  className="h-11 w-full rounded-md border border-black/12 bg-white px-3 text-sm"
                  onChange={(event) =>
                    updateInput("scenario", event.target.value)
                  }
                  placeholder="例如：通勤、旅行、约会、居家"
                  value={input.scenario}
                />
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="文案类型">
                  <select
                    aria-label="文案类型"
                    className="h-11 w-full rounded-md border border-black/12 bg-white px-3 text-sm"
                    onChange={(event) =>
                      updateInput("type", event.target.value as CopywritingType)
                    }
                    value={input.type}
                  >
                    {copyTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </Field>

                <FieldGroup label="字数">
                  <div
                    aria-label="字数"
                    className="grid min-h-14 grid-cols-3 gap-1 rounded-md border border-black/12 bg-white p-1"
                    role="group"
                  >
                    {lengths.map((length) => (
                      <button
                        aria-pressed={input.length === length}
                        className={clsx(
                          "min-h-11 rounded text-sm font-medium transition",
                          input.length === length
                            ? "bg-xhs text-white"
                            : "text-black/58 hover:bg-black/5",
                        )}
                        key={length}
                        onClick={() => updateInput("length", length)}
                        type="button"
                      >
                        {length}
                      </button>
                    ))}
                  </div>
                </FieldGroup>
              </div>

              <FieldGroup label="语气风格">
                <div aria-label="语气风格" className="grid grid-cols-2 gap-2" role="group">
                  {tones.map((tone) => (
                    <button
                      aria-pressed={input.tone === tone}
                      className={clsx(
                        "min-h-11 rounded-md border px-3 text-sm font-medium transition",
                        input.tone === tone
                          ? "border-xhs bg-xhs/8 text-xhs"
                          : "border-black/12 bg-white text-black/65 hover:border-black/25",
                      )}
                      key={tone}
                      onClick={() => updateInput("tone", tone)}
                      type="button"
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </FieldGroup>

              <Field label="禁用词">
                <input
                  className="h-11 w-full rounded-md border border-black/12 bg-white px-3 text-sm"
                  onChange={(event) =>
                    updateInput("forbiddenWords", event.target.value)
                  }
                  placeholder="例如：最强、永久、百分百"
                  value={input.forbiddenWords}
                />
              </Field>

              <Field label="补充要求">
                <textarea
                  className="min-h-20 w-full resize-none rounded-md border border-black/12 bg-white px-3 py-2 text-sm leading-6"
                  onChange={(event) =>
                    updateInput("extraRequirements", event.target.value)
                  }
                  placeholder="例如：不要太广告，要像真实分享"
                  value={input.extraRequirements}
                />
              </Field>
            </form>
          </aside>

          <section className="rounded-lg border border-black/10 bg-white/92 p-4 shadow-soft lg:min-h-[720px]">
            <div className="mb-4 flex flex-col gap-3 border-b border-black/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">生成结果</h2>
                <p className="mt-1 text-sm text-black/55">
                  {source === "ai"
                    ? "已通过 AI Hub 生成"
                    : source === "mock"
                      ? "当前使用本地 mock 模式，仅用于开发自测"
                      : "生成后会显示标题、正文、标签和建议"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {optimizeModes.map((mode) => (
                  <button
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-black/12 bg-white px-3 text-sm font-medium transition hover:border-xhs hover:text-xhs disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={!result || Boolean(loadingMode)}
                    key={mode}
                    onClick={() => generateCopy(mode)}
                    type="button"
                  >
                    {loadingMode === mode ? (
                      <Loader2 className="animate-spin" size={15} />
                    ) : (
                      <RefreshCw size={15} />
                    )}
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <div className="mb-4 rounded-md border border-xhs/20 bg-xhs/8 px-4 py-3 text-sm text-xhs">
                {error}
              </div>
            ) : null}

            {loadingMode && !result ? (
              <EmptyState loadingMode={loadingMode} />
            ) : result ? (
              <div className="space-y-4">
                <ResultBlock
                  actionLabel="复制标题"
                  onCopy={() => copyText("标题", result.titles.join("\n"))}
                  title="标题方案"
                >
                  <div className="grid gap-2">
                    {result.titles.map((title, index) => (
                      <div
                        className="rounded-md border border-black/10 bg-paper px-3 py-2 text-sm font-medium leading-6"
                        key={`${title}-${index}`}
                      >
                        {index + 1}. {title}
                      </div>
                    ))}
                  </div>
                </ResultBlock>

                <ResultBlock
                  actionLabel="复制正文"
                  onCopy={() => copyText("正文", result.body)}
                  title="正文"
                >
                  <article className="whitespace-pre-wrap rounded-md border border-black/10 bg-paper p-4 text-sm leading-7 text-black/78">
                    {result.body}
                  </article>
                </ResultBlock>

                <ResultBlock
                  actionLabel="复制标签"
                  onCopy={() => copyText("标签", result.tags.join(" "))}
                  title="标签"
                >
                  <div className="flex flex-wrap gap-2">
                    {result.tags.map((tag) => (
                      <span
                        className="rounded-full border border-mint/20 bg-mint/8 px-3 py-1 text-sm font-medium text-mint"
                        key={tag}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </ResultBlock>

                <ResultBlock
                  actionLabel="复制建议"
                  onCopy={() => copyText("建议", result.suggestions.join("\n"))}
                  title="发布建议"
                >
                  <ul className="space-y-2">
                    {result.suggestions.map((suggestion, index) => (
                      <li
                        className="rounded-md bg-black/[0.035] px-3 py-2 text-sm leading-6 text-black/70"
                        key={`${suggestion}-${index}`}
                      >
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </ResultBlock>

                {copied ? (
                  <div className="fixed bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white shadow-soft">
                    已复制{copied}
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptyState />
            )}
          </section>

          <aside className="rounded-lg border border-black/10 bg-white/88 p-4 shadow-soft">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="text-plum" size={18} />
                <h2 className="text-lg font-semibold">历史记录</h2>
              </div>
              <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-black/55">
                {history.length}/12
              </span>
            </div>

            {history.length ? (
              <div className="scrollbar-thin max-h-[690px] space-y-3 overflow-auto pr-1">
                {history.map((item) => (
                  <div
                    className="rounded-md border border-black/10 bg-paper p-3"
                    key={item.id}
                  >
                    <button
                      className="block w-full text-left text-sm font-semibold leading-6 transition hover:text-xhs"
                      onClick={() => restoreHistory(item)}
                      type="button"
                    >
                      {item.title}
                    </button>
                    <div className="mt-2 flex items-center justify-between text-xs text-black/48">
                      <span>{formatTime(item.createdAt)}</span>
                      <button
                        aria-label="删除历史"
                        className="inline-flex h-9 w-9 items-center justify-center rounded transition hover:bg-xhs/10 hover:text-xhs"
                        onClick={() => deleteHistory(item.id)}
                        type="button"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-black/15 px-4 py-8 text-center text-sm leading-6 text-black/50">
                生成后的文案会自动保存在这里，方便回看和复用。
              </div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}

function Field({
  children,
  label,
  required,
}: {
  children: React.ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-sm font-semibold">
        {label}
        {required ? <span className="text-xhs">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function FieldGroup({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div>
      <span className="mb-1.5 flex items-center gap-1 text-sm font-semibold">
        {label}
      </span>
      {children}
    </div>
  );
}

function ResultBlock({
  actionLabel,
  children,
  onCopy,
  title,
}: {
  actionLabel: string;
  children: React.ReactNode;
  onCopy: () => void;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-black/10 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <button
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-black/12 bg-white px-2.5 text-sm font-medium transition hover:border-xhs hover:text-xhs"
          onClick={onCopy}
          type="button"
        >
          <Clipboard size={14} />
          {actionLabel}
        </button>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ loadingMode }: { loadingMode?: string }) {
  return (
    <div className="flex min-h-[560px] items-center justify-center rounded-lg border border-dashed border-black/15 bg-paper/80 p-8 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-xhs/10 text-xhs">
          {loadingMode ? (
            <Loader2 className="animate-spin" size={22} />
          ) : (
            <Sparkles size={22} />
          )}
        </div>
        <h3 className="text-lg font-semibold">
          {loadingMode ? `${loadingMode}中` : "先写一个内容 brief"}
        </h3>
        <p className="mt-2 text-sm leading-6 text-black/55">
          {loadingMode
            ? "正在整理标题、正文、标签和发布建议。"
            : "填写左侧主题、卖点和目标人群后，生成结果会出现在这里。"}
        </p>
      </div>
    </div>
  );
}
