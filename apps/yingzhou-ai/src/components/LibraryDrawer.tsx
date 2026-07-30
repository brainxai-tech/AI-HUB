import { useEffect } from "react";
import { ArrowUpRight, BookMarked, Trash2, X } from "lucide-react";
import { genreLabels, type SavedWork } from "../shared/contracts";

interface LibraryDrawerProps {
  open: boolean;
  works: SavedWork[];
  onClose: () => void;
  onLoad: (work: SavedWork) => void;
  onDelete: (id: string) => void;
}

export function LibraryDrawer({ open, works, onClose, onLoad, onDelete }: LibraryDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="library-drawer" role="dialog" aria-modal="true" aria-labelledby="library-title">
        <header>
          <div><p>本地作品集</p><h2 id="library-title">我的诗笺</h2></div>
          <button type="button" autoFocus aria-label="关闭作品集" onClick={onClose}><X size={19} /></button>
        </header>
        {!works.length ? (
          <div className="library-empty"><BookMarked size={28} /><p>还没有保存的诗。</p><span>选一稿继续炼字，再把成稿收入这里。</span></div>
        ) : (
          <div className="saved-list">
            {works.map((work) => (
              <article key={work.id}>
                <div className="saved-meta"><span>{genreLabels[work.input.genre]}</span><time>{new Date(work.updatedAt).toLocaleDateString("zh-CN")}</time></div>
                <h3>{work.title}</h3>
                <p>{work.lines.join(" · ")}</p>
                <div className="saved-actions">
                  <button type="button" onClick={() => onLoad(work)}>继续修改<ArrowUpRight size={14} /></button>
                  <button type="button" aria-label={`删除《${work.title}》`} onClick={() => onDelete(work.id)}><Trash2 size={14} /></button>
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="drawer-note">作品只保存在这台设备的浏览器中；清理浏览器数据后将无法恢复。</p>
      </aside>
    </div>
  );
}
