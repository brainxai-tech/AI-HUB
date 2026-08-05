import {
  AlertCircle,
  BookOpen,
  Check,
  Copy,
  Download,
  KeyRound,
  Loader2,
  Mic2,
  Moon,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
  WandSparkles
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  defaultModels,
  providerLabels,
  type ApiError,
  type ApiSuccess,
  type Provider,
  type ReadingStyle,
  type StoryRequest,
  type StoryResponse
} from "./shared/contracts";

type ViewMode = "story" | "readAloud" | "share";

type HubProvider = {
  id: Provider;
  name: string;
  defaultModel: string;
  models: string[];
  enabledModels: string[];
  enabled: boolean;
  configured: boolean;
};

type ProvidersPayload = {
  providers: HubProvider[];
  configured: boolean;
  hubUrl: string;
};

type FormState = Omit<StoryRequest, "provider" | "model"> & {
  provider: Provider;
  model: string;
};

const providerOptions: Provider[] = ["openai"];
const fallbackProviders: HubProvider[] = providerOptions.map((provider) => ({
  id: provider,
  name: providerLabels[provider],
  defaultModel: defaultModels[provider],
  models: [defaultModels[provider]],
  enabledModels: [],
  enabled: false,
  configured: false
}));

const initialForm: FormState = {
  provider: "openai",
  model: defaultModels.openai,
  childAge: 5,
  childName: "小雨",
  theme: "勇敢和想象力",
  characters: "月亮兔、会发光的小船",
  setting: "云朵码头",
  tone: "温柔、安心、带一点点奇妙",
  lengthMinutes: 5,
  readingStyle: "calm",
  sequelSeed: ""
};

const readingStyles: Array<{ value: ReadingStyle; label: string }> = [
  { value: "calm", label: "安静" },
  { value: "playful", label: "轻快" },
  { value: "whisper", label: "耳语" }
];

export function App() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [story, setStory] = useState<StoryResponse | null>(null);
  const [view, setView] = useState<ViewMode>("story");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [providers, setProviders] = useState<HubProvider[]>(fallbackProviders);
  const [hubUrl, setHubUrl] = useState("/hub/#models");
  const [configError, setConfigError] = useState<string | null>(null);
  const [isConfigLoading, setIsConfigLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadProviders() {
      setIsConfigLoading(true);
      setConfigError(null);
      try {
        const response = await fetch(apiPath("api/providers"), { cache: "no-store" });
        const payload = (await response.json()) as ProvidersPayload | ApiError;

        if (!response.ok || "error" in payload) {
          throw new Error("error" in payload ? payload.error.message : "读取 Hub 模型配置失败");
        }

        if (cancelled) return;

        const nextProviders = payload.providers.length ? payload.providers : fallbackProviders;
        setProviders(nextProviders);
        setHubUrl(payload.hubUrl || "/hub/#models");
        setForm((current) => {
          const nextProvider =
            nextProviders.find((provider) => provider.id === current.provider && provider.enabled && provider.configured) ||
            nextProviders.find((provider) => provider.enabled && provider.configured) ||
            nextProviders.find((provider) => provider.id === current.provider) ||
            nextProviders[0];

          return {
            ...current,
            provider: nextProvider.id,
            model: pickModel(nextProvider, current.model)
          };
        });
      } catch (requestError) {
        if (!cancelled) {
          setConfigError(requestError instanceof Error ? requestError.message : "读取 Hub 模型配置失败");
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

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === form.provider) || providers[0],
    [form.provider, providers]
  );

  const modelOptions = useMemo(() => {
    if (!selectedProvider) return [];
    return selectedProvider.enabledModels.length ? selectedProvider.enabledModels : selectedProvider.models;
  }, [selectedProvider]);

  const canGenerate = useMemo(() => {
    return (
      form.childAge >= 2 &&
      form.theme.trim().length > 0 &&
      form.characters.trim().length > 0 &&
      Boolean(selectedProvider?.enabled && selectedProvider.configured) &&
      modelOptions.includes(form.model)
    );
  }, [form, modelOptions, selectedProvider]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canGenerate) {
      setError("请先在 Hub 完成模型配置，并补全故事信息。");
      return;
    }

    setIsLoading(true);
    setError(null);
    setCopied(null);

    try {
      const payload: StoryRequest = {
        provider: form.provider,
        model: form.model.trim(),
        childAge: Number(form.childAge),
        childName: (form.childName ?? "").trim(),
        theme: form.theme.trim(),
        characters: form.characters.trim(),
        setting: form.setting?.trim(),
        tone: form.tone.trim(),
        lengthMinutes: Number(form.lengthMinutes),
        readingStyle: form.readingStyle,
        sequelSeed: form.sequelSeed?.trim()
      };

      const response = await fetch(apiPath("api/generate"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = (await response.json()) as ApiSuccess | ApiError;

      if (!response.ok || "error" in json) {
        throw new Error("error" in json ? json.error.message : "生成失败");
      }

      setStory(json.data);
      setView("story");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "生成失败，请稍后再试。");
    } finally {
      setIsLoading(false);
    }
  }

  function seedSequel() {
    if (!story) return;
    setForm((current) => ({
      ...current,
      sequelSeed: story.sequelSeed,
      theme: current.theme.includes("续集") ? current.theme : `${current.theme} 续集`
    }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function copyText(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1800);
  }

  function downloadText() {
    if (!story) return;
    const content = [
      `# ${story.title}`,
      story.subtitle,
      "",
      "## 故事正文",
      story.story,
      "",
      "## 朗读稿",
      story.readAloud,
      "",
      "## 分享卡",
      story.shareCard.headline,
      story.shareCard.quote,
      story.shareCard.caption,
      story.shareCard.hashtags.join(" ")
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${story.title}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup" aria-label="AI 睡前故事工厂">
          <span className="brand-mark">
            <Moon size={22} aria-hidden="true" />
          </span>
          <div>
            <h1>AI 睡前故事工厂</h1>
            <p>故事、朗读稿、晚安分享卡</p>
          </div>
        </div>
        <div className="trust-strip">
          <span>
            <ShieldCheck size={16} aria-hidden="true" />
            Hub 转发
          </span>
          <span>
            <KeyRound size={16} aria-hidden="true" />
            统一模型配置
          </span>
        </div>
      </header>

      <div className="workspace">
        <form className="control-panel" onSubmit={handleSubmit}>
          <section className="panel-section">
            <div className="section-title">
              <WandSparkles size={18} aria-hidden="true" />
              <h2>今晚故事</h2>
            </div>
            <div className="field-grid two">
              <label htmlFor="childAge">
                年龄
                <input
                  id="childAge"
                  type="number"
                  min={2}
                  max={12}
                  value={form.childAge}
                  onChange={(event) => update("childAge", Number(event.target.value))}
                />
              </label>
              <label htmlFor="childName">
                名字
                <input
                  id="childName"
                  value={form.childName}
                  maxLength={20}
                  onChange={(event) => update("childName", event.target.value)}
                />
              </label>
            </div>
            <label htmlFor="theme">
              主题
              <input id="theme" value={form.theme} maxLength={80} onChange={(event) => update("theme", event.target.value)} />
            </label>
            <label htmlFor="characters">
              角色
              <textarea
                id="characters"
                value={form.characters}
                maxLength={120}
                rows={3}
                onChange={(event) => update("characters", event.target.value)}
              />
            </label>
            <label htmlFor="setting">
              场景
              <input id="setting" value={form.setting} maxLength={100} onChange={(event) => update("setting", event.target.value)} />
            </label>
            <div className="field-grid two">
              <label htmlFor="lengthMinutes">
                时长
                <input
                  id="lengthMinutes"
                  type="number"
                  min={2}
                  max={12}
                  value={form.lengthMinutes}
                  onChange={(event) => update("lengthMinutes", Number(event.target.value))}
                />
              </label>
              <label htmlFor="tone">
                语气
                <input id="tone" value={form.tone} maxLength={80} onChange={(event) => update("tone", event.target.value)} />
              </label>
            </div>
            <div className="segmented" role="radiogroup" aria-label="朗读风格">
              {readingStyles.map((style) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={form.readingStyle === style.value}
                  className={form.readingStyle === style.value ? "active" : ""}
                  key={style.value}
                  onClick={() => update("readingStyle", style.value)}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </section>

          <section className="panel-section">
            <div className="section-title">
              <Sparkles size={18} aria-hidden="true" />
              <h2>模型</h2>
            </div>
            <div className="config-state ok" role="status">
              <Sparkles size={16} aria-hidden="true" />
              <span>{selectedProvider?.enabled && selectedProvider.configured ? `当前项目型号：${form.model}` : "AI Hub 暂未就绪。"}</span>
            </div>
            <div className={canGenerate ? "config-state ok" : "config-state"} role="status">
              {canGenerate ? <ShieldCheck size={16} aria-hidden="true" /> : <AlertCircle size={16} aria-hidden="true" />}
              <span>
                {isConfigLoading
                  ? "正在读取 Hub 模型配置..."
                  : selectedProvider?.enabled && selectedProvider.configured
                    ? "切换型号请使用页面顶部的统一模型选择器；项目内不再填写 Key。"
                    : "请先到 Hub 统一 API 配置中保存 Routing Key。"}
              </span>
              {!canGenerate && !isConfigLoading && (
                <a className="config-link" href={hubUrl} target="_blank" rel="noreferrer">
                  去配置
                </a>
              )}
            </div>
            {configError && <div className="error-state" role="alert">{configError}</div>}
          </section>

          <section className="panel-section">
            <div className="section-title">
              <RefreshCw size={18} aria-hidden="true" />
              <h2>连载</h2>
            </div>
            <label htmlFor="sequelSeed">
              续集线索
              <textarea
                id="sequelSeed"
                value={form.sequelSeed}
                rows={3}
                maxLength={500}
                onChange={(event) => update("sequelSeed", event.target.value)}
              />
            </label>
          </section>

          {error && <div className="error-state" role="alert">{error}</div>}

          <button className="generate-button" type="submit" disabled={!canGenerate || isLoading}>
            {isLoading ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <WandSparkles size={18} aria-hidden="true" />}
            {isLoading ? "生成中" : "生成故事"}
          </button>
        </form>

        <section className="result-panel" aria-live="polite">
          <div className="result-toolbar">
            <div className="tabs" role="tablist" aria-label="故事结果">
              <button role="tab" aria-selected={view === "story"} className={view === "story" ? "active" : ""} onClick={() => setView("story")}>
                <BookOpen size={16} aria-hidden="true" />
                正文
              </button>
              <button role="tab" aria-selected={view === "readAloud"} className={view === "readAloud" ? "active" : ""} onClick={() => setView("readAloud")}>
                <Mic2 size={16} aria-hidden="true" />
                朗读
              </button>
              <button role="tab" aria-selected={view === "share"} className={view === "share" ? "active" : ""} onClick={() => setView("share")}>
                <Share2 size={16} aria-hidden="true" />
                分享
              </button>
            </div>
            <div className="toolbar-actions">
              <button type="button" disabled={!story} onClick={() => story && copyText("story", story.story)} aria-label="复制故事正文">
                {copied === "story" ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
              </button>
              <button type="button" disabled={!story} onClick={downloadText} aria-label="下载故事文本">
                <Download size={17} aria-hidden="true" />
              </button>
            </div>
          </div>

          {isLoading && <LoadingState />}
          {!isLoading && !story && <EmptyState />}
          {!isLoading && story && (
            <article className="story-output">
              <div className="story-heading">
                <span>今晚</span>
                <h2>{story.title}</h2>
                <p>{story.subtitle}</p>
              </div>

              {view === "story" && (
                <div className="prose">
                  {story.story.split(/\n{2,}/).map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              )}

              {view === "readAloud" && (
                <div className="read-card">
                  {story.readAloud.split(/\n{2,}/).map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              )}

              {view === "share" && (
                <div className="share-layout">
                  <div className="story-card-preview">
                    <div className="mini-scene" aria-hidden="true">
                      <span className="scene-moon" />
                      <span className="scene-boat" />
                      <span className="scene-star one" />
                      <span className="scene-star two" />
                    </div>
                    <span className="card-kicker">晚安故事卡</span>
                    <h3>{story.shareCard.headline}</h3>
                    <blockquote>{story.shareCard.quote}</blockquote>
                    <p>{story.shareCard.caption}</p>
                    <div className="hashtags">
                      {story.shareCard.hashtags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  </div>
                  <div className="parent-notes">
                    <h3>家长提示</h3>
                    <ul>
                      {story.parentNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                    <button type="button" onClick={() => copyText("share", `${story.shareCard.headline}\n${story.shareCard.quote}\n${story.shareCard.caption}`)}>
                      {copied === "share" ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
                      复制分享文案
                    </button>
                    <button type="button" onClick={seedSequel}>
                      <RefreshCw size={17} aria-hidden="true" />
                      明晚续集
                    </button>
                  </div>
                </div>
              )}
            </article>
          )}
        </section>
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-visual" aria-hidden="true">
        <span className="cover-book" />
        <span className="cover-moon" />
        <span className="cover-line a" />
        <span className="cover-line b" />
      </div>
      <h2>今晚还没有故事</h2>
      <p>先在 Hub 配好模型，然后生成一篇可直接朗读的晚安故事。</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="loading-state" role="status">
      <Loader2 className="spin" size={24} aria-hidden="true" />
      <span>故事正在变柔软</span>
    </div>
  );
}

function pickModel(provider: HubProvider, currentModel?: string) {
  const models = provider.enabledModels.length ? provider.enabledModels : provider.models;
  if (currentModel && models.includes(currentModel)) {
    return currentModel;
  }
  return models[0] || provider.defaultModel || defaultModels[provider.id];
}

function apiPath(path: string) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base}${path.replace(/^\/+/, "")}`;
}
