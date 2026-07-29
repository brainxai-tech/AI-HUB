"use client";

import { useEffect, useMemo, useState } from "react";
import { clearReadingHistory, loadReadingHistory, saveReadingToHistory } from "../lib/history";
import { drawThreeCardReading } from "../lib/reading-engine";
import type {
  ActionAdvice,
  QuestionIntent,
  ReadingInterpretation,
  ReadingReview,
  ReviewFeedback,
  SavedReading,
  SpreadPosition,
  VerdictSignal,
} from "../lib/types";

type Theme = "relationship" | "career";
type Orientation = "upright" | "reversed";
type RitualState = "idle" | "shuffling" | "drawn" | "revealed";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const LEGACY_CONFIG_STORAGE_KEYS = [
  "ai-tarot-sanctum:compatible-api-config:v1",
  "ai-tarot-sanctum:deepseek-config:v1",
];
const MAX_ACTIVE_GENERATION_PROGRESS = 94;

const publicSmartError = (message?: string) => {
  if (!message) return "智能解读暂时不可用，请稍后再试。";
  if (/hub|api|key|provider|model|模型|供应商|密钥|token|openai|deepseek|gemini|claude|compatible/i.test(message)) {
    return "智能解读暂时不可用，请稍后再试。";
  }
  return message;
};

type CardLike = {
  id?: string;
  name?: string;
  card?: {
    id?: string;
    name: string;
    keywords?: string[];
    upright?: string;
    reversed?: string;
    relationshipMeaning?: string;
    careerMeaning?: string;
    risk?: string;
    advice?: string;
  };
  keywords?: string[];
  orientation?: Orientation;
  upright?: string;
  reversed?: string;
  relationshipMeaning?: string;
  careerMeaning?: string;
  risk?: string;
  advice?: string;
  position?: SpreadPosition;
};

type ReadingLike = {
  id?: string;
  createdAt?: string;
  theme?: Theme;
  question?: string;
  cards?: CardLike[];
  summary?: string;
  combined?: string;
  riskNote?: string;
  actionAdvice?: string | string[];
  actions?: string[] | ActionAdvice;
  cardSections?: ReadingInterpretation["cardSections"];
  combination?: string;
  riskNotes?: string[];
  verdict?: ReadingInterpretation["verdict"];
  intent?: QuestionIntent;
  review?: ReadingReview;
  disclaimer?: string;
};

const positions: SpreadPosition[] = ["root", "present", "trend"];

const positionLabels: Record<SpreadPosition, string> = {
  root: "根源",
  present: "现状",
  trend: "趋势",
};

const prompts: Record<Theme, string[]> = {
  relationship: [
    "这段关系现在被什么模式影响？",
    "在开口之前，我真正需要理解什么？",
    "我应该在哪里设下更清晰的边界？",
  ],
  career: [
    "这个机会背后的真实信号是什么？",
    "这一周我的资源应该优先放在哪里？",
    "行动前我需要先注意哪类风险？",
  ],
};

const reviewTagOptions: Record<Theme, string[]> = {
  relationship: ["复合", "沟通", "边界", "等待"],
  career: ["机会", "金钱", "执行", "风险"],
};

const feedbackOptions: Array<{ value: ReviewFeedback; label: string }> = [
  { value: "pending", label: "待观察" },
  { value: "happened", label: "发生了" },
  { value: "not-happened", label: "没发生" },
  { value: "unclear", label: "不确定" },
];

const fallbackIntent: Record<Theme, QuestionIntent> = {
  relationship: {
    id: "general-judgment",
    label: "关系方向判断",
    judgmentPath: "判断这段关系当前更适合推进、澄清、等待，还是设下边界。",
    matchedKeywords: [],
  },
  career: {
    id: "general-judgment",
    label: "事业与财富方向判断",
    judgmentPath: "判断这件事当前更适合推进、缩小测试、等待证据，还是降低投入。",
    matchedKeywords: [],
  },
};

const fallbackCards: CardLike[] = positions.map((position, index) => ({
  id: `empty-${index}`,
  name: "未揭示的牌",
  position,
  orientation: "upright",
  keywords: ["等待", "注意", "选择"],
}));

function normalizeReading(rawReading: unknown, theme: Theme, question: string): ReadingLike {
  const base = (rawReading ?? {}) as ReadingLike;
  const cards = Array.isArray(base.cards) ? base.cards.slice(0, 3) : [];

  return {
    ...base,
    id: base.id ?? `reading-${Date.now()}`,
    createdAt: base.createdAt ?? new Date().toISOString(),
    theme: base.theme ?? theme,
    question: base.question ?? question,
    cards: positions.map((position, index) => ({
      ...(cards[index] ?? fallbackCards[index]),
      position,
      orientation: cards[index]?.orientation ?? "upright",
    })),
  };
}

function getCard(card: CardLike) {
  return card.card ?? card;
}

function getMeaning(card: CardLike, theme: Theme) {
  const cardData = getCard(card);

  if (theme === "relationship" && cardData.relationshipMeaning) {
    return cardData.relationshipMeaning;
  }

  if (theme === "career" && cardData.careerMeaning) {
    return cardData.careerMeaning;
  }

  return card.orientation === "reversed" ? cardData.reversed : cardData.upright;
}

function getCardName(card: CardLike) {
  return getCard(card).name ?? "未揭示的牌";
}

function getCardKeywords(card: CardLike) {
  return getCard(card).keywords;
}

function getCardRisk(card: CardLike) {
  return getCard(card).risk;
}

function toActionList(value: ReadingLike["actionAdvice"], actions?: ReadingLike["actions"] | ActionAdvice) {
  if (actions && !Array.isArray(actions) && "nextAction" in actions) {
    return [actions.nextAction, actions.avoid, actions.sevenDayObservation];
  }

  if (Array.isArray(actions) && actions.length > 0) {
    return actions.slice(0, 3);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 3);
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\n|;/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  return [
    "先写下一个具体下一步，再寻找更多信号。",
    "不要把牌阵当成确定结论；请和可观察事实一起比较。",
    "七天后回看这个问题，记录哪些地方发生了变化。",
  ];
}

function verdictAnswerLabel(answer: unknown) {
  if (answer === "supportive" || answer === "能") {
    return "能";
  }

  if (answer === "blocked" || answer === "不能") {
    return "不能";
  }

  return "暂无结论";
}

function verdictConfidenceLabel(confidence: unknown) {
  if (confidence === "high" || confidence === "强") {
    return "强";
  }

  if (confidence === "medium" || confidence === "中") {
    return "中";
  }

  if (confidence === "low" || confidence === "弱") {
    return "弱";
  }

  return "无";
}

function verdictClass(answer: unknown) {
  if (answer === "supportive" || answer === "能") {
    return "can";
  }

  if (answer === "blocked" || answer === "不能") {
    return "cannot";
  }

  return "unknown";
}

function getDisplayIntent(reading: ReadingLike, theme: Theme): QuestionIntent {
  return reading.intent ?? fallbackIntent[reading.theme ?? theme];
}

function getSignalText(signal: VerdictSignal) {
  return signal.text ?? `${positionLabels[signal.position]}位的${signal.cardName}形成判断信号。`;
}

function getFeedbackLabel(feedback?: ReviewFeedback) {
  return feedbackOptions.find((option) => option.value === feedback)?.label ?? "待观察";
}

function getDisplayVerdict(reading: ReadingLike): ReadingInterpretation["verdict"] {
  if (reading.verdict) {
    return {
      ...reading.verdict,
      supportSignals: reading.verdict.supportSignals ?? [],
      resistanceSignals: reading.verdict.resistanceSignals ?? [],
      changeCondition: reading.verdict.changeCondition ?? "暂无改判条件。请结合现实反馈重新观察。",
    };
  }

  return {
    answer: "unknown",
    confidence: "none",
    why: reading.summary ?? reading.combination ?? "这是一条旧历史记录，当时还没有保存明确结论。请重新抽牌获得“能/不能”的当前判断。",
    whatToDo: toActionList(reading.actionAdvice, reading.actions),
    score: 0,
    scoreBreakdown: [],
    supportSignals: [],
    resistanceSignals: [],
    changeCondition: "旧记录没有保存改判条件。请重新抽牌获得当前判断。",
  };
}

export function TarotSanctum() {
  const [theme, setTheme] = useState<Theme>("relationship");
  const [question, setQuestion] = useState("");
  const [ritualState, setRitualState] = useState<RitualState>("idle");
  const [reading, setReading] = useState<ReadingLike | null>(null);
  const [history, setHistory] = useState<ReadingLike[]>([]);
  const [error, setError] = useState("");
  const [historyMessage, setHistoryMessage] = useState("");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [reviewTags, setReviewTags] = useState<string[]>([]);
  const [reviewFeedback, setReviewFeedback] = useState<ReviewFeedback>("pending");
  const [reviewNote, setReviewNote] = useState("");
  const [generationProgress, setGenerationProgress] = useState(0);

  const selectedPrompts = useMemo(() => prompts[theme], [theme]);
  const themeStatus = theme === "relationship" ? "当前主题：关系咨询" : "当前主题：事业与财富";
  const selectedReviewTags = reviewTagOptions[theme];
  const displayCards = reading?.cards?.slice(0, 3) ?? fallbackCards;
  const canSave = ritualState === "revealed" && Boolean(reading);
  const hasCompatibleApiConfig = true;
  const canDraw = ritualState !== "shuffling" && hasCompatibleApiConfig;
  const isGeneratingReading = ritualState === "shuffling";

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setPrefersReducedMotion(motionQuery.matches);
    updateMotion();
    motionQuery.addEventListener("change", updateMotion);
    const historyTimer = window.setTimeout(() => {
      try {
        setHistory(loadReadingHistory() as unknown as ReadingLike[]);
      } catch {
        setHistoryMessage("当前浏览器会话无法读取本地历史。");
      }

      try {
        for (const key of LEGACY_CONFIG_STORAGE_KEYS) {
          window.localStorage.removeItem(key);
        }
      } catch {
        // Old per-project connection settings are cleaned up on a best-effort basis.
      }
    }, 0);

    return () => {
      window.clearTimeout(historyTimer);
      motionQuery.removeEventListener("change", updateMotion);
    };
  }, []);

  useEffect(() => {
    if (!isGeneratingReading) {
      return;
    }

    const intervalMs = prefersReducedMotion ? 220 : 360;
    const progressTimer = window.setInterval(() => {
      setGenerationProgress((current) => {
        if (current >= MAX_ACTIVE_GENERATION_PROGRESS) {
          return current;
        }

        const increment = current < 42 ? 8 : current < 76 ? 5 : 2;
        return Math.min(MAX_ACTIVE_GENERATION_PROGRESS, current + increment);
      });
    }, intervalMs);

    return () => {
      window.clearInterval(progressTimer);
    };
  }, [isGeneratingReading, prefersReducedMotion]);

  function chooseTheme(nextTheme: Theme) {
    if (nextTheme === theme) {
      return;
    }

    setTheme(nextTheme);
    setQuestion("");
    setError("");
    setReading(null);
    setRitualState("idle");
    setHistoryMessage("");
    setGenerationProgress(0);
    resetReviewState();
  }

  function resetReading() {
    setRitualState("idle");
    setReading(null);
    setError("");
    setHistoryMessage("");
    setGenerationProgress(0);
    resetReviewState();
  }

  function resetReviewState() {
    setReviewTags([]);
    setReviewFeedback("pending");
    setReviewNote("");
  }

  function applyReviewState(review?: ReadingReview) {
    setReviewTags(review?.tags ?? []);
    setReviewFeedback(review?.feedback ?? "pending");
    setReviewNote(review?.note ?? "");
  }

  function toggleReviewTag(tag: string) {
    setReviewTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag].slice(0, 5),
    );
  }

  async function handleDraw() {
    const cleanQuestion = question.trim();
    setHistoryMessage("");

    if (!cleanQuestion) {
      setError("请先写下问题，或选择一个提示问题后再抽牌。");
      return;
    }

    setError("");
    setRitualState("shuffling");
    setGenerationProgress(6);
    resetReviewState();

    const delay = prefersReducedMotion ? 120 : 2100;

    window.setTimeout(async () => {
      try {
        const rawReading = drawThreeCardReading({ theme, question: cleanQuestion });
        const normalized = normalizeReading(rawReading, theme, cleanQuestion);
        const response = await fetch(`${basePath}/api/compatible-reading`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reading: rawReading,
          }),
        });
        const result = (await response.json()) as ReadingInterpretation | { error?: string; detail?: string };

        if (!response.ok || "error" in result) {
          throw new Error("error" in result && result.error ? result.error : "智能解读生成失败。");
        }

        const interpretation = result;

        setGenerationProgress(100);
        setReading({
          ...normalized,
          ...interpretation,
          cards: normalized.cards,
        });
        setRitualState("drawn");

        window.setTimeout(() => {
          setRitualState("revealed");
        }, prefersReducedMotion ? 80 : 650);
      } catch (requestError) {
        setRitualState("idle");
        setGenerationProgress(0);
        setError(publicSmartError(requestError instanceof Error ? requestError.message : "智能解读生成失败。"));
      }
    }, delay);
  }

  function handleSave() {
    if (!reading) {
      return;
    }

    try {
      const savedReading: SavedReading = {
        ...reading,
        id: reading.id ?? `reading-${Date.now()}`,
        createdAt: reading.createdAt ?? new Date().toISOString(),
        theme: reading.theme ?? theme,
        intent: reading.intent ?? getDisplayIntent(reading, theme),
        question: reading.question ?? question.trim(),
        cards: reading.cards?.map((card) => ({
          ...card,
          name: getCardName(card),
        })) as unknown as SavedReading["cards"],
        summary:
          reading.summary ??
          reading.combination ??
          "这次本地三牌阵已保存，但完整总结尚未生成。",
        actions: !Array.isArray(reading.actions) && reading.actions
          ? reading.actions
          : {
              nextAction: toActionList(reading.actionAdvice, reading.actions)[0],
              avoid: toActionList(reading.actionAdvice, reading.actions)[1],
              sevenDayObservation: toActionList(reading.actionAdvice, reading.actions)[2],
            },
        review: {
          tags: reviewTags,
          feedback: reviewFeedback,
          note: reviewNote.trim(),
          updatedAt: new Date().toISOString(),
        },
        savedAt: new Date().toISOString(),
      };
      const nextHistory = saveReadingToHistory(savedReading) as unknown as ReadingLike[];
      setHistory(nextHistory);
      setHistoryMessage("牌阵已保存到本地。");
    } catch {
      setHistoryMessage("当前浏览器会话无法保存历史。");
    }
  }

  function handleClearHistory() {
    try {
      clearReadingHistory();
      setHistory([]);
      setHistoryMessage("本地历史已清空。");
    } catch {
      setHistoryMessage("当前浏览器会话无法清空历史。");
    }
  }

  return (
    <main className="sanctum-shell">
      <section className="sanctum-workspace" aria-labelledby="sanctum-title">
        <div className="altar-panel">
          <div className="brand-line">
            <span className="sigil" aria-hidden="true">
              III
            </span>
            <div>
              <p className="kicker">本地三牌阵解读</p>
              <h1 id="sanctum-title">塔罗圣殿</h1>
            </div>
          </div>

          <div className="theme-selector" aria-label="解读主题">
            <button
              aria-pressed={theme === "relationship"}
              className={theme === "relationship" ? "active" : ""}
              type="button"
              onClick={() => chooseTheme("relationship")}
            >
              关系
            </button>
            <button
              aria-pressed={theme === "career"}
              className={theme === "career" ? "active" : ""}
              type="button"
              onClick={() => chooseTheme("career")}
            >
              事业 / 财富
            </button>
          </div>
          <p className="theme-status" aria-live="polite">
            {themeStatus}
          </p>
          <section className="api-panel" aria-label="智能解读状态">
            <div className="api-panel-heading">
              <div>
                <p>智能解读</p>
                <strong>
                  写下问题后可直接生成，无需额外设置
                </strong>
              </div>
              <span className={hasCompatibleApiConfig ? "api-status ready" : "api-status missing"}>
                {hasCompatibleApiConfig ? "READY" : "WAIT"}
              </span>
            </div>
          </section>

          <label className="question-field" htmlFor="question">
            <span>你的问题</span>
            <textarea
              id="question"
              maxLength={240}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="可以询问一个模式、选择、时机、边界，或下一步行动。"
              value={question}
            />
          </label>
          <div className="field-row">
            <span>{question.length}/240</span>
            {error ? <strong role="alert">{error}</strong> : null}
          </div>

          <div className="prompt-strip" aria-label="建议问题">
            {selectedPrompts.map((prompt) => (
              <button key={prompt} type="button" onClick={() => setQuestion(prompt)}>
                {prompt}
              </button>
            ))}
          </div>

          <div className="ritual-controls">
            <button
              className="primary-action"
              disabled={!canDraw}
              type="button"
              onClick={handleDraw}
            >
              {ritualState === "shuffling" ? "AI 生成中" : "洗牌并生成测评"}
            </button>
            <button className="quiet-action" type="button" onClick={resetReading}>
              新问题
            </button>
          </div>
          {isGeneratingReading ? (
            <div className="generation-progress" role="status" aria-live="polite">
              <div className="generation-progress-heading">
                <span>AI 正在生成测评报告</span>
                <strong>{generationProgress}%</strong>
              </div>
              <div
                aria-label="AI 生成进度"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={generationProgress}
                aria-valuetext={`AI 生成进度 ${generationProgress}%`}
                className="generation-progress-track"
                role="progressbar"
              >
                <span style={{ width: `${generationProgress}%` }} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="spread-board" data-state={ritualState}>
          {displayCards.map((card, index) => (
            <article
              className="tarot-card"
              data-revealed={ritualState === "revealed"}
              key={`${card.id ?? card.name}-${positions[index]}`}
            >
              <div className="card-back" aria-hidden={ritualState === "revealed"}>
                <span>{positionLabels[positions[index]]}</span>
              </div>
              <div className="card-front">
                <p>{positionLabels[positions[index]]}</p>
                <h2>{getCardName(card)}</h2>
                <span>{card.orientation === "reversed" ? "逆位" : "正位"}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="lower-grid" aria-label="解读结果与本地历史">
        <section className="result-panel" aria-live="polite">
          {reading && ritualState === "revealed" ? (
            <>
              <div className="result-heading">
                <p>{theme === "relationship" ? "关系镜面" : "事业与财富镜面"}</p>
                <h2>{reading.question}</h2>
              </div>
              <div className="judgment-path">
                <span>判断口径</span>
                <strong>{getDisplayIntent(reading, theme).label}</strong>
                <p>{getDisplayIntent(reading, theme).judgmentPath}</p>
              </div>

              <section
                className={`verdict-card ${verdictClass(getDisplayVerdict(reading).answer)}`}
                aria-label="明确回答"
              >
                <div className="verdict-answer">
                  <p>明确回答</p>
                  <strong>{verdictAnswerLabel(getDisplayVerdict(reading).answer)}</strong>
                  <span>置信度：{verdictConfidenceLabel(getDisplayVerdict(reading).confidence)}</span>
                </div>
                <div className="verdict-detail">
                  <h3>为什么</h3>
                  <p>{getDisplayVerdict(reading).why}</p>
                  <h3>你该怎么做</h3>
                  <ol>
                    {getDisplayVerdict(reading).whatToDo.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  <h3>改判条件</h3>
                  <p>{getDisplayVerdict(reading).changeCondition}</p>
                </div>
              </section>
              <section className="signal-grid" aria-label="支持与阻力信号">
                <div>
                  <h3>支持信号</h3>
                  {getDisplayVerdict(reading).supportSignals.length > 0 ? (
                    <ul>
                      {getDisplayVerdict(reading).supportSignals.map((signal) => (
                        <li key={`${signal.cardName}-${signal.position}-support`}>{getSignalText(signal)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>本次牌阵没有明显支持信号。</p>
                  )}
                </div>
                <div>
                  <h3>阻力信号</h3>
                  {getDisplayVerdict(reading).resistanceSignals.length > 0 ? (
                    <ul>
                      {getDisplayVerdict(reading).resistanceSignals.map((signal) => (
                        <li key={`${signal.cardName}-${signal.position}-resistance`}>{getSignalText(signal)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>本次牌阵没有明显阻力信号。</p>
                  )}
                </div>
              </section>

              <div className="card-meanings">
                {displayCards.map((card, index) => (
                  <div className="meaning-row" key={`${card.id ?? card.name}-meaning`}>
                    <span>{positionLabels[positions[index]]}</span>
                    <div>
                      <h3>{getCardName(card)}</h3>
                      <p>
                        {reading.cardSections?.[index]?.meaning ??
                          getMeaning(card, theme) ??
                          getCardKeywords(card)?.join(", ") ??
                          "这张牌提醒你把注意力放回真实信号。"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="reading-copy">
                <h3>综合解读</h3>
                <p>
                  {reading.summary ??
                    reading.combined ??
                    reading.combination ??
                    "合在一起看，这三张牌指向一个仍在形成中的模式。请把牌阵当作注意力的镜子，而不是判决。"}
                </p>
              </div>

              <div className="result-columns">
                <div>
                  <h3>风险提示</h3>
                  <p>
                    {reading.riskNote ??
                      reading.riskNotes?.join(" ") ??
                      getCardRisk(displayCards.find((card) => getCardRisk(card)) ?? displayCards[0]) ??
                      "主要风险是只根据一瞬间的情绪行动，而没有持续观察模式。"}
                  </p>
                </div>
                <div>
                  <h3>行动建议</h3>
                  <ul>
                    {toActionList(reading.actionAdvice, reading.actions).map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <p className="disclaimer">
                {reading.disclaimer ??
                  "本解读仅供自我反思与娱乐参考，不构成医疗、法律、金融、心理健康或其他专业建议。"}
              </p>
              <section className="review-panel" aria-label="本地复盘">
                <div>
                  <h3>复盘标签</h3>
                  <div className="tag-strip">
                    {selectedReviewTags.map((tag) => (
                      <button
                        aria-pressed={reviewTags.includes(tag)}
                        className={reviewTags.includes(tag) ? "active" : ""}
                        key={tag}
                        type="button"
                        onClick={() => toggleReviewTag(tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3>现实反馈</h3>
                  <div className="feedback-selector">
                    {feedbackOptions.map((option) => (
                      <button
                        aria-pressed={reviewFeedback === option.value}
                        className={reviewFeedback === option.value ? "active" : ""}
                        key={option.value}
                        type="button"
                        onClick={() => setReviewFeedback(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="review-note" htmlFor="review-note">
                  <span>复盘备注</span>
                  <textarea
                    id="review-note"
                    maxLength={180}
                    onChange={(event) => setReviewNote(event.target.value)}
                    placeholder="记录现实里出现的证据、对方回应或你的观察。"
                    value={reviewNote}
                  />
                </label>
              </section>

              <div className="result-actions">
                <button className="primary-action" disabled={!canSave} type="button" onClick={handleSave}>
                  保存解读
                </button>
                <button className="quiet-action" type="button" onClick={resetReading}>
                  再问一次
                </button>
              </div>
            </>
          ) : (
            <div className="empty-result">
              <p>三张牌位正在等待：根源、现状与趋势。</p>
            </div>
          )}
        </section>

        <aside className="history-panel" aria-label="本地解读历史">
          <div className="history-heading">
            <div>
              <p>本地历史</p>
              <h2>已保存解读</h2>
            </div>
            <button type="button" onClick={handleClearHistory}>
              清空
            </button>
          </div>
          {historyMessage ? <p className="history-message">{historyMessage}</p> : null}
          <div className="history-list">
            {history.length > 0 ? (
              history.map((item) => (
                <button
                  className="history-item"
                  key={item.id ?? `${item.createdAt}-${item.question}`}
                  type="button"
                  onClick={() => {
                    const nextTheme = item.theme ?? theme;
                    setTheme(nextTheme);
                    setReading(normalizeReading(item, nextTheme, item.question ?? ""));
                    setRitualState("revealed");
                    applyReviewState(item.review);
                  }}
                >
                  <span>{item.theme === "career" ? "事业 / 财富" : "关系"}</span>
                  <strong>{item.question}</strong>
                  {item.intent ? <small>{item.intent.label}</small> : null}
                  {item.review?.tags.length ? <small>{item.review.tags.join(" / ")}</small> : null}
                  {item.review ? <small>反馈：{getFeedbackLabel(item.review.feedback)}</small> : null}
                  <small>{item.createdAt ? new Date(item.createdAt).toLocaleString("zh-CN") : "已保存到本地"}</small>
                </button>
              ))
            ) : (
              <p className="empty-history">保存后的解读只会留在这台设备上。</p>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
