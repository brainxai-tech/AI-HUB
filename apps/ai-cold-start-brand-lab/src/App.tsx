import {
  AlertTriangle,
  Check,
  Clipboard,
  FlaskConical,
  Loader2,
  RefreshCw,
  Sparkles
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  providerLabels,
  type BrandPack,
  type Focus,
  type GenerateBrandPackResponse,
  type GenerateBrandPackRequest,
  type Provider
} from "./shared/contracts";

type FormState = {
  idea: string;
  targetAudience: string;
  market: string;
  provider: Provider;
  model: string;
  tone: GenerateBrandPackRequest["input"]["tone"];
  language: GenerateBrandPackRequest["input"]["language"];
  landingPageStyle: GenerateBrandPackRequest["input"]["landingPageStyle"];
};

const initialForm: FormState = {
  idea: "一个面向独立开发者的 AI 工具：输入产品想法，自动生成品牌名、定位、首页文案、广告语、用户画像和 3 个落地页方向。",
  targetAudience: "独立开发者、AI 创业者、增长运营",
  market: "AI SaaS / 冷启动增长工具",
  provider: "openai",
  model: "gpt-5.6-luna",
  tone: "sharp-professional",
  language: "zh-CN",
  landingPageStyle: "problem"
};

const progressSteps = ["解析产品想法", "生成定位假设", "发散品牌创意", "组织首页文案"];
const basePath = normalizeBasePath(import.meta.env.BASE_URL || "/");

export function App() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [result, setResult] = useState<BrandPack | null>(null);
  const [meta, setMeta] = useState<GenerateBrandPackResponse["meta"] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingFocus, setLoadingFocus] = useState<Focus>("full");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [progressIndex, setProgressIndex] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      setProgressIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setProgressIndex((index) => (index + 1) % progressSteps.length);
    }, 900);

    return () => window.clearInterval(timer);
  }, [isLoading]);

  const markdown = useMemo(() => (result ? brandPackToMarkdown(result) : ""), [result]);
  const landingMarkdown = useMemo(() => (result ? landingPageToMarkdown(result) : ""), [result]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await generate("full");
  }

  async function generate(focus: Focus) {
    setIsLoading(true);
    setLoadingFocus(focus);
    setError("");
    setCopied("");

    try {
      const response = await fetch(apiPath("/api/generate-brand-pack"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequest(form, focus))
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message || "生成失败。");
      }

      const next = payload as GenerateBrandPackResponse;
      setResult((current) => mergeFocusedResult(current, next.data, focus));
      setMeta(next.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败。");
    } finally {
      setIsLoading(false);
    }
  }

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1800);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AI Cold Start Brand Lab</p>
          <h1>AI 冷启动品牌实验室</h1>
        </div>
        <div className="status-pill" aria-live="polite">
          {isLoading ? <Loader2 className="spin" size={16} /> : <FlaskConical size={16} />}
          <span>{isLoading ? progressSteps[progressIndex] : "MVP Workbench"}</span>
        </div>
      </header>

      <section className="workspace">
        <form className="control-panel" onSubmit={submit}>
          <div className="panel-head">
            <h2>产品想法</h2>
            <button className="icon-button" type="button" title="恢复示例" onClick={() => setForm(initialForm)}>
              <RefreshCw size={18} />
            </button>
          </div>

          <label className="field">
            <span>Idea</span>
            <textarea
              value={form.idea}
              onChange={(event) => setForm({ ...form, idea: event.target.value })}
              rows={6}
              maxLength={4000}
              required
            />
          </label>

          <div className="two-column">
            <label className="field">
              <span>首批用户</span>
              <input
                value={form.targetAudience}
                onChange={(event) => setForm({ ...form, targetAudience: event.target.value })}
                maxLength={800}
              />
            </label>
            <label className="field">
              <span>市场/行业</span>
              <input
                value={form.market}
                onChange={(event) => setForm({ ...form, market: event.target.value })}
                maxLength={300}
              />
            </label>
          </div>

          <div className="field checkbox-field" role="note">
            <span>模型与密钥由 AI Hub 统一管理，型号请使用页面顶部选择器。</span>
          </div>

          <div className="three-column">
            <label className="field">
              <span>语气</span>
              <select value={form.tone} onChange={(event) => setForm({ ...form, tone: event.target.value as FormState["tone"] })}>
                <option value="sharp-professional">锋利专业</option>
                <option value="calm-premium">克制高级</option>
                <option value="bold-growth">增长转化</option>
                <option value="warm-human">温暖可信</option>
                <option value="minimal-technical">极简技术</option>
              </select>
            </label>
            <label className="field">
              <span>语言</span>
              <select value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value as FormState["language"] })}>
                <option value="zh-CN">中文</option>
                <option value="en-US">English</option>
                <option value="bilingual">双语</option>
              </select>
            </label>
            <label className="field">
              <span>页面方向</span>
              <select
                value={form.landingPageStyle}
                onChange={(event) => setForm({ ...form, landingPageStyle: event.target.value as FormState["landingPageStyle"] })}
              >
                <option value="problem">问题驱动</option>
                <option value="outcome">效率收益</option>
                <option value="identity">身份愿景</option>
                <option value="comparison">对比替代</option>
              </select>
            </label>
          </div>

          <button className="primary-button" disabled={isLoading} type="submit">
            {isLoading && loadingFocus === "full" ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
            <span>{result ? "重新生成品牌包" : "生成品牌包"}</span>
          </button>

          {error ? (
            <div className="error-box" role="alert">
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          ) : null}
        </form>

        <section className="result-panel" aria-live="polite">
          {!result ? (
            error ? (
              <div className="empty-state generation-error" role="alert">
                <AlertTriangle size={34} />
                <h2>这次生成没有完成</h2>
                <p>{error}</p>
                <button className="primary-button" type="button" onClick={() => void generate(loadingFocus)} disabled={isLoading}>
                  <RefreshCw size={18} />
                  <span>重试生成</span>
                </button>
              </div>
            ) : (
              <div className="empty-state">
                <Sparkles size={34} />
                <h2>等待第一个冷启动实验</h2>
                <p>品牌包会在这里展开，包含命名、定位、画像、落地页方向和可复制首页文案。</p>
              </div>
            )
          ) : (
            <div className="result-stack">
              <div className="result-toolbar">
                <div>
                  <p className="eyebrow">Brand Pack</p>
                  <h2>{result.positioning.oneLiner}</h2>
                </div>
                <div className="toolbar-actions">
                  <button type="button" onClick={() => copy("完整品牌包", markdown)} title="复制完整品牌包">
                    {copied === "完整品牌包" ? <Check size={17} /> : <Clipboard size={17} />}
                    <span>{copied === "完整品牌包" ? "已复制" : "完整复制"}</span>
                  </button>
                  <button type="button" onClick={() => copy("Landing", landingMarkdown)} title="复制 landing page 文案">
                    {copied === "Landing" ? <Check size={17} /> : <Clipboard size={17} />}
                    <span>{copied === "Landing" ? "已复制" : "复制页面"}</span>
                  </button>
                </div>
              </div>

              {meta ? (
                <p className="meta-line">
                  {providerLabels[meta.provider]} · {meta.model} · {meta.mode === "demo" ? "本地 Demo" : "模型生成"}
                </p>
              ) : null}

              <Module title="品牌名" focus="brandNames" isLoading={isLoading && loadingFocus === "brandNames"} onRegenerate={generate}>
                <div className="name-grid">
                  {result.brandNames.map((item) => (
                    <article className="mini-card" key={item.name}>
                      <div className="fit">{item.fit}</div>
                      <h3>{item.name}</h3>
                      <p className="tagline">{item.tagline}</p>
                      <p>{item.rationale}</p>
                    </article>
                  ))}
                </div>
              </Module>

              <Module title="定位" focus="positioning" isLoading={isLoading && loadingFocus === "positioning"} onRegenerate={generate}>
                <div className="positioning-grid">
                  <Info label="类别" value={result.positioning.category} />
                  <Info label="目标用户" value={result.positioning.targetUser} />
                  <Info label="核心承诺" value={result.positioning.primaryPromise} />
                  <Info label="差异点" value={result.positioning.differentiation} />
                  <Info label="证明方式" value={result.positioning.proofIdea} />
                </div>
                <ul className="compact-list">
                  {result.positioning.assumptions.map((assumption) => (
                    <li key={assumption}>{assumption}</li>
                  ))}
                </ul>
              </Module>

              <Module title="广告语" focus="taglines" isLoading={isLoading && loadingFocus === "taglines"} onRegenerate={generate}>
                <div className="tagline-list">
                  {result.taglines.map((item, index) => (
                    <span key={`${item.line}-${index}`} data-style={item.style}>
                      {item.line}
                    </span>
                  ))}
                </div>
              </Module>

              <Module title="首批用户画像" focus="personas" isLoading={isLoading && loadingFocus === "personas"} onRegenerate={generate}>
                <div className="persona-grid">
                  {result.personas.map((persona) => (
                    <article className="mini-card" key={persona.name}>
                      <h3>{persona.name}</h3>
                      <p className="tagline">{persona.segment}</p>
                      <p>{persona.context}</p>
                      <ul>
                        {persona.pains.map((pain) => (
                          <li key={pain}>{pain}</li>
                        ))}
                      </ul>
                      <p><strong>触发：</strong>{persona.trigger}</p>
                      <p><strong>顾虑：</strong>{persona.objection}</p>
                    </article>
                  ))}
                </div>
              </Module>

              <Module title="3 个落地页方向" focus="landingPageDirections" isLoading={isLoading && loadingFocus === "landingPageDirections"} onRegenerate={generate}>
                <div className="direction-grid">
                  {result.landingPageDirections.map((direction) => (
                    <article className="mini-card" key={direction.name}>
                      <h3>{direction.name}</h3>
                      <p className="tagline">{direction.heroHeadline}</p>
                      <p>{direction.angle}</p>
                      <p><strong>适合：</strong>{direction.bestFor}</p>
                      <ol>
                        {direction.sectionPlan.map((section) => (
                          <li key={section}>{section}</li>
                        ))}
                      </ol>
                    </article>
                  ))}
                </div>
              </Module>

              <Module title="可复制 Landing Page 文案" focus="landingPageCopy" isLoading={isLoading && loadingFocus === "landingPageCopy"} onRegenerate={generate}>
                <article className="copy-preview">
                  <h3>{result.landingPageCopy.hero.headline}</h3>
                  <p>{result.landingPageCopy.hero.subheadline}</p>
                  <div className="cta-row">
                    <span>{result.landingPageCopy.hero.primaryCta}</span>
                    <span>{result.landingPageCopy.hero.secondaryCta}</span>
                  </div>
                  <h4>{result.landingPageCopy.problemSection.title}</h4>
                  <ul>
                    {result.landingPageCopy.problemSection.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                  <h4>{result.landingPageCopy.solutionSection.title}</h4>
                  <p>{result.landingPageCopy.solutionSection.body}</p>
                  <h4>{result.landingPageCopy.finalCta.headline}</h4>
                </article>
              </Module>

              <Module title="验证计划" focus="full" isLoading={false} onRegenerate={generate}>
                <div className="validation">
                  <Info label="北极星指标" value={result.validationPlan.northStarMetric} />
                  <Info label="首个实验" value={result.validationPlan.firstExperiment} />
                  <div>
                    <h3>成功信号</h3>
                    <ul className="compact-list">
                      {result.validationPlan.successSignals.map((signal) => (
                        <li key={signal}>{signal}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3>风险</h3>
                    <ul className="compact-list">
                      {result.validationPlan.risks.map((risk) => (
                        <li key={risk}>{risk}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Module>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function buildRequest(form: FormState, focus: Focus): GenerateBrandPackRequest {
  return {
    provider: form.provider,
    model: form.model,
    focus,
    input: {
      idea: form.idea,
      targetAudience: form.targetAudience,
      market: form.market,
      tone: form.tone,
      language: form.language,
      landingPageStyle: form.landingPageStyle
    }
  };
}

function apiPath(path: string) {
  return `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
}

function normalizeBasePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function mergeFocusedResult(current: BrandPack | null, next: BrandPack, focus: Focus): BrandPack {
  if (!current || focus === "full") return next;
  return {
    ...current,
    [focus]: next[focus]
  };
}

function Module({
  title,
  focus,
  isLoading,
  onRegenerate,
  children
}: {
  title: string;
  focus: Focus;
  isLoading: boolean;
  onRegenerate: (focus: Focus) => Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <section className="module">
      <div className="module-head">
        <h2>{title}</h2>
        <button type="button" onClick={() => onRegenerate(focus)} disabled={isLoading} title={`重写${title}`}>
          {isLoading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
          <span>重写</span>
        </button>
      </div>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="info">
      <span>{label}</span>
      <p>{value}</p>
    </div>
  );
}

function brandPackToMarkdown(pack: BrandPack) {
  return [
    "# 品牌包",
    "",
    `## 定位`,
    pack.positioning.oneLiner,
    "",
    "## 品牌名",
    ...pack.brandNames.map((item) => `- ${item.name}: ${item.tagline}｜${item.rationale}`),
    "",
    "## 广告语",
    ...pack.taglines.map((item) => `- [${item.style}] ${item.line}`),
    "",
    "## 用户画像",
    ...pack.personas.map((item) => `- ${item.name}: ${item.segment}｜触发: ${item.trigger}`),
    "",
    "## 落地页方向",
    ...pack.landingPageDirections.map((item) => `- ${item.name}: ${item.heroHeadline}｜${item.angle}`),
    "",
    landingPageToMarkdown(pack),
    "",
    "## 验证计划",
    `北极星指标: ${pack.validationPlan.northStarMetric}`,
    `首个实验: ${pack.validationPlan.firstExperiment}`
  ].join("\n");
}

function landingPageToMarkdown(pack: BrandPack) {
  const copy = pack.landingPageCopy;
  return [
    "# Landing Page 文案",
    "",
    `## Hero`,
    copy.hero.headline,
    "",
    copy.hero.subheadline,
    "",
    `CTA: ${copy.hero.primaryCta} / ${copy.hero.secondaryCta}`,
    "",
    `## ${copy.problemSection.title}`,
    ...copy.problemSection.bullets.map((bullet) => `- ${bullet}`),
    "",
    `## ${copy.solutionSection.title}`,
    copy.solutionSection.body,
    "",
    "## 功能",
    ...copy.featureBlocks.map((feature) => `### ${feature.title}\n${feature.body}`),
    "",
    `## ${copy.socialProof.title}`,
    copy.socialProof.body,
    "",
    "## FAQ",
    ...copy.faq.map((item) => `### ${item.question}\n${item.answer}`),
    "",
    `## ${copy.finalCta.headline}`,
    copy.finalCta.button
  ].join("\n");
}
