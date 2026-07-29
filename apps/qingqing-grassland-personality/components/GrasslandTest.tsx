"use client";

import { type CSSProperties, useMemo, useState } from "react";

import {
  answerOptions,
  dimensions,
  getQuestionsForMode,
  personalityTypes,
  type PersonalityType,
  testModes,
  type AnswerValue,
  type DimensionId,
  type TestModeId
} from "@/data/personality-test";
import {
  type GeneratedPersonalityResult
} from "@/lib/deepseek-result";
import {
  calculateScores,
  findClosestPersonality,
  getDimensionPositionLabel,
  type AnswerMap
} from "@/lib/scoring";
import {
  buildAtlasCardFilename,
  buildAtlasCardSvg,
  buildShareCardFilename,
  buildShareCardSvg,
  getClosestPersonalityMatches,
  getDimensionInsight,
  shareCardStyles,
  type DimensionInsight,
  type ShareCardStyleId
} from "@/lib/result-enhancements";
import {
  getAnswerFeedback,
  getExperienceModeNudge,
  getPersonalityUniversePoints,
  getRelationshipComboLibrary,
  resultTabs,
  type AnswerFeedback,
  type ResultTabId
} from "@/lib/result-experience";
import { buildModeHelperLine } from "@/lib/test-mode-copy";
import {
  buildShareText,
  getDimensionMarkerPosition,
  getDimensionNeedleRotation,
  getPersonalityVisualProfile
} from "@/lib/result-presentation";
import {
  getDailyGrasslandWeather,
  getPersonalityAtlasEntries,
  getRelationshipReport
} from "@/lib/social-growth";
import {
  addArchivedResult,
  clearArchiveStorage,
  createArchivedResult,
  getArchiveDelta,
  readArchive,
  writeArchive,
  type ArchiveDelta,
  type ArchivedResult
} from "@/lib/result-archive";

type Phase = "home" | "test" | "generating" | "result";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const dimensionOrder: DimensionId[] = ["SE", "AC", "RB", "RV", "EE"];

const completionMessages = [
  "草尖刚刚动了一下",
  "风向开始清楚",
  "小路已经走过一半",
  "远处的轮廓亮起来了",
  "马上抵达你的草原意象"
];

function publicSmartError(message?: string) {
  if (!message) return "智能结果暂时不可用，请稍后再试。";
  if (/hub|api|key|provider|model|模型|供应商|密钥|token|openai|deepseek|gemini|claude/i.test(message)) {
    return "智能结果暂时不可用，请稍后再试。";
  }
  return message;
}

function loadInitialArchive(): ArchivedResult[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    return readArchive(window.localStorage);
  } catch {
    return [];
  }
}

export function GrasslandTest() {
  const [phase, setPhase] = useState<Phase>("home");
  const [generatedResult, setGeneratedResult] = useState<GeneratedPersonalityResult | null>(null);
  const [generationError, setGenerationError] = useState("");
  const [selectedModeId, setSelectedModeId] = useState<TestModeId>("professional");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [copied, setCopied] = useState(false);
  const [imageStatus, setImageStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [selectedShareStyleId, setSelectedShareStyleId] = useState<ShareCardStyleId>("classic");
  const [atlasImageStatus, setAtlasImageStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [activeAtlasImageId, setActiveAtlasImageId] = useState<string | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<ResultTabId>("overview");
  const [answerFeedback, setAnswerFeedback] = useState<AnswerFeedback | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [archiveEntries, setArchiveEntries] = useState<ArchivedResult[]>(loadInitialArchive);
  const [archiveStatus, setArchiveStatus] = useState<"idle" | "saved" | "cleared" | "error">("idle");

  const activeMode = testModes.find((mode) => mode.id === selectedModeId) ?? testModes[0]!;
  const activeQuestions = useMemo(() => getQuestionsForMode(selectedModeId), [selectedModeId]);
  const currentQuestion = activeQuestions[currentIndex];
  const answeredCount = activeQuestions.filter((question) => answers[question.id]).length;
  const selectedAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const progress = Math.round((answeredCount / activeQuestions.length) * 100);
  const scores = useMemo(() => calculateScores(answers, activeQuestions), [answers, activeQuestions]);
  const match = useMemo(() => findClosestPersonality(scores.normalized), [scores.normalized]);
  const resultPersonality = useMemo(
    () => mergeGeneratedResult(match, generatedResult),
    [generatedResult, match]
  );
  const visualProfile = useMemo(() => getPersonalityVisualProfile(resultPersonality.id), [resultPersonality.id]);
  const canSeeResult = answeredCount === activeQuestions.length;
  const canStartTest = true;
  const shareText = useMemo(() => buildShareText(resultPersonality), [resultPersonality]);
  const modeHelperLine = useMemo(() => buildModeHelperLine(activeMode), [activeMode]);
  const modeLabel = `${activeMode.name} · ${activeMode.badge}`;
  const closestMatches = useMemo(() => getClosestPersonalityMatches(scores.normalized, 3), [scores.normalized]);
  const selectedPartner = useMemo(
    () =>
      personalityTypes.find((personality) => personality.id === selectedPartnerId) ??
      personalityTypes.find((personality) => personality.id !== resultPersonality.id) ??
      personalityTypes[0]!,
    [resultPersonality.id, selectedPartnerId]
  );
  const relationshipReport = useMemo(
    () => getRelationshipReport(resultPersonality, selectedPartner),
    [resultPersonality, selectedPartner]
  );
  const dailyWeather = useMemo(() => getDailyGrasslandWeather(resultPersonality), [resultPersonality]);
  const atlasEntries = useMemo(() => getPersonalityAtlasEntries(resultPersonality.id), [resultPersonality.id]);
  const universePoints = useMemo(() => getPersonalityUniversePoints(resultPersonality.id), [resultPersonality.id]);
  const relationshipCombos = useMemo(() => getRelationshipComboLibrary(resultPersonality), [resultPersonality]);
  const experienceNudge = useMemo(
    () => getExperienceModeNudge(selectedModeId, answeredCount),
    [answeredCount, selectedModeId]
  );
  const dimensionInsights = useMemo(
    () =>
      dimensionOrder.reduce(
        (collection, dimensionId) => ({
          ...collection,
          [dimensionId]: getDimensionInsight(dimensionId, scores.normalized[dimensionId])
        }),
        {} as Record<DimensionId, DimensionInsight>
      ),
    [scores.normalized]
  );
  const shareCardSvg = useMemo(
    () =>
      buildShareCardSvg({
        personality: resultPersonality,
        visualProfile,
        scores: scores.normalized,
        modeLabel,
        dimensions,
        styleId: selectedShareStyleId
      }),
    [modeLabel, resultPersonality, scores.normalized, selectedShareStyleId, visualProfile]
  );
  const shareCardFilename = useMemo(
    () => buildShareCardFilename(resultPersonality.name, selectedShareStyleId),
    [resultPersonality.name, selectedShareStyleId]
  );

  function selectMode(modeId: TestModeId) {
    setSelectedModeId(modeId);
    setAnswers({});
    setGeneratedResult(null);
    setGenerationError("");
    setCurrentIndex(0);
    setCopied(false);
    setImageStatus("idle");
    setSelectedShareStyleId("classic");
    setAtlasImageStatus("idle");
    setActiveAtlasImageId(null);
    setActiveResultTab("overview");
    setAnswerFeedback(null);
    setSelectedPartnerId("");
    setArchiveStatus("idle");
  }

  function startTest() {
    if (!canStartTest) {
      setGenerationError("智能结果暂时不可用，请稍后再试。");
      return;
    }

    setAnswers({});
    setGeneratedResult(null);
    setGenerationError("");
    setPhase("test");
    setCurrentIndex(0);
    setCopied(false);
    setImageStatus("idle");
    setSelectedShareStyleId("classic");
    setAtlasImageStatus("idle");
    setActiveAtlasImageId(null);
    setActiveResultTab("overview");
    setAnswerFeedback(null);
    setSelectedPartnerId("");
    setArchiveStatus("idle");
  }

  function selectAnswer(value: AnswerValue) {
    if (!currentQuestion) {
      return;
    }

    setAnswers((previous) => ({
      ...previous,
      [currentQuestion.id]: value
    }));
    setGeneratedResult(null);
    setGenerationError("");
    setCopied(false);
    setImageStatus("idle");
    setAnswerFeedback(getAnswerFeedback(value));
    setArchiveStatus("idle");
  }

  async function goNext() {
    if (!selectedAnswer) {
      return;
    }

    if (currentIndex === activeQuestions.length - 1) {
      await generateResultWithDeepSeek();
      return;
    }

    setCurrentIndex((index) => index + 1);
  }

  function goBack() {
    setCurrentIndex((index) => Math.max(0, index - 1));
  }

  async function generateResultWithDeepSeek() {
    if (!canStartTest) {
      setGenerationError("智能结果暂时不可用，请稍后再试。");
      setPhase("home");
      return;
    }

    setPhase("generating");
    setGenerationError("");
    setActiveResultTab("overview");

    try {
      const response = await fetch(`${basePath}/api/deepseek-result`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          modeLabel,
          answeredCount,
          personalityId: match.id,
          scores: scores.normalized
        })
      });
      const body = await response.json() as {
        result?: GeneratedPersonalityResult;
        error?: string;
      };

      if (!response.ok || !body.result) {
        throw new Error(body.error ?? "智能结果生成失败。");
      }

      setGeneratedResult(body.result);
      setPhase("result");
    } catch (error) {
      setGenerationError(publicSmartError(error instanceof Error ? error.message : "智能结果生成失败。"));
      setPhase("test");
    }
  }

  function retake() {
    setAnswers({});
    setGeneratedResult(null);
    setGenerationError("");
    setCurrentIndex(0);
    setCopied(false);
    setImageStatus("idle");
    setSelectedShareStyleId("classic");
    setAtlasImageStatus("idle");
    setActiveAtlasImageId(null);
    setActiveResultTab("overview");
    setAnswerFeedback(null);
    setSelectedPartnerId("");
    setArchiveStatus("idle");
    setPhase("home");
  }

  async function copyShareText() {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function downloadShareCardImage() {
    setImageStatus("saving");

    const svgBlob = new Blob([shareCardSvg], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
      const pngBlob = await renderSvgToPng(svgUrl);
      downloadBlob(pngBlob, shareCardFilename);
      setImageStatus("saved");
    } catch {
      downloadBlob(svgBlob, shareCardFilename.replace(/\.png$/, ".svg"));
      setImageStatus("error");
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  async function downloadAtlasCardImage(personalityId: string) {
    const personality = personalityTypes.find((type) => type.id === personalityId);

    if (!personality) {
      return;
    }

    setAtlasImageStatus("saving");
    setActiveAtlasImageId(personality.id);

    const svg = buildAtlasCardSvg({
      personality,
      visualProfile: getPersonalityVisualProfile(personality.id),
      isCurrent: personality.id === resultPersonality.id
    });
    const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const filename = buildAtlasCardFilename(personality.name);

    try {
      const pngBlob = await renderSvgToPng(svgUrl);
      downloadBlob(pngBlob, filename);
      setAtlasImageStatus("saved");
    } catch {
      downloadBlob(svgBlob, filename.replace(/\.png$/, ".svg"));
      setAtlasImageStatus("error");
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  function startProfessionalRetake() {
    setSelectedModeId("professional");
    setAnswers({});
    setGeneratedResult(null);
    setGenerationError("");
    setCurrentIndex(0);
    setCopied(false);
    setImageStatus("idle");
    setSelectedShareStyleId("classic");
    setAtlasImageStatus("idle");
    setActiveAtlasImageId(null);
    setActiveResultTab("overview");
    setAnswerFeedback(null);
    setSelectedPartnerId("");
    setArchiveStatus("idle");
    setPhase("test");
  }

  function saveCurrentResultToArchive() {
    try {
      const entry = createArchivedResult({
        personality: resultPersonality,
        mode: activeMode,
        answeredCount,
        scores: scores.normalized
      });
      const nextArchive = addArchivedResult(archiveEntries, entry);

      writeArchive(window.localStorage, nextArchive);
      setArchiveEntries(nextArchive);
      setArchiveStatus("saved");
    } catch {
      setArchiveStatus("error");
    }
  }

  function clearGrasslandArchive() {
    try {
      clearArchiveStorage(window.localStorage);
      setArchiveEntries([]);
      setArchiveStatus("cleared");
    } catch {
      setArchiveStatus("error");
    }
  }

  return (
    <main className="grassland-shell px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-40px)] w-full max-w-5xl items-center justify-center">
        {phase === "home" && (
          <section className="paper-panel intro-panel w-full">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">轻松娱乐型测试</p>
                <h1 className="hero-title display-serif">
                  青青草原型
                  <span>人格测试器</span>
                </h1>
              </div>
              <div className="brand-stamp" aria-hidden="true">
                <span>风向</span>
                <small>meadow</small>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1.08fr_0.92fr]">
              <div className="story-card">
                <p className="lead-copy">
                  先选择完整的专业版，或更快的体验版。系统都会从社交能量、行动方式、关系策略、风险偏好和情绪表达五个维度，匹配一张属于你的草原意象。
                </p>
                <p className="support-copy">
                  它不是心理诊断，只是一面比较温柔、比较有梗的小镜子。认真答，也允许自己被逗笑一下。
                </p>
                <div className="terrain-strip" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </div>

              <div className="grid gap-3">
                {dimensions.map((dimension) => (
                  <div key={dimension.id} className="dimension-card">
                    <div className="dimension-card-head">
                      <span>{dimension.name}</span>
                      <span>{dimension.id}</span>
                    </div>
                    <div className="dimension-card-labels">
                      <span>{dimension.negativeLabel}</span>
                      <span>{dimension.positiveLabel}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mode-picker" role="group" aria-label="选择测试版本">
              {testModes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className="mode-card"
                  data-selected={selectedModeId === mode.id}
                  aria-pressed={selectedModeId === mode.id}
                  onClick={() => selectMode(mode.id)}
                >
                  <span className="mode-card-topline">
                    <strong>{mode.name}</strong>
                    <em>{mode.badge}</em>
                  </span>
                  <span>{mode.description}</span>
                  <small>{mode.estimatedTime}</small>
                </button>
              ))}
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className="meadow-button primary-action"
                disabled={!canStartTest}
                onClick={startTest}
              >
                进入{activeMode.name}
              </button>
              <p className="helper-line">
                {modeHelperLine}
              </p>
            </div>
            {generationError && (
              <p className="generation-error" role="alert">{generationError}</p>
            )}
          </section>
        )}

        {phase === "test" && currentQuestion && (
          <section className="paper-panel test-panel w-full" aria-labelledby="current-question">
            <div className="mb-6">
              <div className="progress-meta" aria-live="polite">
                <span>
                  第 {currentIndex + 1} 题 / {activeQuestions.length}
                </span>
                <span className="mode-inline">{activeMode.name}</span>
                <span>{progress}%</span>
              </div>
              <div className="progress-track" aria-hidden="true">
                <div
                  className="progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="progress-note">
                {completionMessages[Math.min(completionMessages.length - 1, Math.floor(progress / 22))]}
              </p>
              {generationError && (
                <p className="generation-error" role="alert">{generationError}</p>
              )}
            </div>

            <article className="question-card">
              <p className="eyebrow accent">请选择最贴近当下自己的答案</p>
              <h2 id="current-question" className="question-title">
                {currentQuestion.text}
              </h2>

              <fieldset className="likert-fieldset">
                <legend className="sr-only">五档同意程度</legend>
                <div className="likert-range-labels" aria-hidden="true">
                  <span>不同意</span>
                  <span>中间</span>
                  <span>同意</span>
                </div>
                <div className="likert-grid">
                  {answerOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className="answer-button"
                      data-selected={selectedAnswer === option.value}
                      aria-pressed={selectedAnswer === option.value}
                      aria-label={`${option.label}：${currentQuestion.text}`}
                      onClick={() => selectAnswer(option.value)}
                    >
                      <span className="scale-dot" aria-hidden="true" />
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <p
                className="answer-feedback"
                data-tone={answerFeedback?.tone ?? "neutral"}
                aria-live="polite"
              >
                {answerFeedback ? (
                  <>
                    <strong>{answerFeedback.label}</strong>
                    <span>{answerFeedback.message}</span>
                  </>
                ) : (
                  <span>选一个最贴近当下自己的答案，风向会轻轻记录下来。</span>
                )}
              </p>
            </article>

            <div className="test-actions">
              <button
                type="button"
                className="quiet-button secondary-action"
                disabled={currentIndex === 0}
                onClick={goBack}
              >
                上一题
              </button>

              <div className="flex flex-col gap-3 sm:flex-row">
                {canSeeResult && (
                  <button
                    type="button"
                    className="quiet-button secondary-action"
                    onClick={generateResultWithDeepSeek}
                  >
                    查看结果
                  </button>
                )}
                <button
                  type="button"
                  className="meadow-button secondary-action"
                  disabled={!selectedAnswer}
                  onClick={goNext}
                >
                  {currentIndex === activeQuestions.length - 1 ? "生成结果" : "下一题"}
                </button>
              </div>
            </div>
          </section>
        )}

        {phase === "generating" && (
          <section className="paper-panel generating-panel w-full" aria-live="polite">
            <p className="eyebrow accent">正在生成结果</p>
            <h2 className="generating-title display-serif">正在把五维风向写成草原意象</h2>
            <p>
              本地计分已经完成，当前正在根据你的维度分数生成结果页文案。
              请保持页面打开，不要重复提交。
            </p>
            <div className="generation-meter" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </section>
        )}

        {phase === "result" && (
          <section className="paper-panel result-panel w-full" aria-labelledby="result-title">
            <div className="result-hero">
              <div className={`personality-card ${visualProfile.toneClass}`}>
                <div className="personality-card-top">
                  <p className="eyebrow">你的草原意象是</p>
                  <span className="mode-pill">{modeLabel}</span>
                  <div className="result-stamp" aria-hidden="true">
                    {visualProfile.stampText}
                  </div>
                </div>
                <h2 id="result-title" className="result-title display-serif">
                  {resultPersonality.name}
                </h2>
                <p className="motif-label">{visualProfile.motifLabel}</p>
                <p className="terrain-line">{visualProfile.terrainLine}</p>
                <div className="keyword-row">
                  {resultPersonality.keywords.map((keyword) => (
                    <span key={keyword}>{keyword}</span>
                  ))}
                </div>
                <p className="result-summary">{resultPersonality.summary}</p>
                <div className="daily-advice">今日草原提醒：{resultPersonality.dailyAdvice}</div>
              </div>

              <div className="wind-card" aria-label="五维风向仪">
                <div className="wind-card-head">
                  <p className="eyebrow accent">五维风向仪</p>
                  <p>越偏向一侧，说明该维度倾向越明显。</p>
                </div>
                <div className="wind-dial" aria-hidden="true">
                  <span className="dial-ring" />
                  {dimensionOrder.map((dimensionId) => (
                    <span
                      key={dimensionId}
                      className="dial-needle"
                      style={
                        {
                          "--needle-angle": getDimensionNeedleRotation(scores.normalized[dimensionId])
                        } as CSSProperties
                      }
                    />
                  ))}
                  <span className="dial-core">{visualProfile.stampText}</span>
                </div>
              </div>
            </div>

            <nav className="result-tab-nav" aria-label="结果内容">
              {resultTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className="result-tab-button"
                  data-active={activeResultTab === tab.id}
                  aria-pressed={activeResultTab === tab.id}
                  onClick={() => setActiveResultTab(tab.id)}
                >
                  <span>{tab.eyebrow}</span>
                  <strong>{tab.label}</strong>
                </button>
              ))}
            </nav>

            <div className="result-tab-content" hidden={activeResultTab !== "overview"}>
            <div className="result-block-grid">
              <ResultBlock title="优势" body={resultPersonality.strength} />
              <ResultBlock title="盲点" body={resultPersonality.blindSpot} />
              <ResultBlock title="相处建议" body={resultPersonality.relationshipTip} />
            </div>

              {experienceNudge && (
                <article className="experience-nudge">
                  <div>
                    <p className="eyebrow accent">体验版可信度提示</p>
                    <h3>{experienceNudge.title}</h3>
                    <p>{experienceNudge.body}</p>
                  </div>
                  <button
                    type="button"
                    className="meadow-button compact-action"
                    onClick={startProfessionalRetake}
                  >
                    {experienceNudge.ctaLabel}
                  </button>
                </article>
              )}
            </div>

            <div className="result-tab-content" hidden={activeResultTab !== "social"}>
            <div className="growth-grid">
              <article className="daily-weather-card">
                <div className="growth-card-head">
                  <div>
                    <p className="eyebrow accent">每日草原天气</p>
                    <h3>{dailyWeather.title}</h3>
                  </div>
                  <span>{dailyWeather.seedDate}</span>
                </div>
                <p>{dailyWeather.forecast}</p>
                <strong>{dailyWeather.action}</strong>
              </article>

              <article className="relationship-card">
                <div className="growth-card-head">
                  <div>
                    <p className="eyebrow accent">双人相处报告</p>
                    <h3>{relationshipReport.climate}</h3>
                  </div>
                  <strong>距离 {relationshipReport.distance}</strong>
                </div>

                <label className="partner-select-label" htmlFor="partner-type">
                  对方草原意象
                </label>
                <select
                  id="partner-type"
                  className="partner-select"
                  value={selectedPartner.id}
                  onChange={(event) => setSelectedPartnerId(event.target.value)}
                >
                  {personalityTypes.map((personality) => (
                    <option key={personality.id} value={personality.id}>
                      {personality.name}
                      {personality.id === resultPersonality.id ? "（当前结果）" : ""}
                    </option>
                  ))}
                </select>

                <p className="relationship-summary">{relationshipReport.summary}</p>
                <div className="report-metrics">
                  <div>
                    <span>同频点</span>
                    <p>{relationshipReport.shared}</p>
                  </div>
                  <div>
                    <span>易卡点</span>
                    <p>{relationshipReport.watchOut}</p>
                  </div>
                  <div>
                    <span>相处动作</span>
                    <p>{relationshipReport.suggestion}</p>
                  </div>
                </div>
              </article>
            </div>

              <div className="combo-library">
                <div className="combo-library-head">
                  <div>
                    <p className="eyebrow accent">关系组合库</p>
                    <h3>和这些草原意象试着对照一下</h3>
                  </div>
                  <p>不是配对结论，更像一组相处实验入口。</p>
                </div>

                <div className="combo-grid">
                  {relationshipCombos.map((combo) => (
                    <article key={combo.id} className="combo-card">
                      <span>{combo.label}</span>
                      <h4>{combo.partner.name}</h4>
                      <p>{combo.description}</p>
                      <strong>距离 {combo.report.distance}</strong>
                      <small>{combo.report.suggestion}</small>
                    </article>
                  ))}
                </div>
              </div>
            </div>

            <div className="result-tab-content" hidden={activeResultTab !== "atlas"}>
            <details className="atlas-panel">
              <summary>
                <span>
                  <em className="eyebrow accent">草原图鉴</em>
                  <strong>20 种原创意象</strong>
                </span>
                <small aria-hidden="true" />
              </summary>
              <div className="atlas-grid">
                {atlasEntries.map((entry) => (
                  <article key={entry.id} className={`atlas-card ${entry.toneClass}`} data-current={entry.isCurrent}>
                    <div className="atlas-card-head">
                      <h4>{entry.name}</h4>
                      {entry.isCurrent && <span>当前结果</span>}
                    </div>
                    <p>{entry.motifLabel}</p>
                    <div className="atlas-keywords">
                      {entry.keywords.slice(0, 3).map((keyword) => (
                        <span key={keyword}>{keyword}</span>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="quiet-button atlas-save-button"
                      disabled={atlasImageStatus === "saving"}
                      onClick={() => downloadAtlasCardImage(entry.id)}
                    >
                      {atlasImageStatus === "saving" && activeAtlasImageId === entry.id
                        ? "生成中"
                        : "保存图鉴卡"}
                    </button>
                  </article>
                ))}
              </div>
            </details>

              <p className="download-status" aria-live="polite">
                {atlasImageStatus === "saved" && "图鉴卡已开始下载。"}
                {atlasImageStatus === "error" && "PNG 生成受阻，已改为保存 SVG 图鉴卡。"}
              </p>

              <section className="universe-panel" aria-labelledby="universe-title">
                <div className="universe-head">
                  <div>
                    <p className="eyebrow accent">草原人格宇宙地图</p>
                    <h3 id="universe-title">20 种意象的相对位置</h3>
                  </div>
                  <p>横轴是社交能量，纵轴是行动方式；当前结果会被放大标记。</p>
                </div>

                <div className="universe-map">
                  <span className="map-axis x-axis" aria-hidden="true" />
                  <span className="map-axis y-axis" aria-hidden="true" />
                  <span className="map-label left">独处蓄电</span>
                  <span className="map-label right">群体发光</span>
                  <span className="map-label top">灵感冲刺</span>
                  <span className="map-label bottom">稳扎稳打</span>
                  {universePoints.map((point) => (
                    <button
                      key={point.id}
                      type="button"
                      className={`universe-point ${point.toneClass}`}
                      data-current={point.isCurrent}
                      style={
                        {
                          "--map-x": `${point.x}%`,
                          "--map-y": `${point.y}%`
                        } as CSSProperties
                      }
                      title={`${point.name}｜${point.quadrant}`}
                      onClick={() => downloadAtlasCardImage(point.id)}
                    >
                      <span>{point.name}</span>
                    </button>
                  ))}
                </div>
              </section>
            </div>

            <div className="result-tab-content" hidden={activeResultTab !== "archive"}>
            <div className="archive-panel">
              <div className="archive-panel-head">
                <div>
                  <p className="eyebrow accent">我的草原档案</p>
                  <h3>把这次风向存进本机</h3>
                  <p>档案只保存在当前浏览器，用来回看最近几次测试和五维变化。</p>
                </div>
                <div className="archive-actions">
                  <button
                    type="button"
                    className="meadow-button compact-action"
                    disabled={archiveStatus === "saved"}
                    onClick={saveCurrentResultToArchive}
                  >
                    {archiveStatus === "saved" ? "已保存" : "保存到草原档案"}
                  </button>
                  <button
                    type="button"
                    className="quiet-button compact-action"
                    disabled={archiveEntries.length === 0}
                    onClick={clearGrasslandArchive}
                  >
                    清空档案
                  </button>
                </div>
              </div>

              <p className="archive-status" aria-live="polite">
                {archiveStatus === "saved" && "已保存到本机草原档案。"}
                {archiveStatus === "cleared" && "本机草原档案已清空。"}
                {archiveStatus === "error" && "本机存储暂时不可用，结果仍可复制或保存图片。"}
              </p>

              {archiveEntries.length === 0 ? (
                <div className="archive-empty">
                  <strong>还没有保存过的草原风向</strong>
                  <p>保存后，你会在这里看到最近结果、人格变化和五维分数起伏。</p>
                </div>
              ) : (
                <div className="archive-list">
                  {archiveEntries.map((entry, index) => (
                    <ArchiveCard
                      key={entry.id}
                      entry={entry}
                      previousEntry={archiveEntries[index + 1]}
                    />
                  ))}
                </div>
              )}
            </div>

            </div>

            <div className="result-tab-content" hidden={activeResultTab !== "overview"}>
            <div className="similar-panel">
              <div className="similar-panel-head">
                <div>
                  <p className="eyebrow accent">相近草原意象</p>
                  <h3>你附近还亮着这些轮廓</h3>
                </div>
                <p>距离越小，说明五维风向越接近。</p>
              </div>

              <div className="similar-grid">
                {closestMatches.map((personality, index) => {
                  const profile = getPersonalityVisualProfile(personality.id);

                  return (
                    <article key={personality.id} className="similar-card">
                      <span className="similar-rank">#{index + 1}</span>
                      <div>
                        <h4>{personality.name}</h4>
                        <p>{profile.motifLabel}</p>
                      </div>
                      <strong>距离 {personality.distance}</strong>
                      <div className="similar-keywords">
                        {personality.keywords.slice(0, 3).map((keyword) => (
                          <span key={keyword}>{keyword}</span>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            </div>

            <div className="result-tab-content" hidden={activeResultTab !== "scores"}>
            <div className="score-panel">
              <div className="score-panel-head">
                <div>
                  <p className="eyebrow accent">五维风向</p>
                  <h3>分数落点</h3>
                </div>
                <p>-100 到 +100，越靠近一端代表倾向越明显。</p>
              </div>

              <div className="grid gap-4">
                {dimensionOrder.map((dimensionId) => {
                  const dimension = dimensions.find((item) => item.id === dimensionId);
                  const value = scores.normalized[dimensionId];
                  const markerPosition = getDimensionMarkerPosition(value);
                  const insight = dimensionInsights[dimensionId];

                  if (!dimension) {
                    return null;
                  }

                  return (
                    <div key={dimensionId} className="score-row">
                      <div className="score-row-head">
                        <div>
                          <p>{dimension.name}</p>
                          <span>{dimension.shortDescription}</span>
                        </div>
                        <strong>
                          {getDimensionPositionLabel(dimensionId, value)} {value > 0 ? `+${value}` : value}
                        </strong>
                      </div>
                      <div className="dimension-track">
                        <span className="dimension-marker" style={{ left: markerPosition }} />
                      </div>
                      <div className="score-labels">
                        <span>{dimension.negativeLabel}</span>
                        <span>{dimension.positiveLabel}</span>
                      </div>
                      <details className="dimension-insight">
                        <summary>怎么看这个分数</summary>
                        <p>{insight.description}</p>
                        <span>{insight.suggestion}</span>
                      </details>
                    </div>
                  );
                })}
              </div>
            </div>

            </div>

            <div className="result-tab-content" hidden={activeResultTab !== "share"}>
            <div className="share-panel">
              <div className="share-panel-head">
                <div>
                  <p className="eyebrow">可复制分享文案</p>
                  <p>也可以保存一张结果图，分享给朋友时记得说这只是娱乐自测。</p>
                </div>
                <div className="share-action-row">
                  <button
                    type="button"
                    className="meadow-button compact-action"
                    disabled={imageStatus === "saving"}
                    onClick={downloadShareCardImage}
                  >
                    {imageStatus === "saving" ? "生成中" : "保存结果图"}
                  </button>
                  <button
                    type="button"
                    className="quiet-button compact-action"
                    onClick={copyShareText}
                    aria-live="polite"
                  >
                    {copied ? "已复制" : "复制文案"}
                  </button>
                </div>
              </div>
              <div className="share-style-grid" role="group" aria-label="选择分享图风格">
                {shareCardStyles.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    className="share-style-card"
                    data-selected={selectedShareStyleId === style.id}
                    aria-pressed={selectedShareStyleId === style.id}
                    onClick={() => {
                      setSelectedShareStyleId(style.id);
                      setImageStatus("idle");
                    }}
                  >
                    <strong>{style.name}</strong>
                    <span>{style.description}</span>
                  </button>
                ))}
              </div>
              <p className="download-status" aria-live="polite">
                {imageStatus === "saved" && "结果图已开始下载。"}
                {imageStatus === "error" && "PNG 生成受阻，已改为保存 SVG 图片。"}
              </p>
              <textarea
                className="share-textarea"
                readOnly
                value={shareText}
              />
            </div>
            </div>

            <div className="result-actions">
              <p>
                本测试仅用于娱乐和轻量自我理解，不构成心理诊断或专业建议。
              </p>
              <button
                type="button"
                className="meadow-button secondary-action"
                onClick={retake}
              >
                重新测试
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function ResultBlock({ title, body }: { title: string; body: string }) {
  return (
    <article className="result-block">
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

function mergeGeneratedResult(
  personality: PersonalityType,
  generated: GeneratedPersonalityResult | null
): PersonalityType {
  if (!generated || generated.personalityId !== personality.id) {
    return personality;
  }

  return {
    ...personality,
    name: generated.personalityName || personality.name,
    keywords: generated.keywords.length > 0 ? generated.keywords : personality.keywords,
    summary: generated.summary || personality.summary,
    strength: generated.strength || personality.strength,
    blindSpot: generated.blindSpot || personality.blindSpot,
    relationshipTip: generated.relationshipTip || personality.relationshipTip,
    dailyAdvice: generated.dailyAdvice || personality.dailyAdvice
  };
}

function ArchiveCard({
  entry,
  previousEntry
}: {
  entry: ArchivedResult;
  previousEntry?: ArchivedResult;
}) {
  const delta = getArchiveDelta(entry, previousEntry);
  const strongestDelta = delta ? getStrongestArchiveDelta(delta) : null;

  return (
    <article className="archive-card">
      <div className="archive-card-head">
        <div>
          <h4>{entry.personalityName}</h4>
          <p>
            <time dateTime={entry.finishedAt}>{formatArchiveDate(entry.finishedAt)}</time>
            <span>{entry.modeName} · {entry.modeBadge}</span>
          </p>
        </div>
        <strong>{entry.answeredCount} 题</strong>
      </div>

      <div className="archive-keywords">
        {entry.keywords.slice(0, 3).map((keyword) => (
          <span key={keyword}>{keyword}</span>
        ))}
      </div>

      <div className="archive-score-grid">
        {dimensionOrder.map((dimensionId) => (
          <span key={dimensionId} className="archive-score-chip">
            <b>{dimensionId}</b>
            <strong>{formatSignedValue(entry.scores[dimensionId])}</strong>
            {delta && (
              <small data-direction={getDeltaDirection(delta.dimensionDeltas[dimensionId])}>
                {formatDeltaValue(delta.dimensionDeltas[dimensionId])}
              </small>
            )}
          </span>
        ))}
      </div>

      {delta && strongestDelta ? (
        <p className="archive-delta">
          与上次相比：
          {delta.personalityChanged
            ? `从「${delta.previousPersonalityName}」来到「${entry.personalityName}」`
            : "人格意象保持稳定"}
          ，变化最明显的是「{strongestDelta.name}」{formatDeltaValue(strongestDelta.value)}。
        </p>
      ) : (
        <p className="archive-delta muted">这是本机草原档案里的第一条记录。</p>
      )}
    </article>
  );
}

function getStrongestArchiveDelta(delta: ArchiveDelta): { name: string; value: number } | null {
  const strongest = dimensionOrder
    .map((dimensionId) => ({
      dimensionId,
      value: delta.dimensionDeltas[dimensionId]
    }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];

  if (!strongest) {
    return null;
  }

  const dimension = dimensions.find((item) => item.id === strongest.dimensionId);

  return {
    name: dimension?.name ?? strongest.dimensionId,
    value: strongest.value
  };
}

function formatArchiveDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatSignedValue(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function formatDeltaValue(value: number): string {
  if (value === 0) {
    return "0";
  }

  return value > 0 ? `+${value}` : `${value}`;
}

function getDeltaDirection(value: number): "up" | "down" | "flat" {
  if (value > 0) {
    return "up";
  }

  if (value < 0) {
    return "down";
  }

  return "flat";
}

function renderSvgToPng(svgUrl: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1440;

      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas is unavailable."));
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("PNG generation failed."));
      }, "image/png");
    };

    image.onerror = () => reject(new Error("Share card image failed to load."));
    image.src = svgUrl;
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
