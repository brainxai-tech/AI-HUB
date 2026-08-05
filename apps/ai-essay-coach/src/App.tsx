import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Download,
  FilePenLine,
  History,
  Lightbulb,
  LoaderCircle,
  MessageSquareQuote,
  PenLine,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  WandSparkles,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  countEssayLength,
  createId,
  fitEssayLength,
  genreOptions,
  gradeOptions,
  type AnalysisResult,
  type ApiError,
  type ApiResponse,
  type EssayInput,
  type EssayOutline,
  type EssayResult,
  type MaterialAnswers,
  type OutlineResult
} from "./shared/contracts";

type Step = 0 | 1 | 2 | 3 | 4;

interface SavedWork {
  id: string;
  createdAt: string;
  updatedAt: string;
  input: EssayInput;
  materials: MaterialAnswers;
  outline: EssayOutline;
  result: EssayResult;
}

const HISTORY_STORAGE_KEY = "eight-hundred-ai:history-v1";

const defaultInput: EssayInput = {
  prompt: "",
  grade: "初二",
  genre: "记叙文",
  targetLength: 800,
  includePunctuation: true,
  scene: "日常练习"
};

const defaultMaterials: MaterialAnswers = {
  experience: "",
  detail: "",
  insight: ""
};

const examplePrompt = "请以“藏在小事里的成长”为题，写一篇不少于800字的记叙文。要求结合个人经历，写出真情实感。";

const stepLabels = [
  { short: "题", title: "输入题目", note: "把任务说清楚" },
  { short: "材", title: "真实素材", note: "先找到你的话" },
  { short: "纲", title: "选择提纲", note: "决定文章走向" },
  { short: "稿", title: "编辑初稿", note: "写完还可以改" },
  { short: "评", title: "查看讲评", note: "带走一种方法" }
] as const;

const materialKeys: Array<keyof MaterialAnswers> = ["experience", "detail", "insight"];

function readHistory(): SavedWork[] {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || "[]") as SavedWork[];
    return Array.isArray(saved) ? saved.slice(0, 12) : [];
  } catch {
    return [];
  }
}

function apiPath(path: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/u, "");
  return `${base}/api${path}`;
}

async function postJson<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  const response = await fetch(apiPath(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json() as ApiResponse<T> | ApiError;
  if (!response.ok || "error" in payload) {
    throw new Error("error" in payload ? payload.error.message : "请求失败，请稍后重试。");
  }
  return payload;
}

export default function App() {
  const [step, setStep] = useState<Step>(0);
  const [furthestStep, setFurthestStep] = useState<Step>(0);
  const [input, setInput] = useState<EssayInput>(defaultInput);
  const [materials, setMaterials] = useState<MaterialAnswers>(defaultMaterials);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [outlines, setOutlines] = useState<EssayOutline[]>([]);
  const [selectedOutlineId, setSelectedOutlineId] = useState("");
  const [result, setResult] = useState<EssayResult | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftText, setDraftText] = useState("");
  const [history, setHistory] = useState<SavedWork[]>(readHistory);
  const [activeRecordId, setActiveRecordId] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const selectedOutline = useMemo(
    () => outlines.find((outline) => outline.id === selectedOutlineId) || null,
    [outlines, selectedOutlineId]
  );
  const draftCount = useMemo(
    () => countEssayLength(draftText, input.includePunctuation),
    [draftText, input.includePunctuation]
  );
  const targetStatus = draftCount < input.targetLength * 0.95
    ? "还可补充"
    : draftCount > input.targetLength * 1.05
      ? "需要精简"
      : "字数达标";

  useEffect(() => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function requestBody() {
    return { input };
  }

  async function handleAnalyze() {
    if (input.prompt.trim().length < 5) {
      setError("请先把作文题目写完整，至少输入 5 个字。");
      return;
    }
    setError("");
    setLoading("正在拆开题目，寻找真正的写作任务…");
    try {
      const response = await postJson<AnalysisResult>("/analyze", requestBody());
      setAnalysis(response.data);
      setStep(1);
      setFurthestStep((current) => Math.max(current, 1) as Step);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "审题失败，请稍后重试。";
      setError(message);
    } finally {
      setLoading("");
    }
  }

  async function handleOutlines() {
    if (!analysis) return;
    const hasMaterial = Object.values(materials).some((value) => value.trim().length >= 4);
    if (!hasMaterial) {
      setError("至少写下一条真实素材。几个关键词也可以，AI 会帮你整理。");
      return;
    }
    setError("");
    setLoading("正在把你的素材整理成三条不同写作路线…");
    try {
      const response = await postJson<OutlineResult>("/outlines", {
        ...requestBody(),
        analysis,
        materials
      });
      setOutlines(response.data.outlines);
      setSelectedOutlineId(response.data.outlines[0]?.id || "");
      setStep(2);
      setFurthestStep((current) => Math.max(current, 2) as Step);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "生成提纲失败，请稍后重试。");
    } finally {
      setLoading("");
    }
  }

  async function handleCompose() {
    if (!selectedOutline) {
      setError("请先选择一套提纲。");
      return;
    }
    setError("");
    setLoading(`正在按“${selectedOutline.style}”提纲完成初稿，并校准字数…`);
    try {
      const response = await postJson<EssayResult>("/compose", {
        ...requestBody(),
        materials,
        outline: selectedOutline
      });
      setResult(response.data);
      setDraftTitle(response.data.title);
      setDraftText(response.data.essay);
      setStep(3);
      setFurthestStep(3);
      const recordId = createId("essay");
      setActiveRecordId(recordId);
      persistWork({
        id: recordId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        input,
        materials,
        outline: selectedOutline,
        result: response.data
      }, true);
      setToast("初稿已生成并保存到作品库");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "生成初稿失败，请稍后重试。");
    } finally {
      setLoading("");
    }
  }

  function persistWork(record: SavedWork, putFirst = false) {
    setHistory((current) => {
      const existing = current.find((item) => item.id === record.id);
      const nextRecord = existing ? { ...record, createdAt: existing.createdAt } : record;
      const withoutCurrent = current.filter((item) => item.id !== record.id);
      return (putFirst ? [nextRecord, ...withoutCurrent] : [nextRecord, ...withoutCurrent]).slice(0, 12);
    });
  }

  function saveCurrentWork() {
    if (!result || !selectedOutline) return;
    const id = activeRecordId || createId("essay");
    const updatedResult = {
      ...result,
      title: draftTitle,
      essay: draftText,
      characterCount: draftCount
    };
    persistWork({
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      input,
      materials,
      outline: selectedOutline,
      result: updatedResult
    });
    setActiveRecordId(id);
    setResult(updatedResult);
    setToast("已保存当前版本");
  }

  function restoreWork(work: SavedWork) {
    setInput(work.input);
    setMaterials(work.materials);
    setOutlines([work.outline]);
    setSelectedOutlineId(work.outline.id);
    setResult(work.result);
    setDraftTitle(work.result.title);
    setDraftText(work.result.essay);
    setActiveRecordId(work.id);
    setStep(3);
    setFurthestStep(4);
    setHistoryOpen(false);
    setError("");
    setToast("已恢复这篇作文");
  }

  function deleteWork(id: string) {
    setHistory((current) => current.filter((work) => work.id !== id));
    if (id === activeRecordId) setActiveRecordId("");
    setToast("已从本地作品库删除");
  }

  function startNew() {
    setStep(0);
    setFurthestStep(0);
    setInput(defaultInput);
    setMaterials(defaultMaterials);
    setAnalysis(null);
    setOutlines([]);
    setSelectedOutlineId("");
    setResult(null);
    setDraftTitle("");
    setDraftText("");
    setActiveRecordId("");
    setError("");
  }

  async function copyDraft() {
    const copyText = `${draftTitle}\n\n${draftText}`;
    try {
      await navigator.clipboard.writeText(copyText);
      setToast("已复制标题和正文");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = copyText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      setToast("已复制标题和正文");
    }
  }

  function exportDraft() {
    const feedback = result?.feedback;
    const markdown = [
      `# ${draftTitle}`,
      "",
      draftText,
      "",
      `> 字数：${draftCount} 字（${input.includePunctuation ? "含标点" : "不含标点"}）`,
      feedback ? "\n## AI 讲评\n" : "",
      feedback ? `总评：${feedback.totalScore}/100` : "",
      feedback ? `\n最重要的修改建议：${feedback.priority}` : "",
      "",
      "> 这是 AI 辅助生成的练习初稿，请核对事实并用自己的语言继续修改。"
    ].filter(Boolean).join("\n");
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${draftTitle || "八百字作文"}.md`;
    link.click();
    URL.revokeObjectURL(url);
    setToast("已导出 Markdown 文件");
  }

  function removeCliches() {
    const replacements: Array<[RegExp, string]> = [
      [/我开始明白[，,]?/gu, "我停下手里的动作。"],
      [/在我的人生道路上/gu, "在那之后"],
      [/时光荏苒，岁月如梭。?/gu, "时间向前走着。"],
      [/这件事让我受益匪浅。?/gu, "这件事改变了我下一次的选择。"]
    ];
    let next = draftText;
    for (const [pattern, replacement] of replacements) next = next.replace(pattern, replacement);
    if (next === draftText) {
      setToast("没有发现常见套话，保留当前版本");
      return;
    }
    setDraftText(next);
    setToast("已删改常见套话，请读一遍衔接");
  }

  function addOneDetail() {
    const detail = materials.detail.trim();
    if (!detail) {
      setToast("回到素材页补一个动作、声音或物件后再试");
      return;
    }
    const paragraphs = draftText.split(/\n\s*\n/u);
    const insertion = `我又注意到${detail.replace(/[。！？]$/u, "")}。这个细节很轻，却让我停了一下。`;
    const index = Math.min(2, paragraphs.length);
    paragraphs.splice(index, 0, insertion);
    setDraftText(paragraphs.join("\n\n"));
    setToast("已补入一处细节，你可以继续改成当时的真实样子");
  }

  function fitDraft() {
    const expansion = materials.detail.trim()
      ? `我重新看向${materials.detail.replace(/[。！？]$/u, "")}。先前被忽略的细节，此刻变得清楚起来，也让我的判断慢慢发生变化。`
      : "我把当时的动作重新想了一遍。真正改变我的不是一句响亮的话，而是那个具体时刻里，自己做出的下一步选择。";
    const next = fitEssayLength(draftText, input.targetLength, input.includePunctuation, [expansion, expansion]);
    setDraftText(next);
    setToast(`已重新校准到 ${countEssayLength(next, input.includePunctuation)} 字`);
  }

  function loadExample() {
    setInput((current) => ({ ...current, prompt: examplePrompt, grade: "初二", genre: "记叙文", targetLength: 800 }));
    setMaterials({
      experience: "一次放学后值日，我本来想随便擦两下课桌就走，后来重新把桌缝和纸屑认真清理干净。",
      detail: "窗边旧课桌上的粉笔印、洗抹布时落在水池边的水声",
      insight: "成长不是突然变得厉害，而是在没人提醒时也愿意把小事做好。"
    });
    setToast("示例题目和素材已放入，点击开始审题即可体验");
  }

  function navigateToStep(target: Step) {
    if (target <= furthestStep) {
      setStep(target);
      setError("");
    }
  }

  const coachNotes = [
    { title: "先读懂，再动笔", body: "完整题目比一句标题更重要。把材料、限制和老师要求一起贴进来。" },
    { title: "你的素材最值钱", body: "几个真实关键词，比一段漂亮但空泛的话更能写出个人感。" },
    { title: "提纲是取舍", body: "三套路线不是好坏之分。选择最能承载你真实素材的一套。" },
    { title: "初稿允许不完美", body: "先检查事实和中心，再删套话、补细节。不要一次修改所有问题。" },
    { title: "只带走一个方法", body: "分数只是参考。把最重要的建议练一次，比反复生成更有用。" }
  ];

  return (
    <div className="app-root">
      <header className="topbar">
        <button className="brand" type="button" onClick={startNew} aria-label="八百字 AI 首页">
          <span className="brand-grid" aria-hidden="true"><b>八</b><b>百</b><b>字</b></span>
          <span className="brand-copy"><strong>八百字 AI</strong><small>中文写作教练</small></span>
        </button>
        <div className="topbar-actions">
          <span className="mode-badge"><span className="mode-dot" />Hub GPT</span>
          <button className="icon-button labeled" type="button" onClick={() => setHistoryOpen(true)}>
            <History size={18} /><span>作品库</span>{history.length > 0 && <b>{history.length}</b>}
          </button>
        </div>
      </header>

      <main className="app-frame">
        <nav className="step-rail" aria-label="写作步骤">
          <p className="step-rail-label">写作进度</p>
          <ol>
            {stepLabels.map((item, index) => {
              const available = index <= furthestStep;
              const active = index === step;
              const completed = index < step || (index < furthestStep && !active);
              return (
                <li key={item.title} className={active ? "active" : completed ? "completed" : ""}>
                  <button type="button" disabled={!available} onClick={() => navigateToStep(index as Step)} aria-current={active ? "step" : undefined}>
                    <span className="step-glyph">{completed ? <Check size={16} /> : item.short}</span>
                    <span className="step-copy"><strong>{item.title}</strong><small>{item.note}</small></span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="rail-safety"><ShieldCheck size={17} /><span>默认私密<br />仅存本机</span></div>
        </nav>

        <section className="workspace" aria-live="polite">
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => setError("")} aria-label="关闭错误提示"><X size={17} /></button>
            </div>
          )}

          {step === 0 && (
            <section className="step-panel prompt-step">
              <div className="section-heading split-heading">
                <div>
                  <span className="eyebrow">写作任务</span>
                  <h1>把题目贴进来，<em>先别急着写。</em></h1>
                  <p>我们先拆清题意，再用你的真实素材搭一篇文章。</p>
                </div>
                <button className="text-button" type="button" onClick={loadExample}><Sparkles size={16} />使用示例题</button>
              </div>

              <label className="field prompt-field">
                <span>作文题目与要求</span>
                <textarea
                  value={input.prompt}
                  onChange={(event) => setInput({ ...input, prompt: event.target.value })}
                  placeholder="例如：请以“藏在小事里的成长”为题，写一篇不少于800字的记叙文……"
                  maxLength={2000}
                  autoFocus
                />
                <small>{input.prompt.length}/2000</small>
              </label>

              <div className="control-grid">
                <label className="field compact-field">
                  <span>年级</span>
                  <select value={input.grade} onChange={(event) => setInput({ ...input, grade: event.target.value as EssayInput["grade"] })}>
                    {gradeOptions.map((grade) => <option key={grade}>{grade}</option>)}
                  </select>
                </label>
                <label className="field compact-field">
                  <span>文体</span>
                  <select value={input.genre} onChange={(event) => setInput({ ...input, genre: event.target.value as EssayInput["genre"] })}>
                    {genreOptions.map((genre) => <option key={genre}>{genre}</option>)}
                  </select>
                </label>
                <label className="field compact-field">
                  <span>目标字数</span>
                  <div className="number-input"><input type="number" min="400" max="1500" step="50" value={input.targetLength} onChange={(event) => setInput({ ...input, targetLength: Number(event.target.value) })} /><i>字</i></div>
                </label>
                <label className="field compact-field">
                  <span>使用场景</span>
                  <select value={input.scene} onChange={(event) => setInput({ ...input, scene: event.target.value as EssayInput["scene"] })}>
                    <option>日常练习</option><option>课堂作业</option><option>考前训练</option>
                  </select>
                </label>
              </div>

              <div className="form-footer">
                <label className="check-field">
                  <input type="checkbox" checked={input.includePunctuation} onChange={(event) => setInput({ ...input, includePunctuation: event.target.checked })} />
                  <span><b>标点计入字数</b><small>与常见作文格纸口径一致</small></span>
                </label>
                <button className="primary-button" type="button" onClick={handleAnalyze}>先帮我审题<ArrowRight size={18} /></button>
              </div>
            </section>
          )}

          {step === 1 && analysis && (
            <section className="step-panel material-step">
              <BackButton onClick={() => setStep(0)} label="返回题目" />
              <div className="section-heading">
                <span className="eyebrow">审题结果 · {analysis.theme}</span>
                <h1>题目要你写的，<em>其实是这件事。</em></h1>
                <p>{analysis.task}</p>
              </div>

              <div className="analysis-board">
                <div className="analysis-main">
                  <span className="analysis-icon"><Lightbulb size={20} /></span>
                  <div><small>抓住这三点</small><ul>{analysis.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul></div>
                </div>
                <div className="avoid-card"><small>容易跑偏</small>{analysis.avoid.map((item) => <span key={item}>{item}</span>)}</div>
              </div>

              <div className="material-heading">
                <span className="question-mark">?</span>
                <div><h2>把这篇作文变成你的</h2><p>不用写完整句，真实的几个关键词就够了。</p></div>
              </div>
              <div className="material-fields">
                {analysis.questions.slice(0, 3).map((question, index) => {
                  const key = materialKeys[index];
                  return (
                    <label className="field material-field" key={question}>
                      <span><b>{index + 1}</b>{question}</span>
                      <textarea
                        data-material={key}
                        value={materials[key]}
                        onChange={(event) => setMaterials({ ...materials, [key]: event.target.value })}
                        placeholder={index === 0 ? "写下事情或观点…" : index === 1 ? "写下动作、声音、物件或事实…" : "写下你后来真正明白的事…"}
                        maxLength={index === 0 ? 2000 : 1000}
                      />
                    </label>
                  );
                })}
              </div>
              <div className="action-row"><span>所有素材只保存在当前浏览器。</span><button className="primary-button" type="button" onClick={handleOutlines}>生成三份提纲<ArrowRight size={18} /></button></div>
            </section>
          )}

          {step === 2 && (
            <section className="step-panel outline-step">
              <BackButton onClick={() => setStep(1)} label="返回素材" />
              <div className="section-heading split-heading">
                <div><span className="eyebrow">写作路线</span><h1>三种写法，选择<em>最像你的。</em></h1><p>选中后仍可在初稿里自由修改。</p></div>
                <span className="selection-count">已准备 {outlines.length} 套</span>
              </div>
              <div className="outline-grid">
                {outlines.map((outline, index) => {
                  const selected = outline.id === selectedOutlineId;
                  return (
                    <button
                      type="button"
                      className={`outline-card ${selected ? "selected" : ""}`}
                      key={`${outline.id}-${index}`}
                      onClick={() => setSelectedOutlineId(outline.id)}
                      aria-pressed={selected}
                    >
                      <span className="outline-top"><i>{outline.style}</i>{selected && <b><Check size={14} />已选择</b>}</span>
                      <h2>{outline.title}</h2>
                      <p className="outline-thesis">{outline.thesis}</p>
                      <ol>{outline.sections.map((section) => <li key={section.heading}><span>{section.heading}</span><small>{section.targetLength} 字</small></li>)}</ol>
                      <span className="outline-highlight"><Sparkles size={15} />{outline.highlight}</span>
                    </button>
                  );
                })}
              </div>
              <div className="action-row"><span>建议：优先选择能容纳最多真实细节的一套。</span><button className="primary-button" type="button" onClick={handleCompose}>按这份提纲写初稿<PenLine size={18} /></button></div>
            </section>
          )}

          {step === 3 && result && (
            <section className="step-panel draft-step">
              <div className="draft-topline">
                <BackButton onClick={() => setStep(2)} label="更换提纲" />
                <div className="draft-actions">
                  <button type="button" onClick={copyDraft}><ClipboardCopy size={16} />复制</button>
                  <button type="button" onClick={exportDraft}><Download size={16} />导出</button>
                  <button type="button" onClick={saveCurrentWork}><Save size={16} />保存</button>
                </div>
              </div>
              <div className="draft-heading">
                <div><span className="eyebrow">可编辑初稿</span><h1>先核对真实，再打磨表达。</h1></div>
                <div className={`count-chip ${targetStatus === "字数达标" ? "success" : ""}`}><b>{draftCount}</b><span>/ {input.targetLength} 字<br /><small>{targetStatus}</small></span></div>
              </div>
              <div className="editor-shell">
                <div className="red-margin" aria-hidden="true"><span>练</span><span>习</span><span>初</span><span>稿</span></div>
                <label className="editor-title"><span className="sr-only">作文标题</span><input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} /></label>
                <label className="editor-body"><span className="sr-only">作文正文</span><textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} spellCheck="false" /></label>
              </div>
              <div className="revision-bar">
                <span><WandSparkles size={17} />快速修改</span>
                <button type="button" onClick={addOneDetail}>补一处真实细节</button>
                <button type="button" onClick={removeCliches}>删掉常见套话</button>
                <button type="button" onClick={fitDraft}>调整到 {input.targetLength} 字</button>
              </div>
              <div className="safety-note"><ShieldCheck size={17} /><span>{result.safetyNote}</span></div>
              <div className="action-row"><span>讲评会引用正文证据，不等同于真实考试分数。</span><button className="primary-button" type="button" onClick={() => { setStep(4); setFurthestStep(4); }}>查看老师讲评<MessageSquareQuote size={18} /></button></div>
            </section>
          )}

          {step === 4 && result && (
            <section className="step-panel feedback-step">
              <BackButton onClick={() => setStep(3)} label="返回修改初稿" />
              <div className="feedback-hero">
                <div><span className="eyebrow">本次讲评</span><h1>这篇文章已经站住了，<em>下一步只改一件事。</em></h1></div>
                <div className="score-seal"><strong>{result.feedback.totalScore}</strong><span>/ 100<br />练习参考</span></div>
              </div>
              <div className="feedback-layout">
                <div className="dimension-list">
                  {result.feedback.dimensions.map((dimension) => (
                    <article key={dimension.name}>
                      <div className="dimension-top"><h2>{dimension.name}</h2><b>{dimension.score}<small>/{dimension.max}</small></b></div>
                      <div className="score-track"><span style={{ width: `${dimension.score / dimension.max * 100}%` }} /></div>
                      <p>{dimension.comment}</p><blockquote>“{dimension.evidence}”</blockquote>
                    </article>
                  ))}
                </div>
                <aside className="teacher-note">
                  <span className="teacher-label">老师的朱批</span>
                  <div className="strengths"><h2>值得保留</h2>{result.feedback.strengths.map((strength) => <p key={strength}><CheckCircle2 size={17} />{strength}</p>)}</div>
                  <div className="priority-note"><span>最先改这里</span><p>{result.feedback.priority}</p></div>
                  <div className="exercise-note"><span>5 分钟微练习</span><p>{result.feedback.nextExercise}</p></div>
                </aside>
              </div>
              <div className="action-row"><button className="secondary-button" type="button" onClick={startNew}><RotateCcw size={17} />开始新作文</button><button className="primary-button" type="button" onClick={() => setStep(3)}>按建议继续修改<FilePenLine size={18} /></button></div>
            </section>
          )}

          {loading && <LoadingOverlay message={loading} />}
        </section>

        <aside className="coach-rail">
          <div className="coach-card">
            <span className="coach-kicker"><MessageSquareQuote size={16} />写作教练</span>
            <h2>{coachNotes[step].title}</h2>
            <p>{coachNotes[step].body}</p>
          </div>
          <CharacterGrid count={draftText ? draftCount : Math.round(step / 4 * input.targetLength)} target={input.targetLength} />
          <div className="privacy-card"><ShieldCheck size={19} /><div><strong>你的作品默认私密</strong><p>模型由 AI Hub 统一配置；作品只保存在当前浏览器。</p></div></div>
        </aside>
      </main>

      {historyOpen && <HistoryDrawer history={history} onClose={() => setHistoryOpen(false)} onRestore={restoreWork} onDelete={deleteWork} />}
      {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}</div>}
    </div>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return <button className="back-button" type="button" onClick={onClick}><ArrowLeft size={16} />{label}</button>;
}

function LoadingOverlay({ message }: { message: string }) {
  return (
    <div className="loading-overlay" role="status">
      <div className="loading-sheet"><span className="loading-mark"><LoaderCircle size={24} /></span><div><strong>{message}</strong><p>写作教练正在检查题意、事实与表达。</p></div></div>
    </div>
  );
}

function CharacterGrid({ count, target }: { count: number; target: number }) {
  const cells = 80;
  const filled = Math.min(cells, Math.round(count / Math.max(target, 1) * cells));
  return (
    <div className="character-grid-card">
      <div className="grid-header"><span>字数微格</span><b>{Math.min(100, Math.round(count / Math.max(target, 1) * 100))}%</b></div>
      <div className="micro-grid" aria-label={`已完成目标字数的 ${Math.min(100, Math.round(count / Math.max(target, 1) * 100))}%`}>
        {Array.from({ length: cells }, (_, index) => <i className={index < filled ? "filled" : ""} key={index} />)}
      </div>
      <p>每一格代表约 {Math.max(1, Math.round(target / cells))} 字，红线是完成目标。</p>
    </div>
  );
}

function HistoryDrawer({ history, onClose, onRestore, onDelete }: { history: SavedWork[]; onClose: () => void; onRestore: (work: SavedWork) => void; onDelete: (id: string) => void }) {
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="drawer history-drawer" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <div className="drawer-header"><div><span className="eyebrow">当前浏览器</span><h2 id="history-title">我的作品</h2></div><button type="button" onClick={onClose} aria-label="关闭作品库"><X /></button></div>
        {history.length === 0 ? (
          <div className="empty-history"><BookOpenText size={32} /><h3>还没有保存的作文</h3><p>完成第一篇初稿后，它会自动出现在这里。</p></div>
        ) : (
          <div className="history-list">
            {history.map((work) => (
              <article key={work.id}>
                <button className="history-main" type="button" onClick={() => onRestore(work)}>
                  <span className="history-icon"><FilePenLine size={18} /></span>
                  <span><strong>{work.result.title}</strong><small>{new Date(work.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {work.result.characterCount} 字 · {work.input.genre}</small></span>
                  <ArrowRight size={17} />
                </button>
                <button className="delete-button" type="button" onClick={() => onDelete(work.id)} aria-label={`删除${work.result.title}`}><Trash2 size={16} /></button>
              </article>
            ))}
          </div>
        )}
        <div className="drawer-note"><ShieldCheck size={18} /><p><strong>默认不上传作品库</strong>清除浏览器数据会同时清除这里的作品，请及时导出重要版本。</p></div>
      </aside>
    </div>
  );
}
