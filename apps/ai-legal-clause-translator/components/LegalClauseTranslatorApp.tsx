"use client";

import { useEffect, useMemo, useState } from "react";
import { buildMarkdownExport, defaultModels } from "../lib/legal-analysis.ts";
import type { ClauseAnalysisResult, OutputLanguage, Provider, RiskLevel } from "../lib/types.ts";

const sampleClause =
  "乙方应对在合作过程中获悉的甲方商业秘密、客户资料、技术文档及其他未公开信息承担保密义务。未经甲方书面同意，乙方不得向任何第三方披露、复制、转让或以其他方式使用该等信息。乙方违反本条约定的，应赔偿甲方因此遭受的全部损失，包括但不限于调查费用、律师费、诉讼费及商誉损失。本保密义务在本协议终止后继续有效五年。";

const contractTypes = ["NDA / 保密协议", "服务合同", "采购合同", "劳动 / 顾问协议", "租赁合同", "投资协议", "通用条款"];

const roles = ["乙方 / 服务方", "甲方 / 客户方", "买方", "卖方", "雇主", "员工 / 顾问", "其他"];

type HubProvider = {
  id: Provider;
  name: string;
  adapter?: string;
  defaultModel: string;
  models: string[];
  enabledModels: string[];
  enabled: boolean;
  configured: boolean;
};

const fallbackProviders: HubProvider[] = [{
  id: "openai",
  name: "GPT · AI Routing",
  defaultModel: defaultModels.openai,
  models: [defaultModels.openai],
  enabledModels: [],
  enabled: false,
  configured: false,
}];

interface AnalyzeResponse {
  result?: ClauseAnalysisResult;
  error?: string | { message?: string };
  message?: string;
  details?: string[];
}

interface ProvidersResponse {
  providers?: HubProvider[];
  configured?: boolean;
  hubUrl?: string;
  error?: string | { message?: string };
  message?: string;
}

export function LegalClauseTranslatorApp() {
  const [providers, setProviders] = useState<HubProvider[]>(fallbackProviders);
  const provider: Provider = "openai";
  const [model, setModel] = useState(defaultModels.openai);
  const [hubUrl, setHubUrl] = useState("/hub/#models");
  const [configStatus, setConfigStatus] = useState<"loading" | "ready" | "error">("loading");
  const [configMessage, setConfigMessage] = useState("正在读取 Hub 模型配置...");
  const [clauseText, setClauseText] = useState(sampleClause);
  const [userRole, setUserRole] = useState(roles[0]);
  const [contractType, setContractType] = useState(contractTypes[0]);
  const [jurisdiction, setJurisdiction] = useState("中国大陆");
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>("zh-CN");
  const [acknowledged, setAcknowledged] = useState(false);
  const [result, setResult] = useState<ClauseAnalysisResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const selectedProvider = useMemo(
    () => providers.find((item) => item.id === provider) || fallbackProviders[0],
    [providers],
  );
  const modelOptions = useMemo(() => providerModelOptions(selectedProvider), [selectedProvider]);
  const activeModel = model || selectedProvider.defaultModel || defaultModels.openai;
  const canUseModel = Boolean(selectedProvider.enabled && selectedProvider.configured && modelOptions.includes(activeModel));
  const canSubmit = canUseModel && clauseText.trim().length >= 20 && acknowledged && status !== "loading";
  const charCount = clauseText.length;
  const qualityWarningCount = result?.qualityWarnings?.length ?? 0;
  const topRisk = useMemo(() => {
    if (!result?.risks.length) {
      return null;
    }

    if (result.risks.some((risk) => risk.level === "HIGH")) {
      return "HIGH";
    }

    if (result.risks.some((risk) => risk.level === "MEDIUM")) {
      return "MEDIUM";
    }

    return "LOW";
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
          nextProviders.find((item) => item.enabled && item.configured) ||
          nextProviders[0];
        const nextModel = pickModel(nextProvider, model);
        const isReady = Boolean(nextProvider.enabled && nextProvider.configured && providerModelOptions(nextProvider).includes(nextModel));

        if (cancelled) return;
        setProviders(nextProviders);
        setModel(nextModel);
        setHubUrl(payload.hubUrl || "/hub/#models");
        setConfigStatus(isReady ? "ready" : "error");
        setConfigMessage(
          isReady
            ? `Hub 当前项目型号已就绪：${nextModel}。`
            : "Hub 暂未为本项目启用 GPT 型号，请先在 Hub 配置。",
        );
      } catch (error) {
        if (cancelled) return;
        setConfigStatus("error");
        setConfigMessage(error instanceof Error ? error.message : "读取 Hub 模型配置失败。");
      }
    }

    loadProviders();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAnalyze() {
    if (!canUseModel) {
      setStatus("error");
      setMessage("当前 Hub 模型未配置，请先在 Hub 里启用可用模型。");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch(apiPath("/api/analyze"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          provider,
          model: activeModel,
          clauseText,
          userRole,
          contractType,
          jurisdiction,
          outputLanguage,
        }),
      });

      const data = (await response.json()) as AnalyzeResponse;
      if (!response.ok || !data.result) {
        const details = data.details?.join(" ");
        throw new Error(details || readResponseMessage(data) || "分析失败，请检查 Hub 模型配置或稍后再试。");
      }

      setResult(data.result);
      setStatus("success");
      setMessage("分析完成。请把结果当作合同阅读辅助，关键决策仍建议交给律师复核。");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "分析失败，请稍后再试。");
    }
  }

  function handleExport() {
    if (!result) {
      return;
    }

    const blob = new Blob([buildMarkdownExport(result)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "legal-clause-analysis.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleCopy() {
    if (!result) {
      return;
    }

    await navigator.clipboard.writeText(buildMarkdownExport(result));
    setMessage("Markdown 已复制。");
  }

  return (
    <main className="legal-shell">
      <section className="legal-hero" aria-labelledby="app-title">
        <div>
          <p className="eyebrow">AI Legal Clause Translator</p>
          <h1 id="app-title">AI 法务条款翻译器</h1>
          <p className="hero-copy">把合同条款拆成大白话、你的责任、对方权利和需要复核的风险点。</p>
        </div>
        <div className="hero-status" aria-label="当前分析配置">
          <span>Hub 当前项目型号</span>
          <strong>{activeModel}</strong>
          <small>{canUseModel ? "所有真实请求均通过 Hub 项目级代理。" : "当前项目型号未在 Hub 启用，请先到 Hub 配置。"}</small>
        </div>
      </section>

      {message ? (
        <div className={`notice is-${status === "error" ? "error" : "success"}`} role="status">
          {message}
        </div>
      ) : null}

      <section className="workbench">
        <form className="input-panel" onSubmit={(event) => event.preventDefault()}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Input</p>
              <h2>条款输入</h2>
            </div>
            <span className="char-counter">{charCount.toLocaleString()} / 20,000</span>
          </div>

          <section className="hub-model-panel" aria-label="Hub 当前项目型号状态">
            <div className="hub-model-summary">
              <span>Hub 当前项目型号</span>
              <strong>{activeModel}</strong>
              <small>{canUseModel ? "已就绪" : "未配置"}</small>
            </div>
            <p className="field-hint">切换 GPT 型号请使用页面顶部统一模型选择器；项目内不再配置厂商、模型或 API Key。</p>
            <div className={`model-gate is-${configStatus}`} role="status">
              <span>{configMessage}</span>
              <a className="hub-config-link" href={hubUrl} target="_blank" rel="noreferrer">
                Hub 配置
              </a>
            </div>
          </section>

          <div className="contract-settings">
            <div className="field-grid">
              <label className="field" htmlFor="legal-user-role">
                <span>你的身份</span>
                <select id="legal-user-role" value={userRole} onChange={(event) => setUserRole(event.target.value)}>
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field" htmlFor="legal-contract-type">
                <span>合同类型</span>
                <select id="legal-contract-type" value={contractType} onChange={(event) => setContractType(event.target.value)}>
                  {contractTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="field-grid">
              <label className="field" htmlFor="legal-jurisdiction">
                <span>适用地区 / 法域</span>
                <input
                  id="legal-jurisdiction"
                  value={jurisdiction}
                  onChange={(event) => setJurisdiction(event.target.value)}
                  placeholder="例如：中国大陆、加州、新加坡"
                />
              </label>

              <label className="field" htmlFor="legal-output-language">
                <span>输出语言</span>
                <select
                  id="legal-output-language"
                  value={outputLanguage}
                  onChange={(event) => setOutputLanguage(event.target.value as OutputLanguage)}
                >
                  <option value="zh-CN">简体中文</option>
                  <option value="en">English</option>
                </select>
              </label>
            </div>
          </div>

          <label className="field clause-field" htmlFor="legal-clause-text">
            <span>合同条款</span>
            <textarea id="legal-clause-text" value={clauseText} onChange={(event) => setClauseText(event.target.value)} />
          </label>

          <label className="ack-row" htmlFor="legal-acknowledgement">
            <input
              id="legal-acknowledgement"
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span className="ack-check" aria-hidden="true" />
            <span className="ack-copy">我知道这只是合同阅读辅助，不替代律师意见；我确认可以把这段文本发送给 Hub 当前选择的 GPT 型号。</span>
          </label>

          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={() => setClauseText(sampleClause)}>
              载入示例
            </button>
            <button className="primary-button" type="button" onClick={handleAnalyze} disabled={!canSubmit}>
              {status === "loading" ? "分析中..." : "翻译条款"}
            </button>
          </div>
        </form>

        <section className="result-panel" aria-live="polite">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Output</p>
              <h2>阅读结果</h2>
            </div>
            <div className="result-indicators">
              {qualityWarningCount > 0 ? <span className="review-badge">需要复核 {qualityWarningCount}</span> : null}
              {topRisk ? <RiskBadge level={topRisk} /> : null}
            </div>
          </div>

          {status === "loading" ? <LoadingState /> : result ? <ResultView result={result} onCopy={handleCopy} onExport={handleExport} /> : <EmptyResult />}
        </section>
      </section>
    </main>
  );
}

function ResultView({
  result,
  onCopy,
  onExport,
}: {
  result: ClauseAnalysisResult;
  onCopy: () => void;
  onExport: () => void;
}) {
  return (
    <div className="result-stack">
      <section className="summary-block">
        <h3>大白话</h3>
        <p>{result.plainLanguage}</p>
      </section>

      <QualityWarnings warnings={result.qualityWarnings ?? []} />

      <AnalysisList
        title="你要承担什么"
        items={result.userObligations.map((item) => ({
          heading: item.title,
          body: item.plainMeaning,
          meta: item.consequence || item.trigger,
          evidenceText: item.evidenceText,
        }))}
      />

      <AnalysisList
        title="对方能做什么"
        items={result.counterpartyRights.map((item) => ({
          heading: item.title,
          body: item.plainMeaning,
          meta: item.impactOnUser || item.condition,
          evidenceText: item.evidenceText,
        }))}
      />

      <section className="risk-list">
        <h3>风险点</h3>
        {result.risks.map((risk) => (
          <article className={`risk-item is-${risk.level.toLowerCase()}`} key={`${risk.level}-${risk.title}`}>
            <div className="risk-head">
              <h4>{risk.title}</h4>
              <RiskBadge level={risk.level} />
            </div>
            {risk.riskType ? <small className="risk-meta-line">风险类型：{risk.riskType}</small> : null}
            <p>{risk.whyItMatters}</p>
            {risk.consequence ? <p className="risk-detail">可能后果：{risk.consequence}</p> : null}
            <EvidenceSnippet text={risk.evidenceText || risk.originalSignal} />
            {risk.reviewQuestion ? <small>建议追问：{risk.reviewQuestion}</small> : null}
            {risk.mitigation ? <small>可谈判方向：{risk.mitigation}</small> : null}
          </article>
        ))}
      </section>

      <div className="compact-grid">
        <BulletBlock title="模糊措辞" items={result.ambiguousTerms} />
        <BulletBlock title="建议问律师" items={result.lawyerQuestions} />
        <BulletBlock title="可谈判方向" items={result.negotiationSuggestions} />
      </div>

      <div className="export-row">
        <p>{result.disclaimer}</p>
        <div>
          <button className="secondary-button" type="button" onClick={onCopy}>
            复制 Markdown
          </button>
          <button className="primary-button" type="button" onClick={onExport}>
            导出 Markdown
          </button>
        </div>
      </div>
    </div>
  );
}

function AnalysisList({
  title,
  items,
}: {
  title: string;
  items: Array<{ heading: string; body: string; meta?: string; evidenceText?: string }>;
}) {
  return (
    <section className="analysis-list">
      <h3>{title}</h3>
      {items.length > 0 ? (
        items.map((item) => (
          <article className="analysis-item" key={`${title}-${item.heading}`}>
            <h4>{item.heading}</h4>
            <p>{item.body}</p>
            <EvidenceSnippet text={item.evidenceText} />
            {item.meta ? <small>{item.meta}</small> : null}
          </article>
        ))
      ) : (
        <p className="muted">这段条款里没有明显提到。</p>
      )}
    </section>
  );
}

function QualityWarnings({ warnings }: { warnings: NonNullable<ClauseAnalysisResult["qualityWarnings"]> }) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <section className="quality-banner">
      <div>
        <h3>需要复核</h3>
        <p>模型结果有几处值得人工确认。</p>
      </div>
      <ul>
        {warnings.map((warning) => (
          <li key={warning.code}>{warning.message}</li>
        ))}
      </ul>
    </section>
  );
}

function EvidenceSnippet({ text }: { text?: string }) {
  if (!text) {
    return null;
  }

  return <p className="evidence-snippet">原文依据：{text}</p>;
}

function BulletBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="bullet-block">
      <h3>{title}</h3>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={`${title}-${item}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">暂无。</p>
      )}
    </section>
  );
}

function RiskBadge({ level }: { level: RiskLevel }) {
  const label = level === "HIGH" ? "高风险" : level === "MEDIUM" ? "中风险" : "低风险";
  return <span className={`risk-badge is-${level.toLowerCase()}`}>{label}</span>;
}

function LoadingState() {
  return (
    <div className="loading-stack" aria-busy="true" aria-label="正在分析合同条款">
      <div />
      <div />
      <div />
    </div>
  );
}

function EmptyResult() {
  return (
    <div className="empty-result">
      <h3>粘贴条款后开始分析</h3>
      <p>结果会按照“人话解释、你的责任、对方权利、风险和追问问题”固定展示，方便你逐条核对。</p>
    </div>
  );
}

function normalizeProviders(providers?: HubProvider[]) {
  const normalized = (providers || [])
    .filter((provider): provider is HubProvider => Boolean(provider) && provider.id === "openai")
    .map((provider) => {
      const models = uniqueStrings(provider.models || []).filter(isGptModel);
      const enabledModels = uniqueStrings(provider.enabledModels || []).filter(isGptModel);
      const defaultModel = isGptModel(provider.defaultModel) ? provider.defaultModel.trim() : enabledModels[0] || models[0] || defaultModels.openai;
      const hasConfiguredGpt = Boolean(provider.enabled && provider.configured && (enabledModels.length || models.length));

      return {
        ...provider,
        name: provider.name || "GPT · AI Routing",
        defaultModel,
        models: models.length ? models : [defaultModel],
        enabledModels,
        enabled: hasConfiguredGpt,
        configured: hasConfiguredGpt,
      };
    });

  return normalized.length ? normalized : fallbackProviders;
}

function providerModelOptions(provider: HubProvider) {
  const preferred = provider.enabledModels.length ? provider.enabledModels : provider.models;
  return uniqueStrings([...preferred, provider.defaultModel || defaultModels.openai]).filter(isGptModel);
}

function pickModel(provider: HubProvider, currentModel?: string) {
  const models = providerModelOptions(provider);
  if (currentModel && models.includes(currentModel)) {
    return currentModel;
  }

  return models[0] || provider.defaultModel || defaultModels.openai;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isGptModel(value: string) {
  return /^gpt-/i.test(value.trim());
}

function readResponseMessage(payload: AnalyzeResponse | ProvidersResponse) {
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
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return `${basePath}${path}`;
}
