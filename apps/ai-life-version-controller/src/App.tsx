import {
  AlertTriangle,
  Check,
  CircleDot,
  ClipboardCheck,
  Download,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  GitMerge,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Save,
  Send,
  Terminal,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  createId,
  defaultModels,
  type BranchPlan,
  type BranchStatus,
  type CommitPlan,
  type ConflictStatus,
  type GenerateResponse,
  type LifeRepoInput,
  type LifeRepoPlan,
  type Provider
} from "./shared/contracts";

const basePath = normalizeBasePath(import.meta.env.BASE_URL || "/");
const repoStorageKey = "life-vcs-last-plan";
const hubProvider: Provider = "openai";

interface HubProvider {
  id: Provider;
  label: string;
  model: string;
  models: string[];
  enabledModels: string[];
  enabled: boolean;
  configured: boolean;
}

interface ProvidersResponse {
  providers?: HubProvider[];
  hubUrl?: string;
  error?: { message?: string };
}

const initialInput: LifeRepoInput = {
  repoName: "life/main",
  currentState: "我正在做 AI 产品原型，想把选择从脑内焦虑变成可验证的行动。",
  decision: "我是否应该把接下来 90 天押在一个 AI 小产品方向上？",
  values: "成长、自由、长期复利、稳定现金流",
  constraints: "每天可投入 2-3 小时，不能牺牲健康和核心关系。",
  resources: "有前端开发能力、AI API 使用经验、可做快速原型。",
  timeHorizon: "未来 90 天"
};

export function App() {
  const [input, setInput] = useState<LifeRepoInput>(initialInput);
  const [plan, setPlan] = useState<LifeRepoPlan | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState("main");
  const [commitMessage, setCommitMessage] = useState("commit: run first validation step");
  const [commitWhy, setCommitWhy] = useState("制造一个真实证据，而不是继续想象。");
  const [commitNext, setCommitNext] = useState("今天完成 45 分钟验证并记录结果。");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [model, setModel] = useState(defaultModels.openai);
  const [modelReady, setModelReady] = useState(false);
  const [configStatus, setConfigStatus] = useState<"loading" | "ready" | "error">("loading");
  const [configMessage, setConfigMessage] = useState("正在读取 Hub 当前项目型号...");
  const [hubUrl, setHubUrl] = useState("/hub/#models");

  useEffect(() => {
    const savedPlan = loadSavedPlan();
    if (savedPlan) {
      setPlan(savedPlan);
      setSelectedBranchId(savedPlan.head || savedPlan.branches[0]?.id || "main");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadHubModel() {
      try {
        const response = await fetch(apiPath("/api/providers"), { cache: "no-store" });
        const payload = (await response.json()) as ProvidersResponse;
        if (!response.ok) {
          throw new Error(payload.error?.message || "读取 Hub 当前项目型号失败。");
        }

        const provider = payload.providers?.find((item) => item.id === "openai");
        const availableModels = uniqueGptModels(
          provider?.enabledModels?.length ? provider.enabledModels : provider?.models || []
        );
        const selectedModel = provider && /^gpt-/i.test(provider.model) && availableModels.includes(provider.model)
          ? provider.model
          : availableModels[0] || defaultModels.openai;
        const ready = Boolean(provider?.enabled && provider.configured && availableModels.includes(selectedModel));

        if (cancelled) return;
        setModel(selectedModel);
        setModelReady(ready);
        setConfigStatus(ready ? "ready" : "error");
        setConfigMessage(
          ready
            ? `Hub 当前项目型号已就绪：${selectedModel}。`
            : "Hub 暂未为本项目启用 GPT 型号，请先完成统一配置。"
        );
        setHubUrl(payload.hubUrl || "/hub/#models");
      } catch (caught) {
        if (cancelled) return;
        setModelReady(false);
        setConfigStatus("error");
        setConfigMessage(caught instanceof Error ? caught.message : "读取 Hub 当前项目型号失败。");
      }
    }

    loadHubModel();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (plan) localStorage.setItem(repoStorageKey, JSON.stringify(plan));
  }, [plan]);

  const branch = useMemo(() => {
    if (!plan) return null;
    return plan.branches.find((item) => item.id === selectedBranchId) || plan.branches[0] || null;
  }, [plan, selectedBranchId]);

  const branchStats = useMemo(() => {
    if (!plan) return { active: 0, openConflicts: 0, commits: 0 };
    return {
      active: plan.branches.filter((item) => item.status === "active").length,
      openConflicts: plan.conflicts.filter((item) => item.resolutionStatus === "open").length,
      commits: plan.commits.length + 1
    };
  }, [plan]);

  const canGenerate = input.decision.trim().length > 4 && modelReady && !isLoading;

  function updateInput(field: keyof LifeRepoInput, value: string) {
    setInput((current) => ({ ...current, [field]: value }));
  }

  async function generatePlan() {
    setIsLoading(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(apiPath("/api/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: hubProvider,
          model,
          input
        })
      });
      const body = (await response.json()) as GenerateResponse | { error?: { message?: string } };

      if (!response.ok) {
        throw new Error("error" in body ? body.error?.message || "生成失败。" : "生成失败。");
      }

      const nextPlan = (body as GenerateResponse).data;
      setPlan(nextPlan);
      setSelectedBranchId(nextPlan.head || nextPlan.branches[0]?.id || "main");
      setCommitMessage(nextPlan.nextCommit.message);
      setCommitWhy(nextPlan.nextCommit.why);
      setCommitNext(nextPlan.nextCommit.nextAction);
      setNotice(`Hub ${String((body as GenerateResponse).meta.model)} 已生成版本库`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成失败，请检查模型配置。");
    } finally {
      setIsLoading(false);
    }
  }

  function resolveConflict(id: string, resolutionStatus: ConflictStatus) {
    if (!plan) return;
    setPlan({
      ...plan,
      conflicts: plan.conflicts.map((conflict) => (conflict.id === id ? { ...conflict, resolutionStatus } : conflict))
    });
  }

  function updateBranchStatus(id: string, status: BranchStatus) {
    if (!plan) return;
    setPlan({
      ...plan,
      branches: plan.branches.map((item) => (item.id === id ? { ...item, status } : item))
    });
  }

  function saveCommit(type: CommitPlan["type"] = "action") {
    if (!plan || !branch) return;
    const commit: CommitPlan = {
      id: createId("commit"),
      branchId: branch.id,
      message: commitMessage.trim() || plan.nextCommit.message,
      type,
      why: commitWhy.trim() || plan.nextCommit.why,
      evidence: [branch.hypothesis, input.decision].filter(Boolean),
      nextAction: commitNext.trim() || plan.nextCommit.nextAction,
      createdAt: new Date().toISOString()
    };
    setPlan({
      ...plan,
      commits: [commit, ...plan.commits],
      terminalLog: [
        {
          command: `life commit -b ${branch.name} -m "${commit.message}"`,
          output: "commit saved to reflog"
        },
        ...plan.terminalLog
      ]
    });
    setNotice("commit 已保存");
  }

  function resetDemo() {
    localStorage.removeItem(repoStorageKey);
    setPlan(null);
    setSelectedBranchId("main");
    setNotice("工作台已清空");
  }

  function exportPlan(format: "markdown" | "json") {
    if (!plan) return;
    const blob =
      format === "json"
        ? new Blob([JSON.stringify(plan, null, 2)], { type: "application/json;charset=utf-8" })
        : new Blob([toMarkdown(plan)], { type: "text/markdown;charset=utf-8" });
    const link = document.createElement("a");
    link.download = `${plan.repoName.replace(/[^\w.-]+/g, "-") || "life-repo"}.${format === "json" ? "json" : "md"}`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    setNotice(format === "json" ? "JSON 已导出" : "Markdown 已导出");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <GitBranch size={25} />
          </div>
          <div>
            <p>AI Life Version Controller</p>
            <h1>AI 人生版本控制器</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <button type="button" className="ghost-button" onClick={() => exportPlan("markdown")} disabled={!plan}>
            <Download size={17} />
            <span>MD</span>
          </button>
          <button type="button" className="ghost-button" onClick={() => exportPlan("json")} disabled={!plan}>
            <Download size={17} />
            <span>JSON</span>
          </button>
          <button type="button" className="ghost-button danger" onClick={resetDemo}>
            <Trash2 size={17} />
            <span>Clear</span>
          </button>
        </div>
      </header>

      <section className="layout-grid">
        <aside className="left-rail" aria-label="输入与模型配置">
          <section className="panel model-panel" aria-labelledby="hub-model-title">
            <div className="panel-heading">
              <CircleDot size={18} />
              <h2 id="hub-model-title">Hub 当前项目型号</h2>
              <span>{configStatus === "loading" ? "读取中" : modelReady ? "已就绪" : "未配置"}</span>
            </div>
            <div className={`hub-model-state is-${configStatus}`} role="status">
              <strong>{model}</strong>
              <p>{configMessage}</p>
              {!modelReady && configStatus !== "loading" ? <a href={hubUrl}>前往 Hub 配置</a> : null}
            </div>
            <p className="model-guidance">切换 GPT 型号请使用页面顶部统一模型选择器；项目内不再配置厂商、模型或 API Key。</p>
          </section>

          <section className="panel input-panel" aria-labelledby="input-title">
            <div className="panel-heading">
              <ClipboardCheck size={18} />
              <h2 id="input-title">Life Repo Init</h2>
            </div>

            <label className="field">
              <span>repo</span>
              <input value={input.repoName} onChange={(event) => updateInput("repoName", event.target.value)} />
            </label>
            <label className="field">
              <span>当前状态</span>
              <textarea value={input.currentState} onChange={(event) => updateInput("currentState", event.target.value)} />
            </label>
            <label className="field">
              <span>这次要管理的选择</span>
              <textarea value={input.decision} onChange={(event) => updateInput("decision", event.target.value)} />
            </label>
            <label className="field">
              <span>价值观</span>
              <input value={input.values} onChange={(event) => updateInput("values", event.target.value)} />
            </label>
            <label className="field">
              <span>约束</span>
              <textarea value={input.constraints} onChange={(event) => updateInput("constraints", event.target.value)} />
            </label>
            <label className="field">
              <span>资源</span>
              <input value={input.resources} onChange={(event) => updateInput("resources", event.target.value)} />
            </label>
            <label className="field">
              <span>时间窗口</span>
              <input value={input.timeHorizon} onChange={(event) => updateInput("timeHorizon", event.target.value)} />
            </label>

            <button type="button" className="primary-button" disabled={!canGenerate} onClick={generatePlan}>
              {isLoading ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
              <span>{isLoading ? "生成中" : "life init && analyze"}</span>
            </button>
            {error ? (
              <div className="error-box" role="alert">
                <AlertTriangle size={17} />
                <span>{error}</span>
              </div>
            ) : null}
            {notice ? (
              <div className="notice-box" role="status">
                <Check size={17} />
                <span>{notice}</span>
              </div>
            ) : null}
          </section>
        </aside>

        <section className="workspace" aria-label="人生版本控制工作台">
          <section className="repo-status panel" aria-labelledby="status-title">
            <div>
              <p className="eyebrow">HEAD -&gt; {plan?.head || "uninitialized"}</p>
              <h2 id="status-title">{plan?.repoName || "life/main"}</h2>
              <p>{plan?.statusSummary || "还没有版本库。输入当前状态和选择，生成第一版人生分支图。"}</p>
            </div>
            <div className="status-metrics" aria-label="版本库状态">
              <Metric label="active branches" value={plan ? branchStats.active : 0} />
              <Metric label="open conflicts" value={plan ? branchStats.openConflicts : 0} />
              <Metric label="commits" value={plan ? branchStats.commits : 0} />
            </div>
          </section>

          <section className="panel branch-board" aria-labelledby="branches-title">
            <div className="panel-heading">
              <GitBranch size={18} />
              <h2 id="branches-title">Branch Graph</h2>
              <span>{plan ? `${plan.branches.length} branches` : "empty"}</span>
            </div>

            {plan ? (
              <div className="branch-list">
                {plan.branches.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={selectedBranchId === item.id ? "branch-row active" : "branch-row"}
                    onClick={() => setSelectedBranchId(item.id)}
                  >
                    <span className={`branch-node ${item.status}`} />
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.description}</span>
                    </div>
                    <em>{branchStatusLabel(item.status)}</em>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyPanel icon={GitBranch} title="等待 init" text="生成后会出现 main、feature、hotfix 分支。" />
            )}
          </section>

          <section className="panel diff-viewer" aria-labelledby="diff-title">
            <div className="panel-heading">
              <GitCompareArrows size={18} />
              <h2 id="diff-title">Diff Viewer</h2>
              <span>main..feature</span>
            </div>
            {plan ? (
              <div className="diff-list">
                {plan.diff.map((item) => (
                  <article className="diff-row" key={`${item.dimension}-${item.current}`}>
                    <div className="diff-head">
                      <strong>{item.dimension}</strong>
                      <span className={`impact ${item.impact}`}>{impactLabel(item.impact)}</span>
                    </div>
                    <div className="diff-columns">
                      <p>
                        <span>- main</span>
                        {item.current}
                      </p>
                      <p>
                        <span>+ incoming</span>
                        {item.incoming}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyPanel icon={GitCompareArrows} title="暂无 diff" text="AI 会把路线差异拆成可比较的代价、收益和可逆性。" />
            )}
          </section>

          <section className="panel conflict-board" aria-labelledby="conflict-title">
            <div className="panel-heading">
              <AlertTriangle size={18} />
              <h2 id="conflict-title">Conflict Resolver</h2>
              <span>{plan ? `${branchStats.openConflicts} open` : "idle"}</span>
            </div>
            {plan ? (
              <div className="conflict-list">
                {plan.conflicts.map((conflict) => (
                  <article className="conflict-item" key={conflict.id}>
                    <div className="conflict-title-row">
                      <div>
                        <strong>{conflict.title}</strong>
                        <span>{conflict.branches.join(" <-> ")}</span>
                      </div>
                      <em className={`severity ${conflict.severity}`}>{severityLabel(conflict.severity)}</em>
                    </div>
                    <p>{conflict.recommendation}</p>
                    <div className="tag-row">
                      {conflict.dimensions.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                    <div className="resolver-actions">
                      <button type="button" onClick={() => resolveConflict(conflict.id, "current")}>
                        <Check size={15} />
                        accept current
                      </button>
                      <button type="button" onClick={() => resolveConflict(conflict.id, "incoming")}>
                        <GitMerge size={15} />
                        accept incoming
                      </button>
                      <button type="button" onClick={() => resolveConflict(conflict.id, "manual")}>
                        <RefreshCcw size={15} />
                        manual merge
                      </button>
                    </div>
                    <small>status: {conflict.resolutionStatus}</small>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyPanel icon={AlertTriangle} title="没有冲突" text="冲突会被翻译成价值观、资源和行动节奏的具体矛盾。" />
            )}
          </section>
        </section>

        <aside className="right-rail" aria-label="分支详情和 commit">
          <section className="panel terminal-panel" aria-labelledby="terminal-title">
            <div className="panel-heading">
              <Terminal size={18} />
              <h2 id="terminal-title">Terminal</h2>
            </div>
            <div className="terminal-lines">
              {(plan?.terminalLog || [
                { command: "life status", output: "working tree clean; no repo initialized" },
                { command: "life init", output: "waiting for input" }
              ]).map((line, index) => (
                <div key={`${line.command}-${index}`}>
                  <span>$ {line.command}</span>
                  <p>{line.output}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="panel branch-detail" aria-labelledby="branch-title">
            <div className="panel-heading">
              <CircleDot size={18} />
              <h2 id="branch-title">Selected Branch</h2>
              <span>{branch?.name || "none"}</span>
            </div>
            {branch ? (
              <>
                <h3>{branch.name}</h3>
                <p>{branch.hypothesis}</p>
                <DetailList title="tradeoffs" items={branch.tradeoffs} />
                <DetailList title="risks" items={branch.risks} />
                <DetailList title="signals" items={branch.signals} />
                <div className="rollback-box">
                  <RotateCcw size={17} />
                  <span>{branch.rollbackPoint}</span>
                </div>
                <div className="branch-actions">
                  <button type="button" onClick={() => updateBranchStatus(branch.id, "merged")}>
                    <GitMerge size={16} />
                    merge
                  </button>
                  <button type="button" onClick={() => updateBranchStatus(branch.id, "abandoned")}>
                    <X size={16} />
                    abandon
                  </button>
                </div>
              </>
            ) : (
              <EmptyPanel icon={CircleDot} title="未选择分支" text="生成版本库后可查看每条分支的假设、风险和回滚点。" />
            )}
          </section>

          <section className="panel commit-composer" aria-labelledby="commit-title">
            <div className="panel-heading">
              <GitCommitHorizontal size={18} />
              <h2 id="commit-title">Next Commit</h2>
            </div>
            <label className="field">
              <span>message</span>
              <input value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} />
            </label>
            <label className="field">
              <span>why</span>
              <textarea value={commitWhy} onChange={(event) => setCommitWhy(event.target.value)} />
            </label>
            <label className="field">
              <span>next action</span>
              <textarea value={commitNext} onChange={(event) => setCommitNext(event.target.value)} />
            </label>
            <div className="commit-actions">
              <button type="button" className="primary-button compact" disabled={!plan} onClick={() => saveCommit("action")}>
                <Save size={17} />
                save commit
              </button>
              <button type="button" className="ghost-button" disabled={!plan} onClick={() => saveCommit("rollback")}>
                <RotateCcw size={17} />
                rollback note
              </button>
            </div>
          </section>

          <section className="panel reflog" aria-labelledby="reflog-title">
            <div className="panel-heading">
              <GitCommitHorizontal size={18} />
              <h2 id="reflog-title">Reflog</h2>
              <span>{plan ? `${plan.commits.length} saved` : "empty"}</span>
            </div>
            {plan ? (
              <ol>
                {plan.commits.map((commit) => (
                  <li key={commit.id}>
                    <strong>{commit.message}</strong>
                    <span>{commit.why}</span>
                    <time dateTime={commit.createdAt}>{formatDate(commit.createdAt)}</time>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyPanel icon={GitCommitHorizontal} title="暂无 commit" text="每次选择、行动和复盘都会留下可追溯记录。" />
            )}
          </section>
        </aside>
      </section>
    </main>
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

function EmptyPanel({
  icon: Icon,
  title,
  text
}: {
  icon: typeof GitBranch;
  title: string;
  text: string;
}) {
  return (
    <div className="empty-panel">
      <Icon size={24} />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="detail-list">
      <span>{title}</span>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function loadSavedPlan() {
  try {
    const raw = localStorage.getItem(repoStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LifeRepoPlan;
    return Array.isArray(parsed.branches) ? parsed : null;
  } catch {
    return null;
  }
}

function toMarkdown(plan: LifeRepoPlan) {
  const lines = [
    `# ${plan.repoName}`,
    "",
    `HEAD -> ${plan.head}`,
    "",
    plan.statusSummary,
    "",
    "## Branches",
    ...plan.branches.flatMap((branch) => [
      "",
      `### ${branch.name}`,
      `- status: ${branch.status}`,
      `- hypothesis: ${branch.hypothesis}`,
      `- rollback: ${branch.rollbackPoint}`,
      `- next: ${branch.nextCommit}`
    ]),
    "",
    "## Conflicts",
    ...plan.conflicts.flatMap((conflict) => [
      "",
      `### ${conflict.title}`,
      `- severity: ${conflict.severity}`,
      `- branches: ${conflict.branches.join(", ")}`,
      `- recommendation: ${conflict.recommendation}`
    ]),
    "",
    "## Reflog",
    ...plan.commits.map((commit) => `- ${commit.message}: ${commit.why}`)
  ];
  return lines.join("\n");
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function branchStatusLabel(status: BranchStatus) {
  const labels: Record<BranchStatus, string> = {
    current: "HEAD",
    active: "active",
    abandoned: "abandoned",
    merged: "merged"
  };
  return labels[status];
}

function impactLabel(value: "low" | "medium" | "high") {
  return value === "high" ? "high impact" : value === "medium" ? "medium" : "low";
}

function severityLabel(value: "low" | "medium" | "high") {
  return value === "high" ? "conflict high" : value === "medium" ? "conflict medium" : "conflict low";
}

function uniqueGptModels(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => /^gpt-/i.test(value))));
}

function apiPath(path: string) {
  return `${basePath}${path}`.replace(/\/{2,}/g, "/");
}

function normalizeBasePath(value: string) {
  if (!value || value === "/") return "";
  return `/${value.replace(/^\/+|\/+$/g, "")}`;
}
