import {
  AlertTriangle,
  BadgeCheck,
  Clipboard,
  Loader2,
  MessageSquareText,
  Scale,
  Send,
  ShieldCheck,
  Sparkles,
  UserRoundCog,
  Vote
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  defaultModels,
  isGptModel,
  roleLabels,
  voteLabels,
  type BoardReport,
  type GenerateRequest,
  type GenerateResponse,
  type RealProvider,
  type Vote as BoardVote
} from "./shared/contracts";

type FormState = GenerateRequest;

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

const fallbackProvider: HubProvider = {
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
  provider: "openai",
  model: defaultModels.openai,
  input: {
    idea: "AI · 一人董事会：输入一个项目想法，由 CEO、CFO、用户、工程师、设计师轮流质询，最后投票判断是否继续做。",
    targetUser: "独立开发者、早期创业者、产品经理",
    problem: "早期项目想法容易自嗨，缺少结构化反对意见和下一步验证动作。",
    businessModel: "按次生成报告，或订阅保存项目历史。",
    constraints: "MVP 只做单次评审，不做登录和历史库。"
  }
};

export function App() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [report, setReport] = useState<BoardReport | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<HubProvider>(fallbackProvider);
  const [hubUrl, setHubUrl] = useState("/hub/#models");
  const [configStatus, setConfigStatus] = useState<"loading" | "ready" | "error">("loading");
  const [configMessage, setConfigMessage] = useState("正在读取 Hub 模型配置...");

  const activeModel = form.model || pickModel(selectedProvider);
  const canUseModel = Boolean(selectedProvider.enabled && selectedProvider.configured && isGptModel(activeModel));
  const canGenerate = form.input.idea.trim().length >= 6;
  const configLabel =
    configStatus === "loading" ? "读取 Hub 配置中" : canUseModel ? `Hub · ${activeModel}` : "Hub GPT 未就绪";

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
        const nextModel = pickModel(nextProvider);

        if (cancelled) return;
        setSelectedProvider(nextProvider);
        setForm((current) => ({ ...current, provider: "openai", model: nextModel }));
        setHubUrl(payload.hubUrl || "/hub/#models");
        setConfigStatus(ready ? "ready" : "error");
        setConfigMessage(
          ready
            ? `Hub 当前项目型号：${nextModel}`
            : "请先在 AI Hub 配置 AI Routing Key，并在页面顶部为本项目选择 GPT 型号。"
        );
      } catch (caught) {
        if (cancelled) return;
        setConfigStatus("error");
        setConfigMessage(caught instanceof Error ? caught.message : "读取 Hub 模型配置失败。");
        setSelectedProvider(fallbackProvider);
        setForm((current) => ({ ...current, provider: "openai", model: defaultModels.openai }));
      }
    }

    void loadProviders();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateInput(field: keyof FormState["input"], value: string) {
    setForm((current) => ({
      ...current,
      input: {
        ...current.input,
        [field]: value
      }
    }));
  }

  async function submit() {
    if (!canGenerate || !canUseModel) {
      setStatus("error");
      setError("请先在页面顶部为本项目选择可用的 GPT 型号。");
      return;
    }

    setStatus("loading");
    setError("");
    setNotice("");

    try {
      const requestPayload: FormState = {
        ...form,
        provider: "openai",
        model: activeModel
      };
      const response = await fetch(apiPath("/api/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload)
      });
      const payload = (await response.json()) as unknown;

      if (!response.ok || isApiError(payload)) {
        throw new Error(isApiError(payload) ? payload.error.message : "生成失败，请稍后重试。");
      }

      const generated = payload as GenerateResponse;
      setReport(generated.data);
      setStatus("ready");
      setNotice(`已通过 Hub 当前选择的 ${generated.meta.model} 生成报告。`);
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "生成董事会报告时发生未知错误。");
    }
  }

  async function copyMarkdown() {
    if (!report) return;
    await navigator.clipboard.writeText(toMarkdown(report));
    setNotice("Markdown 已复制。");
  }

  return (
    <main className="app-shell">
      <section className="workspace" aria-labelledby="app-title">
        <div className="brief">
          <div className="brand-row">
            <div className="brand-mark" aria-hidden="true">
              <Scale size={24} />
            </div>
            <div>
              <p className="eyebrow">AI Decision Room</p>
              <h1 id="app-title">AI · 一人董事会</h1>
            </div>
          </div>

          <div className="form-stack">
            <label className="field" htmlFor="board-idea">
              <span>项目想法</span>
              <textarea
                id="board-idea"
                value={form.input.idea}
                onChange={(event) => updateInput("idea", event.target.value)}
                rows={6}
                maxLength={4000}
              />
            </label>

            <div className="field-grid">
              <label className="field" htmlFor="target-user">
                <span>目标用户</span>
                <input id="target-user" value={form.input.targetUser} onChange={(event) => updateInput("targetUser", event.target.value)} />
              </label>
              <label className="field" htmlFor="business-model">
                <span>商业模式</span>
                <input
                  id="business-model"
                  value={form.input.businessModel}
                  onChange={(event) => updateInput("businessModel", event.target.value)}
                />
              </label>
            </div>

            <label className="field" htmlFor="core-problem">
              <span>要解决的问题</span>
              <input id="core-problem" value={form.input.problem} onChange={(event) => updateInput("problem", event.target.value)} />
            </label>

            <label className="field" htmlFor="project-constraints">
              <span>约束</span>
              <input id="project-constraints" value={form.input.constraints} onChange={(event) => updateInput("constraints", event.target.value)} />
            </label>
          </div>
        </div>

        <aside className="control-rail" aria-label="Hub 当前项目型号">
          <div className="rail-section">
            <div className="section-title">
              <Sparkles size={18} />
              <h2>Hub 当前项目型号</h2>
            </div>
            <p className="model-guidance">切换 GPT 型号请使用页面顶部统一模型选择器；项目内不再配置厂商、模型或 API Key。</p>
            <a className={`config-badge ${canUseModel ? "ready" : configStatus}`} href={hubUrl} title={configMessage}>
              {canUseModel ? <BadgeCheck size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
              {configLabel}
            </a>
          </div>

          <button
            className="primary-action"
            type="button"
            disabled={!canGenerate || !canUseModel || status === "loading"}
            onClick={submit}
          >
            {status === "loading" ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
            <span>{status === "loading" ? "质询中" : "召开董事会"}</span>
          </button>

          <div className="trust-strip" role="note">
            <ShieldCheck size={18} />
            <span>{configMessage}</span>
          </div>
        </aside>
      </section>

      <section className="result-zone" aria-live="polite">
        {status === "loading" ? <LoadingBoard /> : null}
        {status === "error" ? <ErrorState message={error} /> : null}
        {report ? <ReportView report={report} notice={notice} onCopy={copyMarkdown} /> : null}
        {!report && status === "idle" ? <EmptyBoard /> : null}
      </section>
    </main>
  );
}

function EmptyBoard() {
  return (
    <div className="empty-state">
      <UserRoundCog size={36} />
      <h2>董事席已就位</h2>
      <p>等待第一份会议纪要。</p>
      <div className="empty-preview" aria-label="生成后会得到的内容">
        <span>5 位角色质询</span>
        <span>GO / PIVOT / KILL 投票</span>
        <span>7 天验证动作</span>
      </div>
    </div>
  );
}

function LoadingBoard() {
  return (
    <div className="loading-board" aria-busy="true" aria-label="董事会生成中">
      {["CEO", "CFO", "用户", "工程师", "设计师"].map((role) => (
        <div className="loading-row" key={role}>
          <span>{role}</span>
          <i />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="error-state" role="alert">
      <AlertTriangle size={24} />
      <div>
        <h2>生成失败</h2>
        <p>{message}</p>
      </div>
    </div>
  );
}

function ReportView({ report, notice, onCopy }: { report: BoardReport; notice: string; onCopy: () => void }) {
  const final = report.finalDecision;
  const voteItems: BoardVote[] = ["GO", "PIVOT", "VALIDATE", "KILL"];

  return (
    <article className="report" aria-labelledby="decision-title">
      <header className="report-header">
        <div>
          <p className="eyebrow">Board Decision</p>
          <h2 id="decision-title">{voteLabels[final.recommendation]}</h2>
          <p>{final.summary}</p>
        </div>
        <div className={`decision-badge vote-${final.recommendation.toLowerCase()}`}>
          <BadgeCheck size={18} />
          <span>{final.confidence}%</span>
        </div>
      </header>

      <div className="vote-bar" aria-label="投票分布">
        {voteItems.map((vote) => (
          <div className="vote-tile" key={vote}>
            <span>{voteLabels[vote]}</span>
            <strong>{report.voteTally[vote]}</strong>
          </div>
        ))}
      </div>

      <section className="summary-grid">
        <InfoBlock title="目标用户" text={report.ideaSummary.targetUser} />
        <InfoBlock title="最危险假设" text={report.ideaSummary.riskiestAssumption} />
        <InfoBlock title="AI 价值" text={report.ideaSummary.aiValue} />
      </section>

      <section className="director-list" aria-label="董事质询">
        {report.directors.map((director) => (
          <article className="director-item" key={director.role}>
            <div className="director-head">
              <div>
                <p className="eyebrow">{roleLabels[director.role]}</p>
                <h3>{director.stance}</h3>
              </div>
              <span className={`vote-pill vote-${director.vote.toLowerCase()}`}>
                <Vote size={14} />
                {voteLabels[director.vote]}
              </span>
            </div>
            <ol>
              {director.questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ol>
            <div className="risk-line">
              <MessageSquareText size={16} />
              <span>{director.strongestRisk}</span>
            </div>
            <p className="experiment">{director.suggestedExperiment}</p>
          </article>
        ))}
      </section>

      <section className="action-band">
        <div>
          <h3>7 天验证动作</h3>
          <ol>
            {final.sevenDayPlan.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
        <div>
          <h3>停止条件</h3>
          <ul>
            {final.killCriteria.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="report-footer">
        <p>{final.nextQuestion}</p>
        <button className="secondary-action" type="button" onClick={onCopy}>
          <Clipboard size={17} />
          <span>复制 Markdown</span>
        </button>
      </footer>
      {notice ? <p className="notice">{notice}</p> : null}
    </article>
  );
}

function InfoBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="info-block">
      <span>{title}</span>
      <p>{text}</p>
    </div>
  );
}

function toMarkdown(report: BoardReport) {
  const lines = [
    `# ${report.ideaSummary.title}`,
    "",
    `**最终建议：** ${voteLabels[report.finalDecision.recommendation]} (${report.finalDecision.confidence}%)`,
    "",
    report.finalDecision.summary,
    "",
    "## 投票",
    `- 继续做：${report.voteTally.GO}`,
    `- 调整后做：${report.voteTally.PIVOT}`,
    `- 先验证：${report.voteTally.VALIDATE}`,
    `- 不建议做：${report.voteTally.KILL}`,
    "",
    "## 董事质询",
    ...report.directors.flatMap((director) => [
      "",
      `### ${roleLabels[director.role]}：${voteLabels[director.vote]}`,
      director.stance,
      ...director.questions.map((question) => `- ${question}`),
      `- 最大风险：${director.strongestRisk}`,
      `- 建议实验：${director.suggestedExperiment}`
    ]),
    "",
    "## 7 天验证动作",
    ...report.finalDecision.sevenDayPlan.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## 停止条件",
    ...report.finalDecision.killCriteria.map((item) => `- ${item}`)
  ];
  return lines.join("\n");
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
  return `${basePath}${path}`.replace(/\/{2,}/g, "/");
}

function isApiError(value: unknown): value is { error: { message: string } } {
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
