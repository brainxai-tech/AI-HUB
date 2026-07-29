import {
  BookOpenText,
  Brain,
  CheckCircle2,
  Copy,
  Download,
  History,
  Loader2,
  Moon,
  Sparkles,
  WandSparkles
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  fetchHistory,
  fetchProviders,
  fetchStats,
  interpretDream as requestInterpretation
} from "./api";
import { downloadShareCard } from "./share";
import { isGptModel } from "../shared/types";
import type {
  DreamHistoryEntry,
  DreamInterpretRequest,
  InterpretationStyle,
  Provider,
  ProviderStatus,
  UsageStats
} from "../shared/types";

const providerLabels: Record<Provider, string> = {
  openai: "GPT · AI Routing"
};

const styleLabels: Record<InterpretationStyle, string> = {
  balanced: "平衡",
  traditional: "周公",
  psychological: "心理"
};

const defaultModels: Record<Provider, string> = {
  openai: "gpt-5.4"
};

const styles: InterpretationStyle[] = ["balanced", "traditional", "psychological"];

const emptyStats: UsageStats = {
  totalInterpretations: 0,
  providerCounts: {
    openai: 0
  }
};

const fallbackProviders: ProviderStatus[] = [{
  provider: "openai",
  label: providerLabels.openai,
  defaultModel: defaultModels.openai,
  models: [defaultModels.openai],
  enabledModels: [],
  enabled: false,
  configured: false
}];

export default function App() {
  const [dreamText, setDreamText] = useState("");
  const [mood, setMood] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [style, setStyle] = useState<InterpretationStyle>("balanced");
  const provider: Provider = "openai";
  const [model, setModel] = useState(defaultModels.openai);
  const [providers, setProviders] = useState<ProviderStatus[]>(fallbackProviders);
  const [hubUrl, setHubUrl] = useState("/hub/#models");
  const [configStatus, setConfigStatus] = useState<"loading" | "ready" | "error">("loading");
  const [configMessage, setConfigMessage] = useState("正在读取 Hub 模型配置...");
  const [history, setHistory] = useState<DreamHistoryEntry[]>([]);
  const [stats, setStats] = useState<UsageStats>(emptyStats);
  const [activeEntry, setActiveEntry] = useState<DreamHistoryEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedProvider = providers.find((item) => item.provider === "openai") || fallbackProviders[0];
  const modelOptions = useMemo(() => providerModelOptions(selectedProvider), [selectedProvider]);
  const activeModel = model || selectedProvider.defaultModel || defaultModels.openai;
  const canUseModel = Boolean(
    selectedProvider.enabled && selectedProvider.configured && isGptModel(activeModel) && modelOptions.includes(activeModel)
  );
  const configLabel =
    configStatus === "loading" ? "读取 Hub 配置中" : canUseModel ? `Hub 当前项目型号：${activeModel}` : "Hub GPT 未就绪";
  const tags = useMemo(
    () =>
      tagInput
        .split(/[，,\s]+/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 8),
    [tagInput]
  );

  useEffect(() => {
    let isMounted = true;

    Promise.all([fetchProviders(), fetchHistory(), fetchStats()])
      .then(([providerResponse, historyResponse, statsResponse]) => {
        if (!isMounted) {
          return;
        }
        const nextProviders = normalizeProviders(providerResponse.providers);
        const nextProvider = nextProviders[0];
        const nextModel = pickModel(nextProvider);
        const ready = nextProvider.enabled && nextProvider.configured;

        setProviders(nextProviders);
        setModel(nextModel);
        setHubUrl(providerResponse.hubUrl || "/hub/#models");
        setConfigStatus(ready ? "ready" : "error");
        setConfigMessage(
          ready
            ? `Hub 当前项目型号：${nextModel}`
            : "请先在 AI Hub 配置 AI Routing Key，并在页面顶部为本项目选择 GPT 型号。"
        );
        setHistory(historyResponse.entries);
        setStats(statsResponse.stats);
        setActiveEntry(historyResponse.entries[0] ?? null);
      })
      .catch((caughtError: unknown) => {
        if (isMounted) {
          setConfigStatus("error");
          setConfigMessage("读取 Hub 模型配置失败，请稍后重试。");
          setError(caughtError instanceof Error ? caughtError.message : "初始化失败。");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (modelOptions.includes(activeModel)) return;
    setModel(pickModel(selectedProvider));
  }, [activeModel, modelOptions, selectedProvider]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!canUseModel) {
      setError("请先在 Hub 为本项目启用 GPT 型号。");
      return;
    }
    setIsLoading(true);

    const input: DreamInterpretRequest = {
      dreamText,
      mood,
      tags,
      style,
      provider,
      model: activeModel
    };

    try {
      const response = await requestInterpretation(input);
      setActiveEntry(response.entry);
      setHistory((current) => [response.entry, ...current.filter((item) => item.id !== response.entry.id)]);
      setStats((current) => ({
        totalInterpretations: current.totalInterpretations + 1,
        providerCounts: {
          ...current.providerCounts,
          openai: current.providerCounts.openai + 1
        }
      }));
      setNotice("已通过 Hub 当前 GPT 型号生成并保存到本机历史。");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "生成失败。");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopy(entry: DreamHistoryEntry) {
    const text = [
      `梦境摘要：${entry.result.summary}`,
      `传统解读：${entry.result.traditionalReading}`,
      `心理视角：${entry.result.psychologicalReading}`,
      `今日建议：${entry.result.advice}`,
      entry.result.disclaimer
    ].join("\n\n");

    await navigator.clipboard.writeText(text);
    setNotice("报告文字已复制。");
  }

  function loadHistoryEntry(entry: DreamHistoryEntry) {
    setActiveEntry(entry);
    setDreamText(entry.request.dreamText);
    setMood(entry.request.mood ?? "");
    setTagInput(entry.request.tags?.join(" ") ?? "");
    setStyle(entry.request.style);
    setNotice("");
    setError("");
  }

  return (
    <main className="appShell">
      <header className="topBar">
        <div>
          <p className="eyebrow">Dream Lab</p>
          <h1>AI 周公解梦</h1>
        </div>
        <div className="statusPill" aria-label="Hub 当前项目型号">
          <Sparkles size={18} />
          <span>{canUseModel ? `Hub · ${activeModel}` : "Hub GPT 未就绪"}</span>
        </div>
      </header>

      <section className="workspace">
        <form className="panel composer" onSubmit={handleSubmit}>
          <div className="panelHeader">
            <Moon size={22} />
            <h2>梦境输入</h2>
          </div>

          <label className="field">
            <span>梦境</span>
            <textarea
              value={dreamText}
              onChange={(event) => setDreamText(event.target.value)}
              minLength={8}
              maxLength={3000}
              required
              placeholder="我梦见自己在一条很长的河边走，水很清，但远处有人一直叫我的名字..."
            />
          </label>

          <div className="fieldGrid">
            <label className="field">
              <span>醒来情绪</span>
              <input
                value={mood}
                onChange={(event) => setMood(event.target.value)}
                maxLength={40}
                placeholder="平静 / 紧张 / 好奇"
              />
            </label>
            <label className="field">
              <span>标签</span>
              <input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                maxLength={120}
                placeholder="工作 家人 考试"
              />
            </label>
          </div>

          <SegmentedControl
            label="风格"
            values={styles}
            active={style}
            onChange={setStyle}
            renderLabel={(value) => styleLabels[value]}
          />

          <div className={canUseModel ? "modelNote ready" : "modelNote"}>
            <CheckCircle2 size={18} />
            <span>{configLabel}</span>
          </div>
          <p className="configHint">
            {configMessage} 切换 GPT 型号请使用页面顶部统一模型选择器；项目内不再配置厂商、模型或 API Key。
            {!canUseModel ? <a href={hubUrl}>前往 Hub 配置</a> : null}
          </p>

          {error ? <div className="alert error">{error}</div> : null}
          {notice ? <div className="alert success">{notice}</div> : null}

          <button className="primaryButton" type="submit" disabled={isLoading || !canUseModel}>
            {isLoading ? <Loader2 className="spin" size={20} /> : <WandSparkles size={20} />}
            <span>{isLoading ? "生成中" : "发送给 Hub 当前选择的 GPT 型号"}</span>
          </button>
        </form>

        <section className="panel resultPanel" aria-live="polite">
          {activeEntry ? (
            <ResultView entry={activeEntry} onCopy={handleCopy} />
          ) : (
            <EmptyResult />
          )}
        </section>
      </section>

      <section className="lowerGrid">
        <section className="panel">
          <div className="panelHeader">
            <History size={22} />
            <h2>本机历史</h2>
          </div>
          <div className="historyList">
            {history.length ? (
              history.map((entry) => (
                <button
                  className={entry.id === activeEntry?.id ? "historyItem active" : "historyItem"}
                  key={entry.id}
                  type="button"
                  onClick={() => loadHistoryEntry(entry)}
                >
                  <span>{entry.result.summary}</span>
                  <small>
                    {new Date(entry.createdAt).toLocaleString("zh-CN")} · Hub · {entry.meta.model}
                  </small>
                </button>
              ))
            ) : (
              <p className="muted">暂无历史。</p>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader">
            <Sparkles size={22} />
            <h2>用量概览</h2>
          </div>
          <div className="statsGrid">
            <Metric label="总报告" value={stats.totalInterpretations} />
            <Metric label="Hub GPT" value={stats.providerCounts.openai} />
          </div>
        </section>
      </section>
    </main>
  );
}

function SegmentedControl<T extends string>({
  label,
  values,
  active,
  onChange,
  renderLabel
}: {
  label: string;
  values: readonly T[];
  active: T;
  onChange: (value: T) => void;
  renderLabel: (value: T) => string;
}) {
  return (
    <fieldset className="segmentedField">
      <legend>{label}</legend>
      <div className="segmentedControl">
        {values.map((value) => (
          <button
            aria-pressed={active === value}
            className={active === value ? "segment active" : "segment"}
            key={value}
            type="button"
            onClick={() => onChange(value)}
          >
            {renderLabel(value)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ResultView({
  entry,
  onCopy
}: {
  entry: DreamHistoryEntry;
  onCopy: (entry: DreamHistoryEntry) => void;
}) {
  return (
    <div className="resultContent">
      <div className="resultTop">
        <div>
          <p className="eyebrow">Hub · {entry.meta.model}</p>
          <h2>{entry.result.summary}</h2>
        </div>
        <div className="resultActions">
          <button type="button" className="iconButton" onClick={() => onCopy(entry)} aria-label="复制报告">
            <Copy size={19} />
          </button>
          <button
            type="button"
            className="iconButton"
            onClick={() => downloadShareCard(entry)}
            aria-label="下载分享图"
          >
            <Download size={19} />
          </button>
        </div>
      </div>

      <div className="symbolRow">
        {entry.result.symbols.map((symbol) => (
          <span className="symbolChip" key={`${entry.id}-${symbol.name}`}>
            {symbol.name}
          </span>
        ))}
      </div>

      <ResultSection
        icon={<BookOpenText size={20} />}
        title="传统解读"
        text={entry.result.traditionalReading}
      />
      <ResultSection icon={<Brain size={20} />} title="心理视角" text={entry.result.psychologicalReading} />
      <ResultSection title="现实启示" text={entry.result.realityInsight} />
      <ResultSection title="今日建议" text={entry.result.advice} />

      <div className="keywordLine">
        {entry.result.luckyKeywords.map((keyword) => (
          <span key={keyword}>{keyword}</span>
        ))}
      </div>

      <section className="ragBox">
        <h3>周公原文检索</h3>
        <div className="ragList">
          {entry.result.ragCitations.map((citation) => (
            <a href={citation.sourceUrl} key={`${entry.id}-${citation.id}`} target="_blank" rel="noreferrer">
              <strong>{citation.category}</strong>
              <span>{citation.original}</span>
            </a>
          ))}
        </div>
        <p>生成前已先检索本地《周公解梦》RAG 语料，再结合命中条目输出。</p>
      </section>

      <p className="disclaimer">{entry.result.disclaimer}</p>
    </div>
  );
}

function ResultSection({
  icon,
  title,
  text
}: {
  icon?: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <section className="resultSection">
      <h3>
        {icon}
        <span>{title}</span>
      </h3>
      <p>{text}</p>
    </section>
  );
}

function EmptyResult() {
  return (
    <div className="emptyResult">
      <WandSparkles size={44} />
      <h2>等待一场梦</h2>
      <p>生成后的报告会出现在这里。</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function normalizeProviders(value: unknown): ProviderStatus[] {
  if (!Array.isArray(value)) return fallbackProviders;

  const provider = value
    .filter((item): item is ProviderStatus => Boolean(item && typeof item === "object" && "provider" in item))
    .find((item) => item.provider === "openai");
  if (!provider) return fallbackProviders;

  const enabledModels = uniqueStrings(provider.enabledModels || []).filter(isGptModel);
  const models = uniqueStrings([...enabledModels, provider.defaultModel, ...(provider.models || [])]).filter(isGptModel);
  const defaultModel = isGptModel(provider.defaultModel)
    ? provider.defaultModel.trim()
    : enabledModels[0] || models[0] || defaultModels.openai;
  const ready = Boolean(provider.enabled && provider.configured && models.length);
  return [{
    provider: "openai",
    label: provider.label || providerLabels.openai,
    defaultModel,
    models: models.length ? models : [defaultModels.openai],
    enabledModels,
    enabled: ready,
    configured: ready
  }];
}

function providerModelOptions(provider: ProviderStatus) {
  return uniqueStrings([...provider.enabledModels, provider.defaultModel, ...provider.models, defaultModels.openai]).filter(isGptModel);
}

function pickModel(provider: ProviderStatus) {
  const options = providerModelOptions(provider);
  return isGptModel(provider.defaultModel)
    ? provider.defaultModel.trim()
    : provider.enabledModels.find(isGptModel) || options[0] || defaultModels.openai;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
