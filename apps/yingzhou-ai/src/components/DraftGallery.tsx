import { ArrowRight, Feather, RefreshCcw } from "lucide-react";
import type { PoemDraft } from "../shared/contracts";

interface DraftGalleryProps {
  drafts: PoemDraft[];
  selectedId?: string;
  loading: boolean;
  error: string;
  disclosure: string;
  onSelect: (draft: PoemDraft) => void;
  onRetry: () => void;
}

export function DraftGallery({ drafts, selectedId, loading, error, disclosure, onSelect, onRetry }: DraftGalleryProps) {
  if (loading) {
    return (
      <section className="draft-space loading-state" aria-live="polite" aria-busy="true">
        <div className="ink-ripple" aria-hidden="true"><span /><span /><span /></div>
        <p className="vertical-caption">正在研墨起稿</p>
        <h2>从诗引里，寻三条不同的路。</h2>
        <p>先辨景与情，再照顾句式和韵脚。</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="draft-space empty-state" role="alert">
        <span className="empty-seal">未成</span>
        <p className="vertical-caption">起稿受阻</p>
        <h2>{error}</h2>
        <button type="button" className="text-button" onClick={onRetry}><RefreshCcw size={16} />重新起稿</button>
      </section>
    );
  }

  if (!drafts.length) {
    return (
      <section className="draft-space empty-state">
        <div className="ghost-poem" aria-hidden="true">
          <span>山</span><span>水</span><span>有</span><span>清</span><span>音</span>
        </div>
        <p className="vertical-caption">案上有素笺</p>
        <h2>一念落纸，三稿并陈。</h2>
        <p>左侧写下诗引。吟舟会给你清雅、雄浑、自然三种起稿，再由你选一首继续炼字。</p>
        <div className="empty-guide"><span>01 写下所感</span><span>02 比较三稿</span><span>03 亲手改成</span></div>
      </section>
    );
  }

  return (
    <section className="draft-results" aria-labelledby="drafts-title">
      <div className="results-heading">
        <div><p>三稿并陈</p><h2 id="drafts-title">先选一条诗路</h2></div>
        <span>每稿均已过基础句式检查</span>
      </div>
      <div className="draft-grid">
        {drafts.map((draft, index) => (
          <article key={draft.id} className={`draft-card${selectedId === draft.id ? " selected" : ""}`}>
            <div className="draft-card-top">
              <span className="draft-number">其{["一", "二", "三"][index]}</span>
              <span className="style-tag">{draft.style}</span>
              <span className="score"><b>{draft.report.score}</b> 基础分</span>
            </div>
            <h3>{draft.title}</h3>
            <div className="poem-lines">
              {draft.lines.map((line, lineIndex) => <p key={`${line}-${lineIndex}`}>{line}</p>)}
            </div>
            <p className="draft-note">{draft.interpretation}</p>
            <div className="imagery-row">{draft.imagery.slice(0, 3).map((item) => <span key={item}>{item}</span>)}</div>
            <button type="button" aria-pressed={selectedId === draft.id} onClick={() => onSelect(draft)}>
              <Feather size={16} aria-hidden="true" />{selectedId === draft.id ? "正在共创" : "选此稿炼字"}<ArrowRight size={15} aria-hidden="true" />
            </button>
          </article>
        ))}
      </div>
      <p className="disclosure">{disclosure}</p>
    </section>
  );
}
