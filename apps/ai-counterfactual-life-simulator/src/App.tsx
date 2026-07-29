import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  defaultModels,
  modelSuggestions,
  providerLabels,
  type Branch,
  type CounterfactualResult,
  type Depth,
  type GenerateRequest,
  type GenerateResponse,
  type RealProvider,
  type Tone
} from "./shared/contracts";

const providerOrder: RealProvider[] = ["openai"];
const loadingStages = ["理解选择", "构建分支", "评估风险", "生成建议"];

type FormState = {
  provider: RealProvider;
  model: string;
  question: string;
  context: string;
  tone: Tone;
  depth: Depth;
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

const initialForm: FormState = {
  provider: "openai",
  model: defaultModels.openai,
  question: "如果我当初去了北京而不是留在杭州？",
  context: "",
  tone: "gentle",
  depth: "standard"
};

const fallbackProviders: HubProvider[] = providerOrder.map((id) => ({
  id,
  name: providerLabels[id],
  defaultModel: defaultModels[id],
  models: [defaultModels[id], ...modelSuggestions[id]],
  enabledModels: [],
  enabled: false,
  configured: false
}));

export function App() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [result, setResult] = useState<CounterfactualResult | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [providers, setProviders] = useState<HubProvider[]>(fallbackProviders);
  const [hubUrl, setHubUrl] = useState("/hub/#models");
  const [configStatus, setConfigStatus] = useState<"loading" | "ready" | "error">("loading");
  const [configMessage, setConfigMessage] = useState("正在读取 Hub 模型配置...");
  const abortRef = useRef<AbortController | null>(null);

  const selectedBranch = result?.branches.find((branch) => branch.id === selectedBranchId) ?? result?.branches[0] ?? null;
  const selectedProvider = useMemo(
    () => providers.find((item) => item.id === form.provider) || fallbackProviders.find((item) => item.id === form.provider) || fallbackProviders[0],
    [form.provider, providers]
  );
  const modelOptions = useMemo(() => providerModelOptions(selectedProvider), [selectedProvider]);
  const activeModel = form.model || selectedProvider.defaultModel || defaultModels[form.provider];
  const canUseModel = Boolean(selectedProvider.enabled && selectedProvider.configured && modelOptions.includes(activeModel));
  const configLabel =
    configStatus === "loading" ? "读取 Hub 配置中" : canUseModel ? `${selectedProvider.name} 已就绪` : "Hub 模型未就绪，使用本地预览";

  const canSubmit = useMemo(() => {
    if (isGenerating) return false;
    if (form.question.trim().length < 8) return false;
    return true;
  }, [form.question, isGenerating]);

  useEffect(() => {
    if (!isGenerating) return;
    const timer = window.setInterval(() => {
      setLoadingStage((stage) => (stage + 1) % loadingStages.length);
    }, 1100);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  useEffect(() => {
    if (!result?.branches[0]) return;
    setSelectedBranchId(result.branches[0].id);
  }, [result]);

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
          nextProviders.find((item) => item.id === form.provider && item.enabled && item.configured) ||
          nextProviders.find((item) => item.enabled && item.configured) ||
          nextProviders.find((item) => item.id === form.provider) ||
          nextProviders[0];
        const configuredProviders = nextProviders.filter((item) => item.enabled && item.configured);
        const nextModel = pickModel(nextProvider, form.model);

        if (cancelled) return;
        setProviders(nextProviders);
        setHubUrl(payload.hubUrl || "/hub/#models");
        setForm((current) => ({ ...current, provider: nextProvider.id, model: nextModel }));
        setConfigStatus(configuredProviders.length ? "ready" : "error");
        setConfigMessage(
          configuredProviders.length
            ? `已读取 Hub 配置：${configuredProviders.map((item) => item.name).join("、")} 可用。`
            : "Hub 暂未启用可用模型，本项目会先使用本地预览结果。"
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

  useEffect(() => {
    if (modelOptions.includes(activeModel)) return;
    const nextModel = pickModel(selectedProvider, form.model);
    setForm((current) => ({ ...current, model: nextModel }));
  }, [activeModel, form.model, modelOptions, selectedProvider]);

  function updateForm<T extends keyof FormState>(key: T, value: FormState[T]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setNotice(null);
    setIsGenerating(true);
    setLoadingStage(0);
    abortRef.current = new AbortController();

    const payload: GenerateRequest = {
      provider: canUseModel ? form.provider : "demo",
      model: canUseModel ? activeModel : defaultModels.demo,
      question: form.question.trim(),
      context: form.context.trim(),
      tone: form.tone,
      depth: form.depth
    };

    try {
      const response = await fetch(apiPath("/api/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortRef.current.signal
      });
      const body = (await response.json()) as GenerateResponse | { error?: { message?: string } };

      if (!response.ok) {
        throw new Error("error" in body && body.error?.message ? body.error.message : "生成失败，请稍后重试。");
      }

      setResult((body as GenerateResponse).data);
      setNotice(payload.provider === "demo" ? "已生成本地预览分支。配置 Hub 模型后可生成真实模型版本。" : "已生成 3 条分支。你可以复制全文或导出 Markdown。");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setError("已取消本次生成。");
      } else {
        setError(caught instanceof Error ? caught.message : "生成失败，请检查 Hub 模型配置或稍后重试。");
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }

  function cancelGenerate() {
    abortRef.current?.abort();
  }

  async function copyMarkdown() {
    if (!result) return;
    await window.navigator.clipboard.writeText(formatResultAsMarkdown(result));
    setNotice("Markdown 已复制。");
  }

  function downloadMarkdown() {
    if (!result) return;
    const blob = new Blob([formatResultAsMarkdown(result)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "counterfactual-life-timeline.md";
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Markdown 已导出。");
  }

  return (
    <main className="app-shell">
      <section className="topbar" aria-labelledby="app-title">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Sparkles size={22} />
          </div>
          <div>
            <p className="eyebrow">Counterfactual Timeline</p>
            <h1 id="app-title">AI · 反事实人生模拟器</h1>
          </div>
        </div>
        <p className="topbar-copy">
          把“如果当初……”整理成 3 条人生分支：短期结果、长期代价、隐藏机会和现实建议。
        </p>
      </section>

      <div className="workspace">
        <form className="control-panel" onSubmit={handleGenerate}>
          <section className="field-block" aria-labelledby="question-label">
            <div className="section-heading">
              <Brain size={18} aria-hidden="true" />
              <h2 id="question-label">选择问题</h2>
            </div>
            <label className="field-label" htmlFor="question">
              如果我当初选了 A 而不是 B？
            </label>
            <textarea
              id="question"
              value={form.question}
              onChange={(event) => updateForm("question", event.target.value)}
              placeholder="例如：如果我当初接受那份大厂 offer，而不是创业？"
              rows={4}
              maxLength={1000}
              required
            />
            <label className="field-label" htmlFor="context">
              背景补充
            </label>
            <textarea
              id="context"
              value={form.context}
              onChange={(event) => updateForm("context", event.target.value)}
              placeholder="可选：当时的年龄、城市、关系、现实中选了什么，现在最困扰什么。"
              rows={4}
              maxLength={3000}
            />
          </section>

          <section className="field-block" aria-labelledby="provider-label">
            <div className="section-heading">
              <KeyRound size={18} aria-hidden="true" />
              <h2 id="provider-label">Hub 模型</h2>
            </div>
            <div className={canUseModel ? "config-badge is-ready" : "config-badge is-preview"} role="status">
              <ShieldCheck size={17} aria-hidden="true" />
              <span>{canUseModel ? `当前项目型号：${activeModel}` : configLabel}</span>
            </div>
            <p className="security-note">
              {configMessage} 切换 GPT 型号请使用页面顶部的统一模型选择器；项目内不再配置厂商或 API Key。
              <a className="config-link" href={hubUrl}>
                前往配置
              </a>
              。
            </p>
          </section>

          <section className="field-block" aria-labelledby="style-label">
            <div className="section-heading">
              <Zap size={18} aria-hidden="true" />
              <h2 id="style-label">生成方式</h2>
            </div>
            <fieldset className="segmented">
              <legend>语气</legend>
              {[
                ["gentle", "温柔"],
                ["rational", "理性"],
                ["sharp", "犀利"]
              ].map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="tone"
                    value={value}
                    aria-label={`语气：${label}`}
                    checked={form.tone === value}
                    onChange={() => updateForm("tone", value as Tone)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <fieldset className="segmented">
              <legend>深度</legend>
              {[
                ["light", "轻量"],
                ["standard", "标准"],
                ["deep", "深入"]
              ].map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="depth"
                    value={value}
                    aria-label={`深度：${label}`}
                    checked={form.depth === value}
                    onChange={() => updateForm("depth", value as Depth)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
          </section>

          <div className="action-row">
            <button className="primary-action" type="submit" disabled={!canSubmit}>
              {isGenerating ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
              {isGenerating ? loadingStages[loadingStage] : "生成分支"}
            </button>
            <button className="secondary-action" type="button" onClick={cancelGenerate} disabled={!isGenerating} title="取消生成">
              取消
            </button>
          </div>

          {error ? (
            <p className="inline-message error" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="inline-message success" role="status">
              <CheckCircle2 size={16} aria-hidden="true" />
              {notice}
            </p>
          ) : null}
        </form>

        <section className="result-panel" aria-live="polite">
          {isGenerating ? <LoadingTimeline stage={loadingStage} /> : null}
          {!isGenerating && !result ? <EmptyResult /> : null}
          {!isGenerating && result ? (
            <div className="result-content">
              <div className="result-header">
                <div>
                  <p className="eyebrow">Generated Timeline</p>
                  <h2>{result.question}</h2>
                  <p>{result.reframe}</p>
                </div>
                <div className="result-actions">
                  <button type="button" onClick={copyMarkdown} title="复制 Markdown">
                    <Copy size={17} aria-hidden="true" />
                    复制
                  </button>
                  <button type="button" onClick={downloadMarkdown} title="导出 Markdown">
                    <Download size={17} aria-hidden="true" />
                    导出
                  </button>
                  <button type="button" onClick={() => setResult(null)} title="重新开始">
                    <RefreshCw size={17} aria-hidden="true" />
                    重来
                  </button>
                </div>
              </div>

              <div className="disclaimer">
                <ShieldCheck size={18} aria-hidden="true" />
                <span>{result.disclaimer}</span>
              </div>

              <div className="branch-tabs" role="tablist" aria-label="人生分支">
                {result.branches.map((branch) => (
                  <button
                    key={branch.id}
                    type="button"
                    role="tab"
                    aria-selected={branch.id === selectedBranch?.id}
                    className={branch.id === selectedBranch?.id ? "is-selected" : ""}
                    onClick={() => setSelectedBranchId(branch.id)}
                  >
                    {branch.title}
                  </button>
                ))}
              </div>

              {selectedBranch ? <BranchDetail branch={selectedBranch} /> : null}

              <div className="branch-grid" aria-label="三条人生分支总览">
                {result.branches.map((branch) => (
                  <BranchSummary key={branch.id} branch={branch} />
                ))}
              </div>

              <section className="overall-advice" aria-labelledby="overall-advice-title">
                <div className="section-heading">
                  <Eye size={18} aria-hidden="true" />
                  <h2 id="overall-advice-title">现实建议</h2>
                </div>
                <p>{result.overallAdvice}</p>
              </section>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function EmptyResult() {
  return (
    <div className="empty-result" role="status">
      <div className="empty-orbit" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <h2>等待一次选择被展开</h2>
      <p>结果会以三条分支呈现：收益线、代价线、意外机会线。每条都有时间线和风险/收益判断。</p>
      <div className="empty-preview" aria-label="生成后会看到的三个区域">
        <div>
          <strong>1</strong>
          <span>拆出三条人生分支</span>
        </div>
        <div>
          <strong>2</strong>
          <span>比较收益、风险和情绪影响</span>
        </div>
        <div>
          <strong>3</strong>
          <span>给出现实里可行动的建议</span>
        </div>
      </div>
      <div className="empty-cues" aria-label="结果包含">
        <span>短期结果</span>
        <span>长期代价</span>
        <span>隐藏机会</span>
        <span>现实建议</span>
      </div>
    </div>
  );
}

function LoadingTimeline({ stage }: { stage: number }) {
  return (
    <div className="loading-state" aria-busy="true" aria-label="正在生成分支">
      <div className="loading-header">
        <LoaderCircle className="spin" size={20} aria-hidden="true" />
        <div>
          <h2>{loadingStages[stage]}</h2>
          <p>正在把选择拆成可比较的时间线。</p>
        </div>
      </div>
      <div className="skeleton-board">
        {[0, 1, 2].map((column) => (
          <div className="skeleton-column" key={column}>
            <span />
            <span />
            <span />
            <span />
          </div>
        ))}
      </div>
    </div>
  );
}

function BranchDetail({ branch }: { branch: Branch }) {
  return (
    <article className={`branch-detail ${branch.branchType}`}>
      <div className="branch-detail-copy">
        <p className="branch-kicker">{branchTypeLabel(branch.branchType)}</p>
        <h2>{branch.title}</h2>
        <p>{branch.summary}</p>
      </div>
      <div className="timeline">
        {branch.timeline.map((node) => (
          <div className="timeline-node" key={`${branch.id}-${node.period}`}>
            <span className="timeline-period">{node.period}</span>
            <h3>{node.label}</h3>
            <p>{node.content}</p>
          </div>
        ))}
      </div>
      <div className="metrics-strip">
        <Metric label="收益" value={branch.riskReward.rewardScore} kind="reward" />
        <Metric label="风险" value={branch.riskReward.riskScore} kind="risk" />
        <div className="metric-box">
          <span>不确定性</span>
          <strong>{uncertaintyLabel(branch.riskReward.uncertainty)}</strong>
        </div>
        <div className="metric-box">
          <span>情绪影响</span>
          <strong>{branch.riskReward.emotion}</strong>
        </div>
      </div>
      <div className="insight-grid">
        <Insight title="短期结果" text={branch.shortTermResult} />
        <Insight title="长期代价" text={branch.longTermCost} />
        <Insight title="隐藏机会" text={branch.hiddenOpportunity} />
        <Insight title="现实建议" text={branch.realityAdvice} />
      </div>
    </article>
  );
}

function BranchSummary({ branch }: { branch: Branch }) {
  return (
    <article className={`branch-card ${branch.branchType}`}>
      <p>{branchTypeLabel(branch.branchType)}</p>
      <h3>{branch.title}</h3>
      <span>{branch.summary}</span>
      <div className="mini-score">
        <span>收益 {branch.riskReward.rewardScore}/5</span>
        <span>风险 {branch.riskReward.riskScore}/5</span>
      </div>
    </article>
  );
}

function Insight({ title, text }: { title: string; text: string }) {
  return (
    <section className="insight">
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

function Metric({ label, value, kind }: { label: string; value: number; kind: "reward" | "risk" }) {
  return (
    <div className={`metric-box ${kind}`}>
      <span>{label}</span>
      <strong>{value}/5</strong>
      <div className="score-bar" aria-label={`${label} ${value} 分，共 5 分`}>
        {[1, 2, 3, 4, 5].map((slot) => (
          <i key={slot} className={slot <= value ? "is-filled" : ""} />
        ))}
      </div>
    </div>
  );
}

function formatResultAsMarkdown(result: CounterfactualResult) {
  const branchMarkdown = result.branches
    .map((branch, index) => {
      const timeline = branch.timeline.map((node) => `- **${node.period}｜${node.label}**：${node.content}`).join("\n");
      return `## 分支 ${index + 1}：${branch.title}

${branch.summary}

${timeline}

- 短期结果：${branch.shortTermResult}
- 长期代价：${branch.longTermCost}
- 隐藏机会：${branch.hiddenOpportunity}
- 现实建议：${branch.realityAdvice}
- 收益/风险：${branch.riskReward.rewardScore}/5 / ${branch.riskReward.riskScore}/5
- 不确定性：${uncertaintyLabel(branch.riskReward.uncertainty)}
`;
    })
    .join("\n");

  return `# ${result.question}

${result.disclaimer}

${result.reframe}

${branchMarkdown}

## 总体建议

${result.overallAdvice}
`;
}

function branchTypeLabel(type: Branch["branchType"]) {
  if (type === "upside") return "收益线";
  if (type === "cost") return "代价线";
  return "机会线";
}

function uncertaintyLabel(value: Branch["riskReward"]["uncertainty"]) {
  if (value === "low") return "低";
  if (value === "medium") return "中";
  return "高";
}

function normalizeProviders(value: unknown): HubProvider[] {
  if (!Array.isArray(value)) return fallbackProviders;

  const providers = value
    .filter((item): item is HubProvider => Boolean(item && typeof item === "object" && "id" in item))
    .filter((item) => providerOrder.includes(item.id))
    .map((item) => ({
      ...item,
      name: item.name || providerLabels[item.id],
      defaultModel: item.defaultModel || defaultModels[item.id],
      models: Array.isArray(item.models) ? item.models : [defaultModels[item.id]],
      enabledModels: Array.isArray(item.enabledModels) ? item.enabledModels : [],
      enabled: Boolean(item.enabled),
      configured: Boolean(item.configured)
    }));

  return providerOrder.map((id) => providers.find((item) => item.id === id) || fallbackProviders.find((item) => item.id === id)!);
}

function providerModelOptions(provider: HubProvider) {
  return uniqueStrings([
    ...provider.enabledModels,
    provider.defaultModel,
    ...provider.models,
    ...modelSuggestions[provider.id]
  ]);
}

function pickModel(provider: HubProvider, currentModel: string) {
  const options = providerModelOptions(provider);
  if (currentModel && options.includes(currentModel)) return currentModel;
  return provider.enabledModels[0] || provider.defaultModel || options[0] || defaultModels[provider.id];
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function readResponseMessage(payload: ProvidersResponse) {
  if (typeof payload.error === "string") return payload.error;
  if (payload.error && typeof payload.error.message === "string") return payload.error.message;
  return payload.message || "";
}

function apiPath(path: string) {
  const normalizedPath = path.replace(/^\/+/, "");
  const baseUrl = import.meta.env.BASE_URL || "/";
  return new URL(normalizedPath, `${window.location.origin}${baseUrl}`).pathname;
}
