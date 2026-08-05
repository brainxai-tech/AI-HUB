import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Bot, Check, Copy, LoaderCircle, RefreshCw, ScanSearch, Sparkles } from "lucide-react";
import { answerOptions, questions } from "../data/questions";
import type { AiInterpretation } from "../shared/contracts";
import type { AnswerMap, Dimension, ScoreResult } from "../types";

type AiState = "idle" | "loading" | "ready" | "error";
const CACHE_KEY = "persona-compass.ai-result.v1";

const dimensionNames: Record<Dimension, string> = {
  EI: "能量方向", SN: "信息方式", TF: "决策依据", JP: "行动节奏",
};

export function AiInterpretationPanel({ answers, score, onToast }: {
  answers: AnswerMap;
  score: ScoreResult;
  onToast: (message: string) => void;
}) {
  const [state, setState] = useState<AiState>("idle");
  const [interpretation, setInterpretation] = useState<AiInterpretation | null>(null);
  const [error, setError] = useState("");
  const fingerprint = useMemo(
    () => `v2:hub:${score.type}:${questions.map((q) => answers[q.id]).join(",")}`,
    [answers, score.type],
  );

  const generate = async () => {
    if (!score.isComplete) {
      setState("idle");
      return;
    }
    setState("loading");
    setError("");
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/u, "");
      const response = await fetch(`${base}/api/ai-interpretation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "AI 解读生成失败，请稍后重试。");
      const next = payload.data as AiInterpretation;
      setInterpretation(next);
      setState("ready");
      try { window.localStorage.setItem(CACHE_KEY, JSON.stringify({ fingerprint, data: next })); } catch { /* optional cache */ }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "AI 解读生成失败，请稍后重试。");
      setState("error");
    }
  };

  useEffect(() => {
    if (!score.isComplete) {
      setState("idle");
      return;
    }
    try {
      const cached = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "null") as { fingerprint?: string; data?: AiInterpretation } | null;
      if (cached?.fingerprint === fingerprint && cached.data) {
        setInterpretation(cached.data);
        setState("ready");
        return;
      }
    } catch {
      // Invalid cache should not block a fresh generation.
    }
    void generate();
    // Fingerprint captures every input that should trigger a fresh interpretation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, score.isComplete]);

  const copyInterpretation = async () => {
    if (!interpretation) return;
    const text = [
      `AI 解读｜${interpretation.headline}`,
      interpretation.reasoningSummary,
      ...interpretation.dimensionInsights.map((item) => `${item.dimension} ${item.conclusion}：${item.reason}\n${item.nuance}`),
      ...interpretation.growthExperiments.map((item, index) => `${index + 1}. ${item.title}：${item.action}（${item.rationale}）`),
      interpretation.closingNote,
    ].join("\n\n");
    await navigator.clipboard.writeText(text);
    onToast("AI 解读已复制");
  };

  return (
    <div className="result-section ai-section">
      <div className="section-heading ai-heading">
        <div><span className="section-index ai-index">AI</span><p>基于 32 次选择</p></div>
        <div className="ai-title-block">
          <span><Bot size={17} /> PERSONA REASONING</span>
          <h2>让结论带着理由出现</h2>
        </div>
      </div>

      {state === "idle" && (
        <div className="ai-empty">
          <div className="ai-empty-icon"><Sparkles size={28} /></div>
          <div>
            <h3>完成测试后生成选择依据</h3>
            <p>Hub GPT 不会重新判型，而会沿着四维百分比和具体答案解释“为什么”。</p>
          </div>
        </div>
      )}

      {state === "loading" && (
        <div className="ai-loading" role="status" aria-live="polite">
          <LoaderCircle size={30} className="spin" />
          <div><h3>AI 正在沿着 32 次选择找证据…</h3><p>比对四维强度、反向信号与弹性区间，通常需要 10–40 秒。</p></div>
          <div className="ai-loading-lines"><i /><i /><i /></div>
        </div>
      )}

      {state === "error" && (
        <div className="ai-error" role="alert">
          <AlertCircle size={24} />
          <div><h3>这次没有生成成功</h3><p>{error}</p></div>
          <div><button type="button" onClick={() => void generate()}><RefreshCw size={16} /> 重试</button><a href="/hub/key-config/">检查 Hub 配置</a></div>
        </div>
      )}

      {state === "ready" && interpretation && (
        <div className="ai-report">
          <div className="ai-report-lead">
            <div><span className="ai-ready"><Check size={14} /> Hub GPT 已完成</span><h3>{interpretation.headline}</h3></div>
            <button className="ai-copy" type="button" onClick={copyInterpretation}><Copy size={16} /> 复制解读</button>
          </div>
          <p className="ai-summary">{interpretation.reasoningSummary}</p>

          <div className="ai-dimensions">
            {interpretation.dimensionInsights.map((item) => (
              <article className="ai-dimension-card" key={item.dimension}>
                <div className="ai-dimension-top"><strong>{item.dimension}</strong><span>{dimensionNames[item.dimension]}</span></div>
                <h4>{item.conclusion}</h4>
                <p>{item.reason}</p>
                <div className="evidence-list">
                  {item.evidenceQuestionIds.map((id) => <Evidence key={id} questionId={id} answers={answers} />)}
                </div>
                <div className="nuance"><ScanSearch size={16} /><span>{item.nuance}</span></div>
              </article>
            ))}
          </div>

          {interpretation.crossSignals.length > 0 && (
            <div className="cross-signals">
              <p>你身上可以同时成立的信号</p>
              <ul>{interpretation.crossSignals.map((signal) => <li key={signal}>{signal}</li>)}</ul>
            </div>
          )}

          <div className="ai-growth">
            <p className="ai-subtitle">AI 为这组回答设计的三个小实验</p>
            <div>{interpretation.growthExperiments.map((item, index) => (
              <article key={item.title}><span>{String(index + 1).padStart(2, "0")}</span><h4>{item.title}</h4><p>{item.action}</p><small>{item.rationale}</small></article>
            ))}</div>
          </div>
          <p className="ai-closing">{interpretation.closingNote}</p>
        </div>
      )}
    </div>
  );
}

function Evidence({ questionId, answers }: { questionId: number; answers: AnswerMap }) {
  const question = questions.find((item) => item.id === questionId);
  if (!question) return null;
  const option = answerOptions.find((item) => item.value === answers[questionId]);
  return (
    <div className="evidence-chip">
      <span>Q{questionId} · {question.scene}</span>
      <p>{question.statement}</p>
      <b>{option?.label ?? "未作答"}</b>
    </div>
  );
}
