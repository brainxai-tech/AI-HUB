import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookCheck, CheckCircle2, CircleAlert, Download, Info, Lock, LoaderCircle, Redo2, RotateCcw, Save, Sparkles, Undo2, Unlock } from "lucide-react";
import { analyzePoem, countHanCharacters } from "../shared/analyzer";
import { buildLineSuggestions } from "../shared/demoGenerator";
import { createId, genreLabels, type CreationInput, type PoemDraft, type QualityCheck, type SavedWork } from "../shared/contracts";
import { createHistory, currentVersion, pushVersion, redoVersion, type PoemHistory, undoVersion } from "../state/history";
import { exportPoemCard } from "../exportCard";

interface WorkshopProps {
  draft: PoemDraft;
  input: CreationInput;
  onBack: () => void;
  onSave: (work: SavedWork) => void;
  onEdited: () => void;
  onExported: () => void;
}

export function Workshop({ draft, input, onBack, onSave, onEdited, onExported }: WorkshopProps) {
  const [history, setHistory] = useState<PoemHistory>(() => createHistory(draft.lines));
  const [lines, setLines] = useState(draft.lines);
  const [selectedLine, setSelectedLine] = useState(0);
  const [locked, setLocked] = useState<number[]>([]);
  const [tab, setTab] = useState<"rules" | "meaning">("rules");
  const [saved, setSaved] = useState(false);
  const [savedId, setSavedId] = useState(draft.id.startsWith("saved-") ? draft.id : "");
  const [author, setAuthor] = useState("无名");
  const [place, setPlace] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  useEffect(() => {
    setHistory(createHistory(draft.lines));
    setLines(draft.lines);
    setSelectedLine(0);
    setLocked([]);
    setSaved(false);
    setSavedId(draft.id.startsWith("saved-") ? draft.id : "");
    setExportMessage("");
  }, [draft.id, draft.lines]);

  const report = useMemo(() => analyzePoem(lines, input), [lines, input]);
  const suggestions = useMemo(
    () => buildLineSuggestions(lines[selectedLine], selectedLine, draft.style, input.genre === "acrostic"),
    [draft.style, input.genre, lines, selectedLine]
  );
  const expectedLength = input.genre === "five-quatrain" ? 5 : 7;

  const updateWorkingLine = (index: number, value: string) => {
    setSaved(false);
    onEdited();
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? value.slice(0, expectedLength) : line));
  };

  const commit = (nextLines = lines) => {
    const next = pushVersion(history, nextLines);
    setHistory(next);
    setLines(currentVersion(next));
  };

  const travel = (direction: "undo" | "redo") => {
    const next = direction === "undo" ? undoVersion(history) : redoVersion(history);
    setHistory(next);
    setLines(currentVersion(next));
    setSaved(false);
    onEdited();
  };

  const useSuggestion = (suggestion: string) => {
    if (locked.includes(selectedLine)) return;
    onEdited();
    const next = lines.map((line, index) => index === selectedLine ? suggestion : line);
    setLines(next);
    commit(next);
  };

  const saveWork = () => {
    commit(lines);
    const finalHistory = pushVersion(history, lines);
    const id = savedId || (draft.id.startsWith("saved-") ? draft.id : createId("saved"));
    onSave({
      id,
      title: draft.title,
      lines: [...lines],
      input,
      style: draft.style,
      updatedAt: new Date().toISOString(),
      versions: finalHistory.entries.map((entry) => [...entry])
    });
    setSavedId(id);
    setSaved(true);
  };

  const exportCard = async () => {
    setExporting(true);
    setExportMessage("");
    try {
      await exportPoemCard({ title: draft.title, lines, theme: input.theme, author, place });
      setExportMessage("诗笺已下载，画面含 AI 共创标识。");
      onExported();
    } catch (cause) {
      setExportMessage(cause instanceof Error ? cause.message : "诗笺导出失败。");
    } finally {
      setExporting(false);
    }
  };

  const checks = [report.structure, report.rhyme, report.repetition, ...(report.acrostic ? [report.acrostic] : [])];

  return (
    <section className="workshop" aria-labelledby="workshop-title">
      <header className="workshop-header">
        <button type="button" className="back-button" onClick={onBack}><ArrowLeft size={16} />换一稿</button>
        <div><p>炼字台 · {genreLabels[input.genre]} · {draft.style}</p><h2 id="workshop-title">把这一稿，改成你的诗</h2></div>
        <div className="version-tools">
          <button type="button" aria-label="撤销" disabled={history.index === 0} onClick={() => travel("undo")}><Undo2 size={16} /></button>
          <span>{history.index + 1}/{history.entries.length}</span>
          <button type="button" aria-label="重做" disabled={history.index === history.entries.length - 1} onClick={() => travel("redo")}><Redo2 size={16} /></button>
        </div>
      </header>

      <div className="workshop-grid">
        <div className="editing-paper">
          <div className="poem-title-row"><span>{draft.style}</span><input aria-label="诗题" value={draft.title} readOnly /></div>
          <div className="editable-lines">
            {lines.map((line, index) => {
              const isLocked = locked.includes(index);
              const count = countHanCharacters(line);
              return (
                <div key={index} className={`editable-line${selectedLine === index ? " active" : ""}`}>
                  <span className="line-order">{["一", "二", "三", "四"][index]}</span>
                  <input
                    aria-label={`第${index + 1}句`}
                    value={line}
                    readOnly={isLocked}
                    onFocus={() => setSelectedLine(index)}
                    onChange={(event) => updateWorkingLine(index, event.target.value)}
                    onBlur={() => commit()}
                  />
                  <span className={count === expectedLength ? "char-count valid" : "char-count"}>{count}/{expectedLength}</span>
                  <button
                    type="button"
                    aria-label={isLocked ? `解锁第${index + 1}句` : `锁定第${index + 1}句`}
                    aria-pressed={isLocked}
                    onClick={() => setLocked((current) => isLocked ? current.filter((item) => item !== index) : [...current, index])}
                  >{isLocked ? <Lock size={14} /> : <Unlock size={14} />}</button>
                </div>
              );
            })}
          </div>

          <div className="rewrite-panel">
            <div><p>第{selectedLine + 1}句候选</p><span>{locked.includes(selectedLine) ? "此句已锁定" : "保持字数，换一种气息"}</span></div>
            <div className="suggestion-list">
              {suggestions.map((suggestion) => (
                <button key={suggestion} type="button" disabled={locked.includes(selectedLine) || suggestion === lines[selectedLine]} onClick={() => useSuggestion(suggestion)}>
                  {suggestion}<Sparkles size={13} />
                </button>
              ))}
            </div>
          </div>

          <div className="edit-actions">
            <button type="button" onClick={() => { setLines(draft.lines); setHistory(createHistory(draft.lines)); setSaved(false); onEdited(); }}><RotateCcw size={15} />恢复初稿</button>
            <div className="signature-fields">
              <label>落款<input value={author} maxLength={12} onChange={(event) => setAuthor(event.target.value)} /></label>
              <label>地点<input value={place} maxLength={14} placeholder="可不填" onChange={(event) => setPlace(event.target.value)} /></label>
            </div>
            <button type="button" className="save-work" onClick={saveWork}>{saved ? <CheckCircle2 size={16} /> : <Save size={16} />}{saved ? "已收入诗笺" : "保存作品"}</button>
            <button type="button" className="export-work" disabled={exporting} onClick={exportCard}>{exporting ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}{exporting ? "正在成笺" : "导出诗笺"}</button>
          </div>
          {exportMessage && <p className="export-message" role="status">{exportMessage}</p>}
        </div>

        <aside className="inspection-panel">
          <div className="inspection-score"><span>诗律镜</span><strong>{report.score}</strong><small>基础分</small></div>
          <div className="inspection-tabs" role="tablist" aria-label="诗稿查看方式">
            <button type="button" role="tab" aria-selected={tab === "rules"} onClick={() => setTab("rules")}>照律</button>
            <button type="button" role="tab" aria-selected={tab === "meaning"} onClick={() => setTab("meaning")}>明意</button>
          </div>
          {tab === "rules" ? (
            <div className="check-list">
              {checks.map((check) => <CheckRow key={check.label} check={check} />)}
              <p className="scope-note"><Info size={13} />{report.scopeNote}</p>
            </div>
          ) : (
            <div className="meaning-panel">
              <p>{draft.interpretation}</p>
              <h3>意象脉络</h3>
              <div className="imagery-cloud">{draft.imagery.map((item) => <span key={item}>{item}</span>)}</div>
              <h3>生成与来源</h3>
              {draft.sources.map((source) => <div className="source-note" key={source.label}><BookCheck size={14} /><span><b>{source.label}</b>{source.note}</span></div>)}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function CheckRow({ check }: { check: QualityCheck }) {
  const Icon = check.status === "pass" ? CheckCircle2 : check.status === "warn" ? CircleAlert : Info;
  return (
    <article className={`check-row ${check.status}`}>
      <Icon size={17} aria-hidden="true" />
      <div><span>{check.label}</span><strong>{check.summary}</strong><p>{check.detail}</p></div>
    </article>
  );
}
