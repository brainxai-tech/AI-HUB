import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clipboard,
  Loader2,
  MessageSquareText,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound
} from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import {
  channelLabels,
  defaultModels,
  isGptModel,
  personaLabels,
  riskLevelLabels,
  toneGoalLabels,
  type AnalysisReport,
  type AnalyzeResponse,
  type ApiError,
  type Channel,
  type Provider,
  type ProviderCatalogItem,
  type ToneGoal
} from "./shared/contracts";

type FormState = {
  text: string;
  channel: Channel;
  intent: string;
  toneGoal: ToneGoal;
  provider: Provider;
  model: string;
};

type ProvidersResponse = {
  providers?: ProviderCatalogItem[];
  configured?: boolean;
  hubUrl?: string;
  error?: string | { message?: string };
  message?: string;
};

const sampleText = "怎么还没发我？不是说今天给吗";
const channels = Object.keys(channelLabels) as Channel[];
const toneGoals = Object.keys(toneGoalLabels) as ToneGoal[];
const fallbackProvider: ProviderCatalogItem = {
  id: "openai",
  name: "GPT · AI Routing",
  defaultModel: defaultModels.openai,
  models: [defaultModels.openai],
  enabledModels: [],
  enabled: false,
  configured: false
};
const basePath = normalizeBasePath(import.meta.env.BASE_URL || "/");

const initialForm: FormState = {
  text: sampleText,
  channel: "message",
  intent: "想确认对方什么时候能把资料发来",
  toneGoal: "softer",
  provider: "openai",
  model: defaultModels.openai
};

export default function App() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [activeProvider, setActiveProvider] = useState<ProviderCatalogItem>(fallbackProvider);
  const [hubUrl, setHubUrl] = useState("/hub/#models");
  const [configStatus, setConfigStatus] = useState<"loading" | "ready" | "error">("loading");
  const [configMessage, setConfigMessage] = useState("正在读取 Hub 模型配置...");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<ApiError["error"] | null>(null);
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

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
        setActiveProvider(nextProvider);
        setHubUrl(payload.hubUrl || "/hub/#models");
        setConfigStatus(ready ? "ready" : "error");
        setConfigMessage(
          ready
            ? `Hub 当前项目型号：${selectedModel}`
            : "请先在 AI Hub 配置 AI Routing Key，并在页面顶部为本项目选择 GPT 型号。"
        );
        setForm((current) => ({
          ...current,
          provider: "openai",
          model: selectedModel
        }));
      } catch (caught) {
        if (cancelled) return;
        setConfigStatus("error");
        setConfigMessage(caught instanceof Error ? caught.message : "读取 Hub 模型配置失败。");
        setActiveProvider(fallbackProvider);
        setForm((current) => ({ ...current, provider: "openai", model: defaultModels.openai }));
      }
    }

    void loadProviders();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeModel = form.model || pickModel(activeProvider);
  const canUseModel = Boolean(activeProvider.enabled && activeProvider.configured && isGptModel(activeModel));
  const configLabel =
    configStatus === "loading" ? "读取 Hub 配置中" : canUseModel ? `Hub · ${activeModel}` : "Hub GPT 未就绪";

  async function analyze() {
    setError(null);
    setNotice("");
    setCopied(null);

    if (!canUseModel) {
      setError({ code: "HUB_MODEL_NOT_READY", message: "请先在页面顶部为本项目选择可用的 GPT 型号。" });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(apiPath("/api/analyze"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          model: activeModel,
          input: {
            text: form.text,
            channel: form.channel,
            intent: form.intent,
            toneGoal: form.toneGoal
          }
        })
      });

      const payload = (await response.json()) as unknown;
      if (!response.ok || isApiError(payload)) {
        setError(isApiError(payload) ? payload.error : { code: "REQUEST_ERROR", message: "请求失败，请稍后重试。" });
        return;
      }

      const generated = payload as AnalyzeResponse;
      setResult(generated);
      setNotice(`已通过 Hub 当前选择的 ${generated.meta.model} 完成分析。`);
    } catch {
      setError({ code: "NETWORK_ERROR", message: "无法连接项目服务。" });
    } finally {
      setIsLoading(false);
    }
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AI · 误解模拟器</p>
          <h1>发送前，先看别人会怎么误解。</h1>
        </div>
        <a className={`topbar-status ${canUseModel ? "ready" : configStatus}`} href={hubUrl} aria-label="当前 Hub 模型状态">
          {canUseModel ? <BadgeCheck size={18} aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}
          <span>{configLabel}</span>
        </a>
      </header>

      <div className="workspace">
        <section className="input-panel" aria-labelledby="input-title">
          <div className="section-heading">
            <MessageSquareText size={20} aria-hidden="true" />
            <div>
              <h2 id="input-title">输入文案</h2>
              <p>消息、邮件、朋友圈或职场通知。</p>
            </div>
          </div>

          <label className="field">
            <span>原文</span>
            <textarea
              value={form.text}
              onChange={(event) => setForm((current) => ({ ...current, text: event.target.value }))}
              rows={8}
              maxLength={4000}
              placeholder="粘贴你准备发送的一句话或一段文案"
            />
          </label>

          <div className="segmented-grid" aria-label="场景">
            {channels.map((channel) => (
              <button
                key={channel}
                type="button"
                className={channel === form.channel ? "segment active" : "segment"}
                onClick={() => setForm((current) => ({ ...current, channel }))}
              >
                {channelLabels[channel]}
              </button>
            ))}
          </div>

          <label className="field">
            <span>真实意图</span>
            <input
              value={form.intent}
              onChange={(event) => setForm((current) => ({ ...current, intent: event.target.value }))}
              maxLength={800}
              placeholder="例如：想确认进度，不是催促"
            />
          </label>

          <div className="tone-row" aria-label="改写目标">
            {toneGoals.map((goal) => (
              <button
                key={goal}
                type="button"
                className={goal === form.toneGoal ? "chip active" : "chip"}
                onClick={() => setForm((current) => ({ ...current, toneGoal: goal }))}
              >
                {toneGoalLabels[goal]}
              </button>
            ))}
          </div>

          <div className="model-box">
            <div className="section-heading compact">
              <Sparkles size={18} aria-hidden="true" />
              <div>
                <h2>Hub 当前项目型号</h2>
                <p>切换 GPT 型号请使用页面顶部统一模型选择器；项目内不再配置厂商、模型或 API Key。</p>
              </div>
            </div>

            <div className={`config-note ${canUseModel ? "ready" : configStatus}`}>
              {canUseModel ? <BadgeCheck size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
              <span>{configMessage}</span>
            </div>
          </div>

          {error && (
            <div className="error-box" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>{error.message}</span>
            </div>
          )}

          {notice && !error && (
            <div className="notice-box" role="status">
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>{notice}</span>
            </div>
          )}

          <div className="actions">
            <button
              className="primary-action"
              type="button"
              onClick={analyze}
              disabled={isLoading || !form.text.trim() || !canUseModel}
            >
              {isLoading ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
              <span>{isLoading ? "分析中" : "分析误解风险"}</span>
            </button>
            <button
              className="secondary-action"
              type="button"
              onClick={() => {
                setForm(initialForm);
                setNotice("");
                setError(null);
              }}
            >
              <RefreshCcw size={17} aria-hidden="true" />
              <span>重置</span>
            </button>
          </div>
        </section>

        <ResultPanel result={result?.data || null} meta={result?.meta} copied={copied} onCopy={copyText} />
      </div>
    </main>
  );
}

function ResultPanel({
  result,
  meta,
  copied,
  onCopy
}: {
  result: AnalysisReport | null;
  meta?: AnalyzeResponse["meta"];
  copied: string | null;
  onCopy: (label: string, text: string) => void;
}) {
  if (!result) {
    return (
      <section className="result-panel empty" aria-label="分析结果">
        <Sparkles size={28} aria-hidden="true" />
        <h2>结果会显示在这里</h2>
        <p>配置完成后，所有分析请求都会通过 Hub 项目级代理发送给页面顶部当前选择的 GPT 型号。</p>
      </section>
    );
  }

  const progressStyle = {
    "--risk": `${result.overallRisk}%`
  } as CSSProperties;

  return (
    <section className="result-panel" aria-label="分析结果">
      <div className="score-row">
        <div className={`score-ring ${result.riskLevel.toLowerCase()}`} style={progressStyle} aria-label={`风险分 ${result.overallRisk}`}>
          <strong>{result.overallRisk}</strong>
          <span>{riskLevelLabels[result.riskLevel]}</span>
        </div>
        <div className="score-copy">
          <p className="eyebrow">整体误解风险</p>
          <h2>{result.summary}</h2>
          {meta && (
            <p className="meta-line">Hub · {meta.model}</p>
          )}
        </div>
      </div>

      <div className="risk-list">
        {result.topRisks.map((risk) => (
          <article className="risk-item" key={`${risk.type}-${risk.label}`}>
            <strong>{risk.label}</strong>
            <p>{risk.evidence}</p>
            <span>{risk.advice}</span>
          </article>
        ))}
      </div>

      <div className="section-heading">
        <UsersRound size={20} aria-hidden="true" />
        <div>
          <h2>不同人会怎么误解</h2>
          <p>四种视角的风险预演。</p>
        </div>
      </div>

      <div className="audience-grid">
        {result.audiences.map((audience) => (
          <article className="audience-card" key={audience.persona}>
            <div className="audience-head">
              <strong>{audience.label || personaLabels[audience.persona]}</strong>
              <span>{audience.riskScore}</span>
            </div>
            <p>{audience.possibleMisread}</p>
            <div className="tags">
              {audience.triggerWords.length ? (
                audience.triggerWords.map((word) => <span key={word}>{word}</span>)
              ) : (
                <span>上下文</span>
              )}
            </div>
            <small>{audience.saferSignal}</small>
          </article>
        ))}
      </div>

      <div className="rewrite-grid">
        <RewriteCard title="更清楚版" label="clear" text={result.rewrites.clear} copied={copied} onCopy={onCopy} />
        <RewriteCard title="更温和版" label="soft" text={result.rewrites.soft} copied={copied} onCopy={onCopy} />
        <RewriteCard title="更职场版" label="professional" text={result.rewrites.professional} copied={copied} onCopy={onCopy} />
      </div>

      <div className="fix-strip">
        {result.quickFixes.map((fix) => (
          <span key={fix}>
            <CheckCircle2 size={15} aria-hidden="true" />
            {fix}
          </span>
        ))}
      </div>
    </section>
  );
}

function RewriteCard({
  title,
  label,
  text,
  copied,
  onCopy
}: {
  title: string;
  label: string;
  text: string;
  copied: string | null;
  onCopy: (label: string, text: string) => void;
}) {
  return (
    <article className="rewrite-card">
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
      <button type="button" onClick={() => onCopy(label, text)} aria-label={`复制${title}`}>
        <Clipboard size={16} aria-hidden="true" />
        <span>{copied === label ? "已复制" : "复制"}</span>
      </button>
    </article>
  );
}

function normalizeProvider(providers?: ProviderCatalogItem[]) {
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

function pickModel(provider: ProviderCatalogItem) {
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
  return `${basePath}${path}`.replace(/\/{2,}/g, "/");
}

function isApiError(value: unknown): value is { error: ApiError["error"] } {
  return (
    value !== null &&
    typeof value === "object" &&
    "error" in value &&
    Boolean((value as { error?: unknown }).error) &&
    typeof (value as { error: { message?: unknown } }).error.message === "string"
  );
}

function normalizeBasePath(value: string) {
  if (!value || value === "/") return "";
  return `/${value.replace(/^\/+|\/+$/g, "")}`;
}
