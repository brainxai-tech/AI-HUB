import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  ChevronRight,
  Compass,
  Copy,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
  Timer,
} from "lucide-react";
import { answerOptions, questions } from "./data/questions";
import { groupDescriptions, personalityProfiles } from "./data/results";
import { AiInterpretationPanel } from "./components/AiInterpretationPanel";
import { getFirstUnansweredIndex, scoreAnswers } from "./lib/scoring";
import { clearAnswers, loadAnswers, saveAnswers } from "./lib/storage";
import type { AnswerMap, AnswerValue, Dimension, ScoreResult } from "./types";

type View = "intro" | "quiz" | "result";
type ProgressStyle = CSSProperties & { "--progress": string };

const dimensionCopy: Record<Dimension, { title: string; first: string; second: string }> = {
  EI: { title: "能量方向", first: "向外连接", second: "向内充电" },
  SN: { title: "信息方式", first: "具体事实", second: "整体可能" },
  TF: { title: "决策依据", first: "逻辑原则", second: "价值感受" },
  JP: { title: "行动节奏", first: "计划收束", second: "灵活探索" },
};

function App() {
  const [answers, setAnswers] = useState<AnswerMap>(() => loadAnswers());
  const [view, setView] = useState<View>("intro");
  const [currentIndex, setCurrentIndex] = useState(() => getFirstUnansweredIndex(loadAnswers()));
  const [transitioning, setTransitioning] = useState(false);
  const [toast, setToast] = useState("");

  const score = useMemo(() => scoreAnswers(answers), [answers]);
  const currentQuestion = questions[currentIndex];
  const progress = view === "quiz" ? ((currentIndex + 1) / questions.length) * 100 : 100;

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const moveToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const startFresh = () => {
    clearAnswers();
    setAnswers({});
    setCurrentIndex(0);
    setView("quiz");
    moveToTop();
  };

  const resume = () => {
    if (score.isComplete) {
      setView("result");
    } else {
      setCurrentIndex(getFirstUnansweredIndex(answers));
      setView("quiz");
    }
    moveToTop();
  };

  const chooseAnswer = (value: AnswerValue) => {
    if (transitioning) return;
    const nextAnswers = { ...answers, [currentQuestion.id]: value };
    setAnswers(nextAnswers);
    saveAnswers(nextAnswers);
    setTransitioning(true);

    window.setTimeout(() => {
      if (currentIndex === questions.length - 1) {
        setView("result");
        moveToTop();
      } else {
        setCurrentIndex((index) => index + 1);
      }
      setTransitioning(false);
    }, 240);
  };

  const goBack = () => {
    if (transitioning) return;
    if (currentIndex === 0) {
      setView("intro");
    } else {
      setCurrentIndex((index) => index - 1);
    }
  };

  const shareResult = async () => {
    const profile = personalityProfiles[score.type];
    const text = `我的人格罗盘是 ${score.type}「${profile.title}」：${profile.motto}\n来看看你的思维偏好。`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "人格罗盘 Persona", text, url: window.location.href });
        return;
      } catch (error) {
        if ((error as DOMException).name === "AbortError") return;
      }
    }
    await navigator.clipboard.writeText(`${text}\n${window.location.href}`);
    showToast("结果文案已复制");
  };

  const copyResult = async () => {
    const profile = personalityProfiles[score.type];
    const dimensions = (Object.keys(score.metrics) as Dimension[])
      .map((key) => {
        const metric = score.metrics[key];
        return `${metric.first} ${metric.firstPercent}% · ${metric.second} ${metric.secondPercent}%`;
      })
      .join("｜");
    await navigator.clipboard.writeText(
      `${score.type} · ${profile.title}\n${profile.summary}\n${dimensions}\n\n${profile.motto}`,
    );
    showToast("完整结果已复制");
  };

  return (
    <div className={`app-shell view-${view}`}>
      <Header compact={view === "quiz"} onHome={() => setView("intro")} />
      <main>
        {view === "intro" && <Intro score={score} onResume={resume} onFresh={startFresh} />}
        {view === "quiz" && (
          <Quiz
            question={currentQuestion}
            currentIndex={currentIndex}
            progress={progress}
            selected={answers[currentQuestion.id]}
            transitioning={transitioning}
            onChoose={chooseAnswer}
            onBack={goBack}
            onExit={() => setView("intro")}
          />
        )}
        {view === "result" && (
          <Result
            score={score}
            answers={answers}
            onToast={showToast}
            onShare={shareResult}
            onCopy={copyResult}
            onRestart={startFresh}
          />
        )}
      </main>
      {view !== "quiz" && <Footer />}
      <div className={`toast ${toast ? "is-visible" : ""}`} role="status" aria-live="polite">
        <Check size={17} /> {toast}
      </div>
    </div>
  );
}

function Header({ compact, onHome }: { compact: boolean; onHome: () => void }) {
  return (
    <header className={`site-header ${compact ? "is-compact" : ""}`}>
      <button className="brand" type="button" onClick={onHome} aria-label="返回人格罗盘首页">
        <span className="brand-mark"><Compass size={22} strokeWidth={1.8} /></span>
        <span className="brand-name">人格罗盘</span>
        <span className="brand-en">PERSONA</span>
      </button>
      <div className="header-actions">
        {!compact && <span className="header-note">把偏好当作线索，而不是标签</span>}
        <span className="ai-settings-button" aria-label="使用 AI Hub 统一模型">
          <span className="ai-status-dot is-ready" />
          <Sparkles size={17} />
          <span>Hub GPT</span>
        </span>
      </div>
    </header>
  );
}

function Intro({ score, onResume, onFresh }: { score: ScoreResult; onResume: () => void; onFresh: () => void }) {
  const hasSaved = score.answeredCount > 0;
  const savedPercent = Math.round((score.answeredCount / questions.length) * 100);

  return (
    <section className="intro-page">
      <div className="intro-copy">
        <div className="eyebrow"><Sparkles size={15} /> 16 型人格倾向测试</div>
        <h1>别急着定义自己。<br /><span>先看看你如何选择。</span></h1>
        <p className="intro-lead">
          32 个真实情境，定位你的能量、信息、决策与行动偏好。没有标准答案，只有更接近此刻的你。
        </p>

        {hasSaved ? (
          <div className="resume-card">
            <div className="resume-topline">
              <span>{score.isComplete ? "上次结果已生成" : "发现未完成的测试"}</span>
              <strong>{score.isComplete ? score.type : `${score.answeredCount} / ${questions.length}`}</strong>
            </div>
            {!score.isComplete && (
              <div className="mini-progress" aria-label={`已完成 ${savedPercent}%`}>
                <span style={{ width: `${savedPercent}%` }} />
              </div>
            )}
            <button className="primary-button" type="button" onClick={onResume}>
              {score.isComplete ? "查看上次结果" : "继续上次测试"}<ArrowRight size={19} />
            </button>
            <button className="text-button" type="button" onClick={onFresh}>重新开始</button>
          </div>
        ) : (
          <button className="primary-button start-button" type="button" onClick={onFresh}>
            开始定位 <ArrowRight size={19} />
          </button>
        )}

        <div className="intro-facts" aria-label="测试说明">
          <span><Timer size={17} /> 约 5–7 分钟</span>
          <span><Brain size={17} /> 四维连续得分</span>
          <span><ShieldCheck size={17} /> 进度仅存本机</span>
        </div>
      </div>

      <div className="intro-visual" aria-hidden="true">
        <div className="coordinate-note north-note">向内充电</div>
        <div className="coordinate-note east-note">看见可能</div>
        <div className="coordinate-note south-note">灵活探索</div>
        <div className="coordinate-note west-note">依据价值</div>
        <PersonaCompass progress={0} />
        <div className="visual-caption">
          <span>你的坐标不止四个字母</span>
          <span>它是一组会变化的倾向</span>
        </div>
      </div>
    </section>
  );
}

interface QuizProps {
  question: (typeof questions)[number];
  currentIndex: number;
  progress: number;
  selected: AnswerValue | undefined;
  transitioning: boolean;
  onChoose: (value: AnswerValue) => void;
  onBack: () => void;
  onExit: () => void;
}

function Quiz({ question, currentIndex, progress, selected, transitioning, onChoose, onBack, onExit }: QuizProps) {
  return (
    <section className="quiz-page">
      <div className="quiz-progress-row">
        <button className="icon-button" type="button" onClick={onBack} aria-label="上一题">
          <ArrowLeft size={21} />
        </button>
        <div className="progress-track" aria-label={`测试进度 ${Math.round(progress)}%`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <button className="save-exit" type="button" onClick={onExit}>保存退出</button>
      </div>

      <div className="quiz-layout">
        <aside className="quiz-index" aria-hidden="true">
          <PersonaCompass progress={progress} compact />
          <div className="question-count">
            <strong>{String(currentIndex + 1).padStart(2, "0")}</strong>
            <span>/ {questions.length}</span>
          </div>
        </aside>

        <div className={`question-card ${transitioning ? "is-leaving" : ""}`}>
          <p className="question-scene">想象这个场景 · {question.scene}</p>
          <h2>{question.statement}</h2>
          <p className="question-hint">这句话有多像最近 6 个月里的你？</p>
          <div className="answer-scale">
            {answerOptions.map((option, index) => (
              <button
                className={`answer-option ${selected === option.value ? "is-selected" : ""}`}
                type="button"
                key={option.value}
                onClick={() => onChoose(option.value)}
                aria-pressed={selected === option.value}
                disabled={transitioning}
              >
                <span className="answer-key">{index + 1}</span>
                <span className="answer-dot" />
                <span className="answer-label">{option.label}</span>
                <ChevronRight size={18} className="answer-arrow" />
              </button>
            ))}
          </div>
          <p className="answer-footnote">凭第一直觉作答，通常比反复比较更接近真实偏好。</p>
        </div>
      </div>
    </section>
  );
}

function Result({ score, answers, onToast, onShare, onCopy, onRestart }: {
  score: ScoreResult;
  answers: AnswerMap;
  onToast: (message: string) => void;
  onShare: () => void;
  onCopy: () => void;
  onRestart: () => void;
}) {
  const profile = personalityProfiles[score.type] ?? personalityProfiles.ESTJ;

  return (
    <section className={`result-page group-${profile.group}`}>
      <div className="result-hero">
        <div className="result-compass-wrap">
          <PersonaCompass progress={100} type={score.type} />
          <span className="result-seal">本次坐标</span>
        </div>
        <div className="result-heading">
          <p className="result-kicker">你的 16 型人格倾向</p>
          <div className="type-line">
            <h1>{score.type}</h1>
            <span>{profile.group}</span>
          </div>
          <h2>{profile.title}</h2>
          <blockquote>“{profile.motto}”</blockquote>
          <p>{profile.summary}</p>
          <div className="result-actions">
            <button className="primary-button" type="button" onClick={onShare}><Share2 size={18} /> 分享结果</button>
            <button className="secondary-button" type="button" onClick={onCopy}><Copy size={18} /> 复制文字</button>
          </div>
        </div>
      </div>

      <AiInterpretationPanel
        answers={answers}
        score={score}
        onToast={onToast}
      />

      <div className="result-section dimensions-section">
        <div className="section-heading">
          <div><span className="section-index">A</span><p>你的四维坐标</p></div>
          <h2>倾向不是非黑即白，<br />百分比才是你的真实位置。</h2>
        </div>
        <div className="dimension-grid">
          {(Object.keys(score.metrics) as Dimension[]).map((key) => (
            <DimensionBar key={key} metric={score.metrics[key]} />
          ))}
        </div>
        {(Object.values(score.metrics).some((metric) => metric.confidence < 25)) && (
          <div className="low-confidence-note">
            <Sparkles size={17} />
            <span>有些维度很接近中线，说明你会随情境切换策略。这不是“不准确”，而是你的弹性。</span>
          </div>
        )}
      </div>

      <div className="result-section profile-section">
        <div className="section-heading compact-heading">
          <div><span className="section-index">B</span><p>使用说明</p></div>
          <h2>{groupDescriptions[profile.group]}</h2>
        </div>
        <div className="profile-grid">
          <article className="insight-card strengths-card">
            <p className="card-label">你的自然优势</p>
            <ul className="strength-tags">
              {profile.strengths.map((strength) => <li key={strength}>{strength}</li>)}
            </ul>
          </article>
          <article className="insight-card">
            <p className="card-label">工作中的你</p>
            <p>{profile.workStyle}</p>
          </article>
          <article className="insight-card">
            <p className="card-label">关系中的你</p>
            <p>{profile.relationshipStyle}</p>
          </article>
          <article className="insight-card watchout-card">
            <p className="card-label">容易忽略的盲点</p>
            <ul>{profile.watchouts.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
        </div>
      </div>

      <div className="result-section action-section">
        <div className="section-heading compact-heading">
          <div><span className="section-index">C</span><p>下一步</p></div>
          <h2>把画像变成三个小实验</h2>
        </div>
        <ol className="growth-list">
          {profile.growthActions.map((action, index) => (
            <li key={action}><span>{String(index + 1).padStart(2, "0")}</span><p>{action}</p></li>
          ))}
        </ol>
      </div>

      <div className="result-bottom">
        <div>
          <p>人格会随经历与环境变化。</p>
          <span>把这次结果当作一张此刻的地图，而不是终身判决。</span>
        </div>
        <button className="text-button restart-button" type="button" onClick={onRestart}>
          <RefreshCw size={17} /> 重新测试
        </button>
      </div>
    </section>
  );
}

function DimensionBar({ metric }: { metric: ScoreResult["metrics"][Dimension] }) {
  const copy = dimensionCopy[metric.dimension];
  return (
    <div className="dimension-card">
      <div className="dimension-title">
        <span>{copy.title}</span>
        <small>{metric.confidence < 25 ? "弹性区间" : "偏好清晰"}</small>
      </div>
      <div className="dimension-letters">
        <div className={metric.firstPercent >= metric.secondPercent ? "is-strong" : ""}>
          <strong>{metric.first}</strong><span>{copy.first}</span><b>{metric.firstPercent}%</b>
        </div>
        <div className={metric.secondPercent > metric.firstPercent ? "is-strong" : ""}>
          <strong>{metric.second}</strong><span>{copy.second}</span><b>{metric.secondPercent}%</b>
        </div>
      </div>
      <div className="dimension-track">
        <span style={{ width: `${metric.firstPercent}%` }} />
        <i />
      </div>
    </div>
  );
}

function PersonaCompass({ progress, type, compact = false }: { progress: number; type?: string; compact?: boolean }) {
  const letters = type?.split("") ?? ["I", "N", "F", "P"];
  const style = { "--progress": `${Math.round(progress * 3.6)}deg` } as ProgressStyle;
  return (
    <div className={`persona-compass ${compact ? "is-compact" : ""} ${type ? "has-result" : ""}`} style={style}>
      <div className="compass-ticks" />
      <div className="compass-cross horizontal" />
      <div className="compass-cross vertical" />
      <span className="compass-letter compass-n">{letters[0]}</span>
      <span className="compass-letter compass-e">{letters[1]}</span>
      <span className="compass-letter compass-s">{letters[2]}</span>
      <span className="compass-letter compass-w">{letters[3]}</span>
      <div className="compass-orbit">
        <span className="orbit-dot" />
      </div>
      <div className="compass-core">
        {type ? <span>{type}</span> : <><i /><i /><i /><i /></>}
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <span>人格罗盘 PERSONA · 2026</span>
      <p>本测试参考 MBTI 四维偏好模型，用于自我探索与娱乐，不构成专业心理评估或诊断。</p>
    </footer>
  );
}

export default App;
