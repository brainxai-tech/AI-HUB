"use client";

import { useEffect, useMemo, useState } from "react";

import { idolDataBundle } from "@/data/idol-profiles.generated";
import {
  type DeepSeekCandidate,
  type DeepSeekGeneratedResult
} from "@/lib/deepseek";
import { buildUserPreferenceProfile, getTopUserTags, matchIdols } from "@/lib/matcher";
import {
  getQuizQuestionsForMode,
  quizModes,
  quizQuestions,
  requiredDimensions,
  type QuizModeId
} from "@/lib/quiz";
import {
  buildMatchRecord,
  createMatchRecordId,
  parseMatchHistory,
  toggleFavoriteRecord,
  upsertMatchHistory,
  type MatchHistoryRecord
} from "@/lib/result-history";
import { buildEntryPathCards, getDimensionPercent } from "@/lib/result-insights";
import { buildPosterFilename, buildSharePosterLines, buildShareText } from "@/lib/share";
import type { MatchResult } from "@/lib/types";

type Screen = "start" | "quiz" | "generating" | "result" | "error";
type Answers = Record<string, string>;
type DeepSeekConnectionStatus = "idle" | "validating" | "connected" | "failed";
type DeepSeekResultStatus = "idle" | "loading" | "failed";
type StoredQuizState = {
  mode: QuizModeId;
  answers: Answers;
};

const storageKey = "idol-match-test.state.v2";
const historyStorageKey = "idol-match-test.history.v1";

const isQuizModeId = (value: unknown): value is QuizModeId =>
  typeof value === "string" && value in quizModes;

const isQuizValid = () =>
  quizQuestions.length === 40 &&
  requiredDimensions.length === 8 &&
  quizQuestions.every((question) => question.options.length === 4);

const getAnsweredCount = (answers: Answers, questions = quizQuestions) =>
  questions.filter((question) => Boolean(answers[question.id])).length;

const sourceLabel = idolDataBundle.status.mode === "rag" ? "候选库已读取" : "演示候选库";

const writeClipboardText = async (text: string) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to the textarea path below when clipboard permission is unavailable.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
};

const wrapCanvasText = (
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) => {
  let line = "";
  let cursorY = y;

  for (const char of text) {
    const nextLine = line + char;
    if (context.measureText(nextLine).width > maxWidth && line) {
      context.fillText(line, x, cursorY);
      line = char;
      cursorY += lineHeight;
    } else {
      line = nextLine;
    }
  }

  if (line) {
    context.fillText(line, x, cursorY);
  }

  return cursorY + lineHeight;
};

const downloadCanvasPng = (canvas: HTMLCanvasElement, filename: string) => {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
};

const formatSavedAt = (savedAt: string) => savedAt.slice(5, 16).replace("T", " ");

const buildDeepSeekCandidates = (matches: MatchResult[]): DeepSeekCandidate[] =>
  matches.slice(0, 8).map((match) => ({
    id: match.idol.id,
    name: match.idol.name,
    summary: match.idol.summary,
    score: match.score,
    confidence: match.confidence,
    tags: match.idol.tags.slice(0, 12),
    matchedTags: match.matchedTags.slice(0, 8),
    entryReasons: match.idol.entryReasons.slice(0, 5),
    dimensionScores: match.dimensionScores
  }));

const publicSmartError = (message?: string) => {
  if (!message) return "智能分析暂时不可用，请稍后再试。";
  if (/hub|api|key|provider|model|模型|供应商|密钥|token|openai|deepseek|gemini|claude/i.test(message)) {
    return "智能分析暂时不可用，请稍后再试。";
  }
  return message;
};

export function IdolMatchTest() {
  const [screen, setScreen] = useState<Screen>("start");
  const [mode, setMode] = useState<QuizModeId>("experience");
  const [answers, setAnswers] = useState<Answers>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryRecord[]>([]);
  const [deepSeekConnectionStatus, setDeepSeekConnectionStatus] =
    useState<DeepSeekConnectionStatus>("connected");
  const [deepSeekMessage, setDeepSeekMessage] = useState("智能分析已准备。");
  const [deepSeekResult, setDeepSeekResult] = useState<DeepSeekGeneratedResult | null>(null);
  const [deepSeekResultStatus, setDeepSeekResultStatus] = useState<DeepSeekResultStatus>("idle");
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [posterStatus, setPosterStatus] = useState<"idle" | "saved" | "failed">("idle");

  const activeQuestions = useMemo(() => getQuizQuestionsForMode(mode), [mode]);
  const activeMode = quizModes[mode];
  const answeredCount = getAnsweredCount(answers, activeQuestions);
  const currentQuestion = activeQuestions[currentIndex];
  const progress = Math.round((answeredCount / activeQuestions.length) * 100);
  const fatalError = idolDataBundle.profiles.length === 0 || !isQuizValid();
  const selectedOptionIds = useMemo(
    () =>
      activeQuestions
        .map((question) => answers[question.id])
        .filter((optionId): optionId is string => Boolean(optionId)),
    [activeQuestions, answers]
  );
  const userProfile = useMemo(
    () => buildUserPreferenceProfile(selectedOptionIds),
    [selectedOptionIds]
  );
  const matches = useMemo(
    () => (answeredCount === activeQuestions.length ? matchIdols(userProfile, idolDataBundle.profiles) : []),
    [activeQuestions.length, answeredCount, userProfile]
  );
  const fixedMatch = matches[0];
  const topMatch = useMemo<MatchResult | undefined>(() => {
    if (!deepSeekResult || !fixedMatch || deepSeekResult.idolId !== fixedMatch.idol.id) {
      return undefined;
    }

    return {
      ...fixedMatch,
      reasons: deepSeekResult.reasons.length > 0 ? deepSeekResult.reasons : fixedMatch.reasons
    };
  }, [deepSeekResult, fixedMatch]);
  const topUserTags = getTopUserTags(userProfile, 8);
  const answerSignature = useMemo(
    () => activeQuestions.map((question) => answers[question.id] ?? "-").join("|"),
    [activeQuestions, answers]
  );
  const currentRecordId = topMatch ? createMatchRecordId(mode, answerSignature) : "";
  const isCurrentFavorite = Boolean(
    currentRecordId && matchHistory.find((record) => record.id === currentRecordId)?.favorite
  );
  const visibleHistory = matchHistory.slice(0, 5);
  const favoriteCount = matchHistory.filter((record) => record.favorite).length;
  const isDeepSeekConnected =
    deepSeekConnectionStatus === "connected";
  const resultSummary = deepSeekResult?.summary || topMatch?.idol.summary || "";
  const displayTopMatches = useMemo(() => {
    if (!deepSeekResult) {
      return [];
    }

    return matches.slice(0, 3).map((match, index) => {
      const generated = deepSeekResult.top3.find((item) => item.idolId === match.idol.id);

      return {
        match,
        difference:
          generated?.difference ??
          (index === 0
            ? "这是固定答案表命中的第一名，智能分析只补充说明，不改变匹配对象。"
            : "这是固定匹配排序中的备选结果，智能分析未返回额外差异说明。")
      };
    });
  }, [deepSeekResult, matches]);
  const entryPathCards = useMemo(
    () => (topMatch ? buildEntryPathCards(topMatch.idol, deepSeekResult?.entryPath ?? []) : []),
    [deepSeekResult, topMatch]
  );
  const maxDimensionScore = Math.max(0, ...(topMatch?.dimensionScores ?? []).map((item) => item.score));

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      try {
        const raw = window.localStorage.getItem(storageKey);
        const rawHistory = window.localStorage.getItem(historyStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<StoredQuizState> | Answers;
          const savedMode: QuizModeId =
            "mode" in parsed && isQuizModeId(parsed.mode)
              ? parsed.mode
              : "experience";
          const savedAnswers =
            "answers" in parsed && parsed.answers ? parsed.answers : (parsed as Answers);
          const savedQuestions = getQuizQuestionsForMode(savedMode);
          const safeAnswers = Object.fromEntries(
            Object.entries(savedAnswers).filter(([questionId, optionId]) =>
              quizQuestions.some(
                (question) =>
                  question.id === questionId &&
                  question.options.some((option) => option.id === optionId)
              )
            )
          );
          if (!cancelled) {
            setMode(savedMode);
            setAnswers(safeAnswers);
            setCurrentIndex(
              Math.max(0, savedQuestions.findIndex((question) => !safeAnswers[question.id]))
            );
          }
        }
        if (!cancelled) {
          setMatchHistory(parseMatchHistory(rawHistory));
        }
      } catch {
        window.localStorage.removeItem(storageKey);
        window.localStorage.removeItem(historyStorageKey);
      } finally {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(storageKey, JSON.stringify({ mode, answers } satisfies StoredQuizState));
    }
  }, [answers, hydrated, mode]);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(historyStorageKey, JSON.stringify(matchHistory));
    }
  }, [hydrated, matchHistory]);

  useEffect(() => {
    if (!hydrated || screen !== "result" || !topMatch || !answerSignature) {
      return;
    }

    const nextRecord = buildMatchRecord({
      mode,
      modeName: activeMode.name,
      answerSignature,
      match: topMatch
    });

    queueMicrotask(() => {
      setMatchHistory((current) => upsertMatchHistory(current, nextRecord));
    });
  }, [activeMode.name, answerSignature, hydrated, mode, screen, topMatch]);

  const generateDeepSeekMatchResult = async () => {
    if (!isDeepSeekConnected) {
      setDeepSeekConnectionStatus("failed");
      setDeepSeekMessage("智能分析暂时不可用，请稍后再试。");
      setScreen("start");
      return;
    }

    const candidates = buildDeepSeekCandidates(matches);
    const fixedIdolId = candidates[0]?.id ?? "";

    if (candidates.length === 0 || !fixedIdolId) {
      setDeepSeekResultStatus("failed");
      setDeepSeekMessage("当前没有足够候选数据生成结果。");
      setScreen("generating");
      return;
    }

    setDeepSeekResult(null);
    setDeepSeekResultStatus("loading");
    setScreen("generating");
    window.scrollTo({ top: 0, behavior: "smooth" });

    try {
      const response = await fetch("/api/compatible-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modeName: activeMode.name,
          userTags: topUserTags,
          fixedIdolId,
          candidates
        })
      });
      const payload = (await response.json()) as {
        result?: DeepSeekGeneratedResult;
        error?: { message?: string };
      };

      if (!response.ok || !payload.result) {
        setDeepSeekResultStatus("failed");
        setDeepSeekMessage(publicSmartError(payload.error?.message));
        return;
      }

      setDeepSeekResult(payload.result);
      setDeepSeekResultStatus("idle");
      setScreen("result");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setDeepSeekResultStatus("failed");
      setDeepSeekMessage("智能分析暂时不可用，请稍后再试。");
    }
  };

  const selectMode = (nextMode: QuizModeId) => {
    setMode(nextMode);
    setScreen("start");
    setDeepSeekResult(null);
    setDeepSeekResultStatus("idle");
    const nextQuestions = getQuizQuestionsForMode(nextMode);
    const firstUnanswered = nextQuestions.findIndex((question) => !answers[question.id]);
    setCurrentIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
  };

  const startQuiz = () => {
    if (fatalError) {
      setScreen("error");
      return;
    }

    if (!isDeepSeekConnected) {
      setDeepSeekConnectionStatus("failed");
      setDeepSeekMessage("智能分析暂时不可用，请稍后再试。");
      return;
    }

    if (answeredCount === activeQuestions.length) {
      void generateDeepSeekMatchResult();
      return;
    }

    setScreen("quiz");
    const firstUnanswered = activeQuestions.findIndex((question) => !answers[question.id]);
    setCurrentIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
  };

  const chooseOption = (optionId: string) => {
    setDeepSeekResult(null);
    setDeepSeekResultStatus("idle");
    setAnswers((current) => ({
      ...current,
      [currentQuestion.id]: optionId
    }));
  };

  const goNext = () => {
    if (!answers[currentQuestion.id]) {
      return;
    }

    if (currentIndex === activeQuestions.length - 1) {
      if (answeredCount === activeQuestions.length) {
        void generateDeepSeekMatchResult();
        return;
      }

      const firstUnanswered = activeQuestions.findIndex((question) => !answers[question.id]);
      setCurrentIndex(firstUnanswered >= 0 ? firstUnanswered : currentIndex);
      return;
    }

    setCurrentIndex((index) => Math.min(index + 1, activeQuestions.length - 1));
  };

  const goPrev = () => {
    setCurrentIndex((index) => Math.max(index - 1, 0));
  };

  const restart = () => {
    setAnswers({});
    setCurrentIndex(0);
    setScreen("start");
    setShareStatus("idle");
    setPosterStatus("idle");
    setDeepSeekResult(null);
    setDeepSeekResultStatus("idle");
    window.localStorage.removeItem(storageKey);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const copyResult = async () => {
    if (!topMatch) {
      return;
    }

    const text = buildShareText({
      modeName: activeMode.name,
      idolName: topMatch.idol.name,
      score: topMatch.score,
      tags: topMatch.matchedTags
    });

    const copied = await writeClipboardText(text);
    setShareStatus(copied ? "copied" : "failed");
  };

  const toggleCurrentFavorite = () => {
    if (!topMatch || !answerSignature) {
      return;
    }

    const nextRecord = buildMatchRecord({
      mode,
      modeName: activeMode.name,
      answerSignature,
      match: topMatch
    });

    setMatchHistory((current) => toggleFavoriteRecord(upsertMatchHistory(current, nextRecord), nextRecord.id));
  };

  const toggleHistoryFavorite = (recordId: string) => {
    setMatchHistory((current) => toggleFavoriteRecord(current, recordId));
  };

  const downloadPoster = () => {
    if (!topMatch) {
      return;
    }

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1440;
      const context = canvas.getContext("2d");

      if (!context) {
        setPosterStatus("failed");
        return;
      }

      const lines = buildSharePosterLines({
        modeName: activeMode.name,
        idolName: topMatch.idol.name,
        score: topMatch.score,
        confidence: topMatch.confidence,
        tags: topMatch.matchedTags,
        topReasons: topMatch.idol.entryReasons
      });

      context.fillStyle = "#fffaf1";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = "rgba(255, 111, 97, 0.16)";
      context.lineWidth = 2;

      for (let x = 0; x <= canvas.width; x += 56) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, canvas.height);
        context.stroke();
      }

      for (let y = 0; y <= canvas.height; y += 56) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(canvas.width, y);
        context.stroke();
      }

      context.fillStyle = "#ffffff";
      context.strokeStyle = "#211b21";
      context.lineWidth = 4;
      context.beginPath();
      context.roundRect(76, 84, 928, 1228, 28);
      context.fill();
      context.stroke();

      context.fillStyle = "#ff6f61";
      context.fillRect(76, 84, 928, 18);

      context.fillStyle = "#211b21";
      context.font = "800 42px Avenir Next, Microsoft YaHei, sans-serif";
      context.fillText(lines[0], 126, 180);

      context.font = "900 80px Avenir Next, Microsoft YaHei, sans-serif";
      let cursorY = wrapCanvasText(context, lines[1], 126, 310, 820, 92);

      context.fillStyle = "#f4c84a";
      context.strokeStyle = "#211b21";
      context.lineWidth = 4;
      context.beginPath();
      context.roundRect(126, cursorY + 32, 360, 150, 18);
      context.fill();
      context.stroke();

      context.fillStyle = "#211b21";
      context.font = "900 58px Avenir Next, Microsoft YaHei, sans-serif";
      context.fillText(String(topMatch.score), 166, cursorY + 122);
      context.font = "800 30px Avenir Next, Microsoft YaHei, sans-serif";
      context.fillText("匹配分", 292, cursorY + 120);

      context.font = "800 34px Avenir Next, Microsoft YaHei, sans-serif";
      cursorY += 260;
      cursorY = wrapCanvasText(context, lines[2], 126, cursorY, 820, 48);
      context.fillStyle = "#6f6670";
      context.font = "700 34px Avenir Next, Microsoft YaHei, sans-serif";
      cursorY = wrapCanvasText(context, lines[3], 126, cursorY + 30, 820, 50);
      cursorY = wrapCanvasText(context, lines[4], 126, cursorY + 20, 820, 50);

      context.fillStyle = "#34b79a";
      context.font = "900 34px Avenir Next, Microsoft YaHei, sans-serif";
      context.fillText("截图或保存这张图，发给朋友一起测。", 126, 1228);

      downloadCanvasPng(canvas, buildPosterFilename(topMatch.idol.name, activeMode.name));
      setPosterStatus("saved");
    } catch {
      setPosterStatus("failed");
    }
  };

  if (screen === "error") {
    return (
      <main className="app-shell">
        <section className="error-card">
          <p className="hero-kicker">DATA CHECK</p>
          <h1>数据暂时不可用</h1>
          <p>
            {idolDataBundle.profiles.length === 0
              ? "候选爱豆库为空，无法计算匹配结果。"
              : "题库结构异常，需要保持 40 道题且每题 4 个选项。"}
          </p>
          <p className="small-muted">{idolDataBundle.status.message}</p>
          <button className="primary-button" type="button" onClick={() => setScreen("start")}>
            回到首页
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="app-frame">
        <header className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark">{activeMode.questionCount}</div>
            <div>
              <h1 className="brand-title">爱豆匹配测试</h1>
              <p className="brand-subtitle">{activeMode.name} · 娱乐向偏好测算</p>
            </div>
          </div>
          <div className="source-pill" data-mode={idolDataBundle.status.mode}>
            {sourceLabel} · {idolDataBundle.profiles.length} 位候选
          </div>
        </header>

        {screen === "start" && (
          <section className="api-connect-panel api-connect-panel--gate" data-status={deepSeekConnectionStatus}>
            <div>
              <p className="section-kicker">SMART RESULT</p>
              <h2 className="api-key-label">智能分析自动准备</h2>
              <p className="small-muted">
                匹配爱豆由本地固定规则决定；完成答题后会自动生成结果说明，无需额外设置。
              </p>
            </div>
            <p className="api-status">{deepSeekMessage}</p>
          </section>
        )}

        {screen === "start" && (
          <section className="start-grid">
            <div className="panel">
              <p className="hero-kicker">IDOL MATCH LAB</p>
              <h2 className="hero-title">{activeMode.questionCount}题找到你最可能粉上的爱豆</h2>
              <p className="hero-copy">
                体验版更快，专业版更细。两种版本都会从颜值审美、舞台/作品偏好、陪伴需求、反差感、消费倾向和饭圈互动方式建模。
              </p>
              <div className="mode-picker" aria-label="选择测试版本">
                {(Object.keys(quizModes) as QuizModeId[]).map((modeId) => {
                  const item = quizModes[modeId];

                  return (
                    <button
                      className="mode-button"
                      data-active={mode === modeId}
                      key={modeId}
                      type="button"
                      onClick={() => selectMode(modeId)}
                    >
                      <span className="mode-name">{item.name}</span>
                      <span className="mode-count">{item.shortName}</span>
                      <span className="mode-summary">{item.summary}</span>
                    </button>
                  );
                })}
              </div>
              <div className="start-actions">
                <button
                  className="primary-button"
                  type="button"
                  disabled={!isDeepSeekConnected}
                  onClick={startQuiz}
                >
                  开始{activeMode.name}
                </button>
                {answeredCount > 0 && (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={!isDeepSeekConnected}
                    onClick={() => setScreen("quiz")}
                  >
                    继续第 {Math.min(currentIndex + 1, activeQuestions.length)} 题
                  </button>
                )}
              </div>
              {idolDataBundle.status.mode !== "rag" && (
                <div className="notice">
                  <strong>当前使用演示候选库</strong>
                  {idolDataBundle.status.message}
                </div>
              )}
            </div>

            <aside className="panel">
              <p className="section-kicker">READY</p>
              <div className="stat-grid">
                <div className="stat-tile">
                  <span className="stat-number">{activeMode.questionCount}</span>
                  <span className="stat-label">{activeMode.name}，每题 4 个选项</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-number">8</span>
                  <span className="stat-label">偏好维度覆盖完整</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-number">{idolDataBundle.profiles.length}</span>
                  <span className="stat-label">候选爱豆画像</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-number">{answeredCount}</span>
                  <span className="stat-label">当前版本已答题目</span>
                </div>
              </div>
            </aside>
          </section>
        )}

        {screen === "quiz" && currentQuestion && (
          <section className="quiz-layout">
            <article className="question-card">
              <div className="progress-line">
                <div className="progress-meta">
                  <span className="dimension-chip">{currentQuestion.dimension}</span>
                  <span className="progress-count">
                    {currentIndex + 1} / {activeQuestions.length}
                  </span>
                </div>
                <span className="progress-count">{activeMode.name} · 已答 {answeredCount}</span>
              </div>
              <div className="bar" aria-label={`答题进度 ${progress}%`}>
                <div className="bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <h2 className="question-title">{currentQuestion.text}</h2>
              <div className="options-grid">
                {currentQuestion.options.map((item) => (
                  <button
                    className="option-button"
                    data-selected={answers[currentQuestion.id] === item.id}
                    key={item.id}
                    type="button"
                    onClick={() => chooseOption(item.id)}
                  >
                    <span className="option-label">{item.label}</span>
                    <span className="option-tags">
                      {item.tags.slice(0, 3).map((tag) => (
                        <span className="mini-tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
              <div className="quiz-actions">
                <button
                  className="ghost-button"
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={goPrev}
                >
                  上一题
                </button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={!answers[currentQuestion.id]}
                  onClick={goNext}
                >
                  {currentIndex === activeQuestions.length - 1 ? "查看结果" : "下一题"}
                </button>
              </div>
            </article>

            <aside className="panel answer-panel">
              <p className="section-kicker">ANSWER MAP</p>
              <h2 className="brand-title">已答状态</h2>
              <p className="small-muted">点亮代表已选择，可点击任意题回看修改。</p>
              <div className="answer-strip">
                {activeQuestions.map((question, index) => (
                  <button
                    aria-label={`第 ${index + 1} 题`}
                    className="answer-dot"
                    data-answered={Boolean(answers[question.id])}
                    data-current={index === currentIndex}
                    key={question.id}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              <p className="small-muted">还差 {activeQuestions.length - answeredCount} 题即可生成推荐。</p>
            </aside>
          </section>
        )}

        {screen === "generating" && (
          <section className="panel generating-panel">
            <p className="section-kicker">AI RESULT</p>
            <h2 className="brand-title">
              {deepSeekResultStatus === "failed" ? "智能分析暂时不可用" : "正在生成测评结果"}
            </h2>
            <p className="hero-copy">
              {deepSeekResultStatus === "failed"
                ? deepSeekMessage
                : "正在把固定匹配结果和候选短名单整理成完整说明，生成前不会展示分析兜底。"}
            </p>
            <div className="start-actions">
              <button
                className="primary-button"
                type="button"
                disabled={deepSeekResultStatus === "loading"}
                onClick={generateDeepSeekMatchResult}
              >
                重新生成
              </button>
              <button className="secondary-button" type="button" onClick={() => setScreen("quiz")}>
                返回修改答案
              </button>
            </div>
          </section>
        )}

        {screen === "result" && topMatch && (
          <section className="result-stack">
            <article className="result-hero">
              <div className="result-top">
                <div>
                  <p className="idol-rank">TOP 1 · {activeMode.name} · 固定匹配 · AI 分析</p>
                  <h2 className="idol-name">{topMatch.idol.name}</h2>
                  <p className="idol-summary">{resultSummary}</p>
                  <div className="chip-cloud" style={{ marginTop: 16 }}>
                    {topMatch.idol.tags.slice(0, 8).map((tag) => (
                      <span className="tag-chip" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="score-badge">
                  <span>
                    <span className="score-value">{topMatch.score}</span>
                    <span className="score-label">匹配分</span>
                    <span className="score-confidence">置信度 {topMatch.confidence}%</span>
                  </span>
                </div>
              </div>

              <div className="result-body">
                <div>
                  <p className="section-kicker">WHY MATCH</p>
                  <ul className="reason-list">
                    {topMatch.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <div className="entry-path-inline">
                    <p className="section-kicker">ENTRY PATH</p>
                    <div className="entry-card-list">
                      {entryPathCards.map((card) => (
                        <article className="entry-card" key={card.step}>
                          <span>{card.step}</span>
                          <h3>{card.title}</h3>
                          <strong>{card.action}</strong>
                          <p>{card.detail}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                </div>

                <aside>
                  <p className="section-kicker">YOUR PROFILE</p>
                  <div className="chip-cloud">
                    {topUserTags.map((tag) => (
                      <span className="matched-chip" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="section-kicker" style={{ marginTop: 22 }}>
                    MATCH MAP
                  </p>
                  <div className="dimension-list" aria-label="MATCH MAP 维度分布">
                    {topMatch.dimensionScores.map((item) => {
                      const percent = getDimensionPercent(item.score, maxDimensionScore);

                      return (
                        <div className="dimension-row" key={item.label}>
                          <div className="dimension-row-head">
                            <span>{item.label}</span>
                            <strong>{item.score}</strong>
                          </div>
                          <div className="dimension-track" aria-hidden="true">
                            <span style={{ width: `${percent}%` }} />
                          </div>
                          <small>{item.matchedTags.join(" / ") || "暂无直接命中"}</small>
                        </div>
                      );
                    })}
                  </div>
                </aside>
              </div>

              <div className="share-poster" aria-label="结果海报预览">
                <div>
                  <p className="section-kicker">SHARE POSTER</p>
                  <h3>{activeMode.name} · {topMatch.idol.name}</h3>
                  <p>{topMatch.matchedTags.slice(0, 4).join(" / ") || "偏好路径较分散"}</p>
                </div>
                <div className="poster-score">
                  <strong>{topMatch.score}</strong>
                  <span>匹配分</span>
                </div>
              </div>
            </article>

            <section>
              <div className="progress-line">
                <div>
                  <p className="section-kicker">TOP 3</p>
                  <h2 className="brand-title">候选推荐</h2>
                </div>
                <div className="result-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    aria-pressed={isCurrentFavorite}
                    onClick={toggleCurrentFavorite}
                  >
                    {isCurrentFavorite ? "已收藏" : "收藏结果"}
                  </button>
                  <button className="secondary-button" type="button" onClick={downloadPoster}>
                    下载海报
                  </button>
                  <button className="secondary-button" type="button" onClick={copyResult}>
                    复制结果
                  </button>
                  <button className="secondary-button" type="button" onClick={restart}>
                    重新测试
                  </button>
                  {shareStatus !== "idle" && (
                    <span className="share-status">
                      {shareStatus === "copied" ? "已复制" : "复制失败，可手动截图分享"}
                    </span>
                  )}
                  {posterStatus !== "idle" && (
                    <span className="share-status">
                      {posterStatus === "saved" ? "海报已生成" : "海报生成失败，可手动截图分享"}
                    </span>
                  )}
                </div>
              </div>
              <div className="top3-grid">
                {displayTopMatches.map(({ match, difference }, index) => (
                  <article className="candidate-card" key={match.idol.id}>
                    <span className="candidate-rank">#{index + 1} · {match.score} 分</span>
                    <h3>{match.idol.name}</h3>
                    <p>{match.matchedTags.slice(0, 4).join(" / ") || "偏好路径较分散"}</p>
                    <p className="candidate-diff">{difference}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="history-panel">
              <div className="progress-line">
                <div>
                  <p className="section-kicker">SAVED</p>
                  <h2 className="brand-title">收藏与历史</h2>
                </div>
                <span className="history-count">{favoriteCount} 个收藏 · {matchHistory.length} 条历史</span>
              </div>
              <div className="history-list">
                {visibleHistory.length > 0 ? (
                  visibleHistory.map((record) => (
                    <article className="history-card" data-favorite={record.favorite} key={record.id}>
                      <div>
                        <span className="candidate-rank">
                          {record.modeName} · {formatSavedAt(record.savedAt)}
                        </span>
                        <h3>{record.idolName}</h3>
                        <p>
                          {record.score} 分 · {record.tags.join(" / ") || "偏好路径较分散"}
                        </p>
                      </div>
                      <button
                        className="history-favorite"
                        type="button"
                        aria-pressed={record.favorite}
                        onClick={() => toggleHistoryFavorite(record.id)}
                      >
                        {record.favorite ? "已收藏" : "收藏"}
                      </button>
                    </article>
                  ))
                ) : (
                  <p className="small-muted">完成一次测试后会自动保存最近结果。</p>
                )}
              </div>
            </section>

            {idolDataBundle.status.mode !== "rag" && (
              <div className="notice">
                <strong>当前结果基于演示候选库</strong>
                补全候选资料后，系统会自动使用完整候选库生成推荐。
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
