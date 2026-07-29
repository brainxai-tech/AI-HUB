import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ClipboardCheck,
  EyeOff,
  Flame,
  Loader2,
  MessageCircle,
  RefreshCcw,
  Send,
  Settings2,
  ShieldAlert,
  Target,
  TimerReset,
  Wand2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  defaultModels,
  modelSuggestions,
  providerLabels,
  styleLabels,
  type CoachResult,
  type CoachStyle,
  type GenerateResponse,
  type Provider,
  type RealProvider
} from "./shared/contracts";

type ResultMeta = GenerateResponse["meta"];

type Feedback = "刺中了" | "太虚了" | "太狠了" | "更具体";

type HubProvider = {
  id: RealProvider;
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

const providerOrder: RealProvider[] = ["openai"];
const fallbackProviders: HubProvider[] = providerOrder.map((id) => ({
  id,
  name: providerLabels[id],
  defaultModel: defaultModels[id],
  models: [...modelSuggestions[id]],
  enabledModels: [],
  enabled: false,
  configured: false
}));
const basePath = normalizeBasePath(import.meta.env.BASE_URL || "/");

const sampleInputs = [
  "我想努力，但每天都坚持不下去。",
  "我一定要成为更好的自己。",
  "我很迷茫，不知道该做什么。",
  "我总是拖延，但我真的想改变。"
];

const styleMeta: Record<CoachStyle, { icon: typeof Brain; hint: string }> = {
  calm: { icon: Brain, hint: "冷静拆解" },
  sharp: { icon: Flame, hint: "锋利一点" },
  friend: { icon: MessageCircle, hint: "像朋友说话" }
};

export function App() {
  const [provider, setProvider] = useState<RealProvider>("openai");
  const [model, setModel] = useState<string>(defaultModels.openai);
  const [style, setStyle] = useState<CoachStyle>("calm");
  const [userText, setUserText] = useState(sampleInputs[0]);
  const [result, setResult] = useState<CoachResult | null>(null);
  const [resultMeta, setResultMeta] = useState<ResultMeta | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | "">("");
  const [providers, setProviders] = useState<HubProvider[]>(fallbackProviders);
  const [hubUrl, setHubUrl] = useState("/hub/#models");
  const [configStatus, setConfigStatus] = useState<"loading" | "ready" | "error">("loading");
  const [configMessage, setConfigMessage] = useState("正在读取 Hub 模型配置...");

  const selectedProvider = useMemo(
    () => providers.find((item) => item.id === provider) || fallbackProviders.find((item) => item.id === provider) || fallbackProviders[0],
    [provider, providers]
  );
  const suggestions = useMemo(() => providerModelOptions(selectedProvider), [selectedProvider]);
  const activeModel = model || selectedProvider.defaultModel || defaultModels[provider];
  const canUseModel = Boolean(selectedProvider.enabled && selectedProvider.configured && suggestions.includes(activeModel));
  const canGenerate = userText.trim().length >= 2;
  const configLabel =
    configStatus === "loading" ? "读取 Hub 配置中" : canUseModel ? `${selectedProvider.name} 已就绪` : "Hub 模型未就绪";

  useEffect(() => {
    let cancelled = false;

    async function loadProviders() {
      try {
        const response = await fetch(apiPath("/api/providers"), { cache: "no-store" });
        const payload = (await response.json()) as ProvidersResponse;
        if (!response.ok) {
          throw new Error(readResponseMessage(payload) || "读取 Hub 模型配置失败。");
        }

        const nextProviders = normalizeProviders(payload.providers);
        const nextProvider =
          nextProviders.find((item) => item.id === provider && item.enabled && item.configured) ||
          nextProviders.find((item) => item.enabled && item.configured) ||
          nextProviders.find((item) => item.id === provider) ||
          nextProviders[0];
        const configuredProviders = nextProviders.filter((item) => item.enabled && item.configured);
        const nextModel = pickModel(nextProvider, model);

        if (cancelled) return;
        setProviders(nextProviders);
        setProvider(nextProvider.id);
        setModel(nextModel);
        setHubUrl(payload.hubUrl || "/hub/#models");
        setConfigStatus(configuredProviders.length ? "ready" : "error");
        setConfigMessage(
          configuredProviders.length
            ? `已读取 Hub 配置：${configuredProviders.map((item) => item.name).join("、")} 可用。`
            : "Hub 暂未启用可用模型，将使用本地预览。"
        );
      } catch (caught) {
        if (cancelled) return;
        setConfigStatus("error");
        setConfigMessage(caught instanceof Error ? caught.message : "读取 Hub 模型配置失败。");
      }
    }

    void loadProviders();

    return () => {
      cancelled = true;
    };
  }, []);

  async function generate() {
    setIsLoading(true);
    setError("");
    setFeedback("");

    try {
      const requestProvider: Provider = canUseModel ? provider : "demo";
      const response = await fetch(apiPath("/api/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: requestProvider,
          model: canUseModel ? activeModel : defaultModels.demo,
          style,
          userText
        })
      });
      const body = (await response.json()) as GenerateResponse | { error?: { message?: string } };

      if (!response.ok) {
        throw new Error("error" in body ? body.error?.message || "生成失败。" : "生成失败。");
      }

      setResult((body as GenerateResponse).data);
      setResultMeta((body as GenerateResponse).meta);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成失败，请稍后重试。");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="control-panel" aria-label="模型配置">
          <div className="brand-block">
            <div className="brand-mark" aria-hidden="true">
              <EyeOff size={22} />
            </div>
            <div>
              <h1>AI 反鸡汤教练</h1>
              <p>拆空话，落行动。</p>
            </div>
          </div>

          <section className="panel-section" aria-labelledby="provider-title">
            <div className="section-title">
              <Settings2 size={18} />
              <h2 id="provider-title">Hub 模型</h2>
            </div>
            <div className="notice compact">
              <Wand2 size={16} />
              <span>{canUseModel ? `当前项目型号：${activeModel}` : "AI Hub 暂未就绪，将使用本地预览。"}</span>
            </div>

            <a className={`config-badge ${canUseModel ? "ready" : configStatus}`} href={hubUrl} title={configMessage}>
              {canUseModel ? <CheckCircle2 size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
              {configLabel}
            </a>
            <p className="fine-print">切换 GPT 型号请使用页面顶部的统一模型选择器；项目内不再配置厂商或 API Key。</p>
          </section>

          <section className="panel-section" aria-labelledby="style-title">
            <div className="section-title">
              <Target size={18} />
              <h2 id="style-title">风格</h2>
            </div>
            <div className="segmented" role="group" aria-label="输出风格">
              {(Object.keys(styleLabels) as CoachStyle[]).map((item) => {
                const Icon = styleMeta[item].icon;
                return (
                  <button
                    key={item}
                    type="button"
                    title={styleMeta[item].hint}
                    aria-pressed={style === item}
                    className={style === item ? "segment active" : "segment"}
                    onClick={() => setStyle(item)}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span>{styleLabels[item]}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </aside>

        <section className="main-panel" aria-label="反鸡汤生成器">
          <div className="composer">
            <label className="prompt-field" htmlFor="anti-coach-prompt">
              <span>输入一句自我激励、困惑或拖延借口</span>
              <textarea
                id="anti-coach-prompt"
                value={userText}
                onChange={(event) => setUserText(event.target.value)}
                maxLength={1000}
                rows={7}
              />
            </label>

            <div className="sample-row" aria-label="样例输入">
              {sampleInputs.map((sample) => (
                <button key={sample} type="button" onClick={() => setUserText(sample)}>
                  {sample}
                </button>
              ))}
            </div>

            <div className="action-row">
              <div className="input-count">{userText.length}/1000</div>
              <button className="primary-action" disabled={!canGenerate || isLoading} onClick={generate} type="button">
                {isLoading ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
                <span>{isLoading ? "拆解中" : "生成反鸡汤"}</span>
              </button>
            </div>

            {error ? (
              <div className="error-box" role="alert">
                <ShieldAlert size={18} />
                <span>{error}</span>
              </div>
            ) : null}
          </div>

          <ResultPanel
            result={result}
            meta={resultMeta}
            isLoading={isLoading}
            feedback={feedback}
            setFeedback={setFeedback}
          />
        </section>
      </section>
    </main>
  );
}

function ResultPanel({
  result,
  meta,
  isLoading,
  feedback,
  setFeedback
}: {
  result: CoachResult | null;
  meta: ResultMeta | null;
  isLoading: boolean;
  feedback: Feedback | "";
  setFeedback: (feedback: Feedback) => void;
}) {
  if (isLoading) {
    return (
      <section className="result-panel" aria-busy="true" aria-label="生成中">
        <div className="skeleton line wide" />
        <div className="skeleton line" />
        <div className="skeleton block" />
        <div className="skeleton block short" />
      </section>
    );
  }

  if (!result) {
    return (
      <section className="result-panel empty-state" aria-label="结果">
        <ClipboardCheck size={34} />
        <h2>等一句真话。</h2>
        <p>输入越具体，拆出来的行动越不虚。</p>
      </section>
    );
  }

  return (
    <section className="result-panel" aria-label="结果">
      <header className={result.safetyMode ? "result-header safety" : "result-header"}>
        <div>
          <p className="eyebrow">{result.safetyMode ? "安全模式" : "现实校准"}</p>
          <h2>{result.headline}</h2>
        </div>
        <CheckCircle2 size={24} aria-hidden="true" />
      </header>

      {meta?.quality ? (
        <div className={meta.quality.rewritten ? "quality-strip tuned" : "quality-strip"} aria-label="生成质量">
          <Wand2 size={16} />
          <span>
            {meta.quality.rewritten ? "初稿未达标，已自动重写一次" : "质量检查通过"} · {meta.quality.score}
          </span>
        </div>
      ) : null}

      <p className="verdict">{result.verdict}</p>

      <section className="result-section" aria-labelledby="empty-title">
        <h3 id="empty-title">空话拆解</h3>
        <div className="phrase-list">
          {result.emptyPhrases.map((item) => (
            <article className="phrase-item" key={`${item.phrase}-${item.replaceWith}`}>
              <strong>{item.phrase}</strong>
              <p>{item.whyItIsEmpty}</p>
              <span>{item.replaceWith}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="result-section reality" aria-labelledby="reality-title">
        <h3 id="reality-title">现实判断</h3>
        <p>{result.realityCheck}</p>
      </section>

      <section className="result-section" aria-labelledby="actions-title">
        <h3 id="actions-title">今天行动</h3>
        <div className="action-list">
          {result.actions.map((action) => (
            <article className="action-item" key={`${action.title}-${action.firstStep}`}>
              <div className="action-time">
                <TimerReset size={16} />
                <span>{action.minutes} 分钟</span>
              </div>
              <h4>{action.title}</h4>
              <p>{action.firstStep}</p>
              <small>{action.proof}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="review-strip" aria-label="复盘">
        <RefreshCcw size={18} />
        <p>{result.reviewQuestion}</p>
      </section>

      <p className="boundary">{result.boundary}</p>

      <div className="feedback-row" aria-label="反馈">
        {(["刺中了", "太虚了", "太狠了", "更具体"] as Feedback[]).map((item) => (
          <button
            key={item}
            type="button"
            className={feedback === item ? "feedback active" : "feedback"}
            onClick={() => setFeedback(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </section>
  );
}

function normalizeProviders(providers?: HubProvider[]) {
  const normalized = (providers || [])
    .filter((item): item is HubProvider => Boolean(item) && providerOrder.includes(item.id))
    .map((item) => ({
      ...item,
      name: item.name || providerLabels[item.id],
      defaultModel: item.defaultModel || defaultModels[item.id],
      models: uniqueStrings(item.models || [defaultModels[item.id]]),
      enabledModels: uniqueStrings(item.enabledModels || []),
      enabled: Boolean(item.enabled),
      configured: Boolean(item.configured)
    }));

  return normalized.length ? normalized : fallbackProviders;
}

function providerModelOptions(provider: HubProvider) {
  const preferred = provider.enabledModels.length ? provider.enabledModels : provider.models;
  return uniqueStrings([...preferred, provider.defaultModel || defaultModels[provider.id]]);
}

function pickModel(provider: HubProvider, currentModel?: string) {
  const models = providerModelOptions(provider);
  if (currentModel && models.includes(currentModel)) {
    return currentModel;
  }

  return models[0] || provider.defaultModel || defaultModels[provider.id];
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

function normalizeBasePath(value: string) {
  if (!value || value === "/") return "";
  return `/${value.replace(/^\/+|\/+$/g, "")}`;
}
