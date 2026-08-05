import {
  AlertCircle,
  CheckCircle2,
  Clapperboard,
  Clipboard,
  Download,
  Eye,
  Film,
  Gauge,
  GitCompareArrows,
  History,
  Image as ImageIcon,
  KeyRound,
  ListChecks,
  Loader2,
  Mic2,
  RefreshCw,
  Sparkles,
  Table2,
  UserRound,
  Video,
  WandSparkles
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  defaultModels,
  type DreamDirectorOutput,
  type DreamStyle,
  GenerateDreamResponseSchema,
  type GenerateDreamRequest,
  type RealProvider,
  providerLabels,
  type RevisionMode,
  revisionModeLabels,
  styleLabels
} from "./shared/contracts";
import { createVersionComparison, type VersionComparison } from "./shared/versionCompare";

const providerOrder: RealProvider[] = ["openai"];
const styles: DreamStyle[] = ["surreal", "film_noir", "animation", "arthouse", "soft_horror", "warm_fantasy"];
const revisionModes: RevisionMode[] = [
  "more_faithful",
  "more_surreal",
  "more_cinematic",
  "stronger_poster",
  "stronger_shots",
  "less_explanatory"
];
const elementStatusLabels = {
  used: "已保留",
  adapted: "已改写",
  missing: "遗漏"
} as const;

type OutputVersion = {
  id: string;
  label: string;
  createdAt: string;
  result: DreamDirectorOutput;
};

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

const fallbackProviders: HubProvider[] = providerOrder.map((id) => ({
  id,
  name: providerLabels[id],
  defaultModel: defaultModels[id],
  models: [defaultModels[id]],
  enabledModels: [],
  enabled: false,
  configured: false
}));

const sampleDream =
  "我梦见自己在一座没有天花板的地铁站等车。轨道里不是铁轨，而是一条黑色的河。每当广播响起，河面就浮出一扇门。门后有我小时候的房间，但房间里的月亮很低，像一盏台灯。最后一班车开来时，车窗里坐着很多戴面具的人，他们都在看一本没有字的剧本。";

const initialRequest: GenerateDreamRequest = {
  provider: "openai",
  model: defaultModels.openai,
  dreamText: sampleDream,
  titleHint: "",
  style: "surreal",
  tone: "迷离、克制、带一点希望",
  durationMinutes: 3,
  intensity: 3,
  language: "zh-CN"
};

export function App() {
  const [request, setRequest] = useState<GenerateDreamRequest>(initialRequest);
  const [result, setResult] = useState<DreamDirectorOutput | null>(null);
  const [status, setStatus] = useState("等待开机");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState("");
  const [versions, setVersions] = useState<OutputVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState("");
  const [providers, setProviders] = useState<HubProvider[]>(fallbackProviders);
  const [provider, setProvider] = useState<RealProvider>("openai");
  const [model, setModel] = useState(defaultModels.openai);
  const [hubUrl, setHubUrl] = useState("/hub/#models");
  const [configStatus, setConfigStatus] = useState<"loading" | "ready" | "error">("loading");
  const [configMessage, setConfigMessage] = useState("正在读取 Hub 模型配置...");

  const ready = isReady(request);
  const selectedProvider = useMemo(
    () => providers.find((item) => item.id === provider) || fallbackProviders.find((item) => item.id === provider) || fallbackProviders[0],
    [provider, providers]
  );
  const modelOptions = useMemo(() => providerModelOptions(selectedProvider), [selectedProvider]);
  const activeModel = model || selectedProvider.defaultModel || defaultModels[provider];
  const canUseModel = Boolean(selectedProvider.enabled && selectedProvider.configured && modelOptions.includes(activeModel));
  const configLabel =
    configStatus === "loading"
      ? "读取 Hub 配置中"
      : canUseModel
        ? `${selectedProvider.name} 已就绪`
        : "Hub 模型未就绪";

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
        setRequest((current) => ({ ...current, provider: nextProvider.id, model: nextModel }));
        setHubUrl(payload.hubUrl || "/hub/#models");
        setConfigStatus(configuredProviders.length ? "ready" : "error");
        setConfigMessage(
          configuredProviders.length
            ? `已读取 Hub 配置：${configuredProviders.map((item) => item.name).join("、")} 可用。`
            : "Hub 暂未启用可用模型，将使用本地预览。"
        );
      } catch (error) {
        if (cancelled) return;
        setConfigStatus("error");
        setConfigMessage(error instanceof Error ? error.message : "读取 Hub 模型配置失败。");
      }
    }

    void loadProviders();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (modelOptions.includes(activeModel)) return;
    const nextModel = pickModel(selectedProvider, model);
    setModel(nextModel);
    setRequest((current) => ({ ...current, provider, model: nextModel }));
  }, [activeModel, model, modelOptions, provider, selectedProvider]);

  function update<K extends keyof GenerateDreamRequest>(key: K, value: GenerateDreamRequest[K]) {
    setRequest((current) => ({ ...current, [key]: value }));
  }

  async function generate(revisionMode?: RevisionMode) {
    const payload: GenerateDreamRequest = {
      ...request,
      provider: canUseModel ? provider : "demo",
      model: canUseModel ? activeModel : defaultModels.demo,
      ...(revisionMode ? { revisionMode } : {})
    };
    if (!isReady(payload)) {
      setError("请补充梦境内容。");
      return;
    }

    if (revisionMode) {
      setRequest((current) => ({ ...current, revisionMode }));
    }
    setError("");
    setCopied("");
    setIsGenerating(true);
    setStatus(
      revisionMode
        ? `${revisionModeLabels[revisionMode]}重导向中`
        : !canUseModel
          ? "本地剪辑中"
          : `连接 ${providerLabels[provider]}`
    );

    try {
      const response = await fetch(apiPath("/api/generate"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const responseBody = await response.json();
      if (!response.ok) {
        throw new Error(responseBody?.error?.message || "生成失败");
      }
      const parsed = GenerateDreamResponseSchema.parse(responseBody);
      const version = makeVersion(parsed.data, revisionMode ? revisionModeLabels[revisionMode] : result ? "重新生成" : "初版");
      setResult(parsed.data);
      setVersions((current) => [...current, version].slice(-6));
      setActiveVersionId(version.id);
      setStatus(
        revisionMode
          ? `${revisionModeLabels[revisionMode]}完成`
          : parsed.meta.mode === "local_preview"
            ? "本地导演案完成"
            : "模型导演案完成"
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成失败，请稍后再试。");
      setStatus("生成中断");
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyText(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
  }

  function exportMarkdown() {
    if (!result) return;
    const blob = new Blob([toMarkdown(result)], { type: "text/markdown;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${result.title.replace(/[\\/:*?"<>|]/g, "-")}.md`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  function selectVersion(versionId: string) {
    const version = versions.find((item) => item.id === versionId);
    if (!version) return;
    setActiveVersionId(version.id);
    setResult(version.result);
    setCopied("");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">
            <Film size={15} aria-hidden="true" />
            Dream Director
          </p>
          <h1>AI · 梦境导演</h1>
        </div>
        <div className="status-chip" role="status">
          <Sparkles size={16} aria-hidden="true" />
          {status}
        </div>
      </header>

      <div className="workspace">
        <section className="control-panel" aria-label="梦境控制台">
          <PanelTitle icon={<WandSparkles size={18} />} title="梦境素材" />
          <label className="field" htmlFor="dream-text">
            <span>梦境原文</span>
            <textarea
              id="dream-text"
              value={request.dreamText}
              onChange={(event) => update("dreamText", event.target.value)}
              rows={9}
              maxLength={5000}
            />
          </label>

          <div className="two-col">
            <label className="field" htmlFor="title-hint">
              <span>片名暗示</span>
              <input
                id="title-hint"
                value={request.titleHint || ""}
                onChange={(event) => update("titleHint", event.target.value)}
                placeholder="可留空"
                maxLength={60}
              />
            </label>
            <label className="field" htmlFor="dream-tone">
              <span>情绪调性</span>
              <input id="dream-tone" value={request.tone} onChange={(event) => update("tone", event.target.value)} maxLength={100} />
            </label>
          </div>

          <div className="style-grid" aria-label="短片风格">
            {styles.map((style) => (
              <button
                key={style}
                type="button"
                className={request.style === style ? "toggle active" : "toggle"}
                onClick={() => update("style", style)}
                aria-pressed={request.style === style}
              >
                {styleLabels[style]}
              </button>
            ))}
          </div>

          <div className="two-col">
            <label className="field" htmlFor="duration-minutes">
              <span>片长</span>
              <input
                id="duration-minutes"
                type="number"
                min={1}
                max={8}
                value={request.durationMinutes}
                onChange={(event) => update("durationMinutes", Number(event.target.value))}
              />
            </label>
            <label className="field" htmlFor="dream-intensity">
              <span>强度 {request.intensity}</span>
              <input
                id="dream-intensity"
                type="range"
                min={1}
                max={5}
                value={request.intensity}
                onChange={(event) => update("intensity", Number(event.target.value))}
              />
            </label>
          </div>

          <PanelTitle icon={<KeyRound size={18} />} title="Hub 模型" />
          <a className={`config-badge ${canUseModel ? "ready" : configStatus}`} href={hubUrl} title={configMessage}>
            {canUseModel ? <CheckCircle2 size={15} aria-hidden="true" /> : <AlertCircle size={15} aria-hidden="true" />}
            {canUseModel ? `当前项目型号：${activeModel}` : configLabel}
          </a>
          <p className="note">{configMessage} 切换 GPT 型号请使用页面顶部的统一模型选择器；项目内不再配置厂商、模型或 API Key。</p>

          {error ? <div className="error-state">{error}</div> : null}

          <div className="actions">
            <button className="primary" type="button" onClick={() => generate()} disabled={isGenerating || !ready}>
              {isGenerating ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Clapperboard size={18} aria-hidden="true" />}
              生成导演案
            </button>
            <button type="button" onClick={() => update("dreamText", sampleDream)}>
              <RefreshCw size={18} aria-hidden="true" />
              样例
            </button>
          </div>

          <div className="revision-panel" aria-label="重导向">
            <span>一键重导向</span>
            <div className="revision-grid">
              {revisionModes.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={request.revisionMode === mode ? "toggle active" : "toggle"}
                  onClick={() => generate(mode)}
                  disabled={isGenerating || !ready}
                  aria-pressed={request.revisionMode === mode}
                >
                  {revisionModeLabels[mode]}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="result-panel" aria-label="导演案输出">
          {result ? (
            <DirectorOutput
              result={result}
              copied={copied}
              versions={versions}
              activeVersionId={activeVersionId}
              onCopy={copyText}
              onExport={exportMarkdown}
              onSelectVersion={selectVersion}
            />
          ) : (
            <EmptyBoard />
          )}
        </section>
      </div>
    </main>
  );
}

function DirectorOutput({
  result,
  copied,
  versions,
  activeVersionId,
  onCopy,
  onExport,
  onSelectVersion
}: {
  result: DreamDirectorOutput;
  copied: string;
  versions: OutputVersion[];
  activeVersionId: string;
  onCopy: (label: string, text: string) => Promise<void>;
  onExport: () => void;
  onSelectVersion: (versionId: string) => void;
}) {
  return (
    <div className="result-stack">
      <div className="film-header">
        <div>
          <p className="eyebrow">Director's Cut</p>
          <h2>{result.title}</h2>
          <p>{result.logline}</p>
        </div>
        <button type="button" onClick={onExport}>
          <Download size={18} aria-hidden="true" />
          导出
        </button>
      </div>

      <div className="statement-band">
        <div className="poster-frame">
          <span>{result.poster.title}</span>
          <strong>{result.poster.tagline}</strong>
        </div>
        <div className="statement-copy">
          <h3>{result.visualBible.genre}</h3>
          <p>{result.directorStatement}</p>
          <div className="palette">
            {result.visualBible.palette.map((color) => (
              <span key={color}>{color}</span>
            ))}
          </div>
        </div>
      </div>

      <VersionPanel versions={versions} activeVersionId={activeVersionId} onSelectVersion={onSelectVersion} />

      <OutputSection icon={<ListChecks size={18} />} title="梦境元素锁定">
        <div className="element-grid">
          {result.dreamElements.map((element) => (
            <article className={`element-chip ${element.status}`} key={`${element.label}-${element.status}`}>
              <div>
                <strong>{element.label}</strong>
                <span>{elementStatusLabels[element.status]}</span>
              </div>
              <small>{element.source}</small>
              <p>{element.usage}</p>
            </article>
          ))}
        </div>
      </OutputSection>

      <OutputSection icon={<Gauge size={18} />} title="保真度评分">
        <div className="fidelity-card">
          <div className="score-ring" aria-label={`保真度 ${result.fidelity.score} 分`}>
            <strong>{result.fidelity.score}</strong>
            <span>/100</span>
          </div>
          <div className="fidelity-copy">
            <p>{result.fidelity.note}</p>
            <div className="fidelity-columns">
              <BriefList label="保留" items={result.fidelity.preserved} />
              <BriefList label="改写" items={result.fidelity.adapted} />
              <BriefList label="遗漏" items={result.fidelity.missing} />
            </div>
          </div>
        </div>
      </OutputSection>

      <OutputSection icon={<Eye size={18} />} title="视觉基调">
        <div className="brief-grid">
          <Brief label="材质" value={result.visualBible.texture} />
          <Brief label="镜头" value={result.visualBible.lens} />
          <Brief label="声音" value={result.visualBible.soundKeywords.join(" / ")} />
        </div>
      </OutputSection>

      <OutputSection icon={<UserRound size={18} />} title="角色设定">
        <div className="character-grid">
          {result.characters.map((character) => (
            <article className="item-card" key={character.name}>
              <h3>{character.name}</h3>
              <p className="muted">{character.function}</p>
              <p>{character.visual}</p>
              <dl>
                <dt>欲望</dt>
                <dd>{character.desire}</dd>
                <dt>象征</dt>
                <dd>{character.symbol}</dd>
              </dl>
            </article>
          ))}
        </div>
      </OutputSection>

      <OutputSection icon={<Film size={18} />} title="三幕剧情">
        <div className="acts">
          {result.acts.map((act) => (
            <article className="act-card" key={act.act}>
              <span>Act {act.act}</span>
              <h3>{act.title}</h3>
              <p>{act.plot}</p>
              <p className="muted">{act.emotion}</p>
              <strong>{act.keyFrame}</strong>
            </article>
          ))}
        </div>
      </OutputSection>

      <OutputSection icon={<Table2 size={18} />} title="镜头表">
        <div className="shot-list">
          {result.shots.map((shot) => (
            <article className="shot-row" key={`${shot.no}-${shot.image}`}>
              <div className="shot-index">
                <span>{String(shot.no).padStart(2, "0")}</span>
                <small>Act {shot.act}</small>
              </div>
              <div>
                <h3>
                  {shot.shotSize} · {shot.timecode}
                </h3>
                <p>{shot.image}</p>
                <ul>
                  <li>
                    <b>运动</b>
                    {shot.camera}
                  </li>
                  <li>
                    <b>动作</b>
                    {shot.action}
                  </li>
                  <li>
                    <b>声音</b>
                    {shot.sound}
                  </li>
                  <li>
                    <b>转场</b>
                    {shot.transition}
                  </li>
                </ul>
                <div className="shot-tech-grid">
                  <Brief label="构图" value={shot.composition} />
                  <Brief label="光线" value={shot.lighting} />
                  <Brief label="连续性" value={shot.continuity} />
                </div>
                <div className="shot-prompt">
                  <span>
                    <Video size={16} aria-hidden="true" />
                    AI 视频 Prompt
                  </span>
                  <textarea readOnly value={shot.videoPrompt} rows={3} aria-label={`镜头 ${shot.no} 视频 prompt`} />
                  <textarea readOnly value={shot.negativePrompt} rows={2} aria-label={`镜头 ${shot.no} 视频负面 prompt`} />
                  <div className="actions inline">
                    <button type="button" onClick={() => onCopy(`shot-${shot.no}-video`, shot.videoPrompt)}>
                      <Clipboard size={18} aria-hidden="true" />
                      复制视频 Prompt
                    </button>
                    <button type="button" onClick={() => onCopy(`shot-${shot.no}-negative`, shot.negativePrompt)}>
                      <Clipboard size={18} aria-hidden="true" />
                      复制负面
                    </button>
                  </div>
                </div>
              </div>
              <blockquote>{shot.voiceOver}</blockquote>
            </article>
          ))}
        </div>
      </OutputSection>

      <OutputSection icon={<Mic2 size={18} />} title="旁白">
        <div className="voice-grid">
          {result.voiceOver.map((line, index) => (
            <p key={`${line}-${index}`}>{line}</p>
          ))}
        </div>
      </OutputSection>

      <OutputSection icon={<ImageIcon size={18} />} title="海报 Prompt">
        <div className="prompt-box">
          <h3>{result.poster.copy}</h3>
          <textarea readOnly value={result.poster.prompt} rows={5} aria-label="海报 prompt" />
          <textarea readOnly value={result.poster.negativePrompt} rows={3} aria-label="负面 prompt" />
          <div className="actions inline">
            <button type="button" onClick={() => onCopy("prompt", result.poster.prompt)}>
              <Clipboard size={18} aria-hidden="true" />
              复制 Prompt
            </button>
            <button type="button" onClick={() => onCopy("negative", result.poster.negativePrompt)}>
              <Clipboard size={18} aria-hidden="true" />
              复制负面
            </button>
            {copied ? <span className="note">已复制 {copied}</span> : null}
          </div>
        </div>
      </OutputSection>
    </div>
  );
}

function VersionPanel({
  versions,
  activeVersionId,
  onSelectVersion
}: {
  versions: OutputVersion[];
  activeVersionId: string;
  onSelectVersion: (versionId: string) => void;
}) {
  if (!versions.length) return null;
  const activeIndex = Math.max(0, versions.findIndex((version) => version.id === activeVersionId));
  const active = versions[activeIndex] || versions[versions.length - 1];
  const base = versions.length > 1 ? versions[Math.max(0, activeIndex - 1)] || versions[1] : null;
  const comparison = base && base.id !== active.id ? createVersionComparison(base.result, active.result) : null;

  return (
    <OutputSection icon={<History size={18} />} title="版本对比">
      <div className="version-panel">
        <div className="version-tabs" aria-label="版本历史">
          {versions.map((version, index) => (
            <button
              key={version.id}
              type="button"
              title={new Date(version.createdAt).toLocaleString()}
              className={version.id === active.id ? "version-tab active" : "version-tab"}
              onClick={() => onSelectVersion(version.id)}
            >
              <span>V{index + 1}</span>
              {version.label}
            </button>
          ))}
        </div>
        {comparison && base ? (
          <VersionComparisonCard comparison={comparison} baseLabel={base.label} activeLabel={active.label} />
        ) : (
          <div className="compare-empty">
            <GitCompareArrows size={18} aria-hidden="true" />
            生成第二个版本后，会显示保真度、梦境元素、镜头和海报 Prompt 的变化。
          </div>
        )}
      </div>
    </OutputSection>
  );
}

function VersionComparisonCard({
  comparison,
  baseLabel,
  activeLabel
}: {
  comparison: VersionComparison;
  baseLabel: string;
  activeLabel: string;
}) {
  return (
    <div className="compare-card">
      <div>
        <span className="muted">对比</span>
        <h3>
          {baseLabel} &gt; {activeLabel}
        </h3>
        <p>{comparison.summary || "两个版本的核心结构基本一致。"}</p>
      </div>
      <div className="compare-grid">
        <Brief label="保真度变化" value={formatDelta(comparison.fidelityDelta)} />
        <Brief label="镜头变化" value={`${comparison.changedShots} 个`} />
        <Brief label="海报变化" value={comparison.posterChanged ? "已变化" : "未变化"} />
      </div>
      <div className="compare-lists">
        <BriefList label="新增元素" items={comparison.addedElements} />
        <BriefList label="移除元素" items={comparison.removedElements} />
      </div>
    </div>
  );
}

function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="panel-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function OutputSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="output-section">
      <PanelTitle icon={icon} title={title} />
      {children}
    </section>
  );
}

function Brief({ label, value }: { label: string; value: string }) {
  return (
    <article className="brief">
      <span>{label}</span>
      <p>{value}</p>
    </article>
  );
}

function BriefList({ label, items }: { label: string; items: string[] }) {
  return (
    <article className="brief-list">
      <span>{label}</span>
      <p>{items.length ? items.join(" / ") : "无"}</p>
    </article>
  );
}

function EmptyBoard() {
  return (
    <div className="empty-board">
      <div className="poster-frame empty">
        <span>Dream Reel</span>
        <strong>等待第一帧</strong>
      </div>
    </div>
  );
}

function toMarkdown(result: DreamDirectorOutput) {
  return [
    `# ${result.title}`,
    "",
    `> ${result.logline}`,
    "",
    "## 导演阐述",
    result.directorStatement,
    "",
    "## 梦境元素锁定",
    ...result.dreamElements.map((item) => `- **${item.label}**（${elementStatusLabels[item.status]}）：${item.usage}｜原句：${item.source}`),
    "",
    "## 保真度评分",
    `- 分数：${result.fidelity.score}/100`,
    `- 保留：${result.fidelity.preserved.join(" / ") || "无"}`,
    `- 改写：${result.fidelity.adapted.join(" / ") || "无"}`,
    `- 遗漏：${result.fidelity.missing.join(" / ") || "无"}`,
    `- 说明：${result.fidelity.note}`,
    "",
    "## 视觉基调",
    `- 类型：${result.visualBible.genre}`,
    `- 色彩：${result.visualBible.palette.join(" / ")}`,
    `- 材质：${result.visualBible.texture}`,
    `- 镜头：${result.visualBible.lens}`,
    `- 声音：${result.visualBible.soundKeywords.join(" / ")}`,
    "",
    "## 角色设定",
    ...result.characters.map((item) => `- **${item.name}**：${item.function}。${item.visual} 欲望：${item.desire} 象征：${item.symbol}`),
    "",
    "## 三幕剧情",
    ...result.acts.map((act) => `### Act ${act.act} ${act.title}\n${act.plot}\n\n- 情绪：${act.emotion}\n- 关键画面：${act.keyFrame}`),
    "",
    "## 镜头表",
    ...result.shots.map(
      (shot) =>
        `### ${shot.no}. Act ${shot.act} / ${shot.timecode} / ${shot.shotSize}\n- 镜头：${shot.camera}\n- 画面：${shot.image}\n- 构图：${shot.composition}\n- 光线：${shot.lighting}\n- 动作：${shot.action}\n- 连续性：${shot.continuity}\n- 旁白：${shot.voiceOver}\n- 声音：${shot.sound}\n- 转场：${shot.transition}\n- AI 视频 Prompt：${shot.videoPrompt}\n- Video Negative Prompt：${shot.negativePrompt}`
    ),
    "",
    "## 旁白",
    ...result.voiceOver.map((line) => `- ${line}`),
    "",
    "## 海报 Prompt",
    result.poster.prompt,
    "",
    "## Negative Prompt",
    result.poster.negativePrompt
  ].join("\n");
}

function isReady(request: GenerateDreamRequest) {
  return request.dreamText.trim().length >= 10;
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
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${basePath}${path}`;
}

function makeVersion(result: DreamDirectorOutput, label: string): OutputVersion {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    createdAt: new Date().toISOString(),
    result
  };
}

function formatDelta(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}
