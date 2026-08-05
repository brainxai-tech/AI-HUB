import { useState } from "react";
import { BookOpenText, Library } from "lucide-react";
import { requestPoems } from "./api";
import { ComposerPanel } from "./components/ComposerPanel";
import { DraftGallery } from "./components/DraftGallery";
import { PoetryPulse } from "./components/PoetryPulse";
import { Workshop } from "./components/Workshop";
import { LibraryDrawer } from "./components/LibraryDrawer";
import { analyzePoem } from "./shared/analyzer";
import type { CreationInput, PoemDraft, SavedWork } from "./shared/contracts";
import { loadSavedWorks, removeSavedWork, upsertSavedWork } from "./state/storage";

const initialInput: CreationInput = {
  theme: "",
  genre: "five-quatrain",
  mode: "regulated",
  rhymeBook: "new-rhyme",
  mood: "quiet",
  acrostic: ""
};

export function App() {
  const [input, setInput] = useState(initialInput);
  const [drafts, setDrafts] = useState<PoemDraft[]>([]);
  const [selected, setSelected] = useState<PoemDraft>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [disclosure, setDisclosure] = useState("");
  const [works, setWorks] = useState<SavedWork[]>(() => loadSavedWorks());
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [exported, setExported] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError("");
    setSelected(undefined);
    setExported(false);
    try {
      const result = await requestPoems({ input });
      setDrafts(result.data.drafts);
      setDisclosure(result.data.disclosure);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "生成失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  const activeStage = loading ? 1 : exported ? 4 : selected ? 3 : drafts.length ? 2 : 0;

  const saveWork = (work: SavedWork) => setWorks(upsertSavedWork(work));
  const loadWork = (work: SavedWork) => {
    setInput(work.input);
    setSelected({
      id: work.id,
      title: work.title,
      style: work.style,
      lines: work.lines,
      interpretation: "这是你保存过的共创诗稿。可以继续逐句修改，诗律镜会随内容更新。",
      imagery: [],
      sources: [{ label: "作品记录", note: "该版本来自当前设备的本地作品集。" }],
      report: analyzePoem(work.lines, work.input)
    });
    setExported(false);
    setLibraryOpen(false);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="吟舟 AI 首页">
          <span className="brand-mark" aria-hidden="true">吟</span>
          <span><b>吟舟 AI</b><small>古典诗词共创工作台</small></span>
        </a>
        <div className="topbar-actions">
          <button type="button" title="查看当前诗律" onClick={() => {
            const target = document.querySelector<HTMLElement>(".inspection-panel");
            if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
            else document.querySelector<HTMLTextAreaElement>("#theme")?.focus();
          }}><BookOpenText size={16} />格律说明</button>
          <button type="button" onClick={() => setLibraryOpen(true)}><Library size={16} />我的诗笺{works.length ? ` · ${works.length}` : ""}</button>
        </div>
      </header>

      <div id="top" className="workspace">
        <ComposerPanel input={input} loading={loading} onInputChange={setInput} onGenerate={generate} />
        <div className="main-stage">
          {selected
            ? <Workshop draft={selected} input={input} onBack={() => { setSelected(undefined); setExported(false); }} onSave={saveWork} onEdited={() => setExported(false)} onExported={() => setExported(true)} />
            : <DraftGallery drafts={drafts} loading={loading} error={error} disclosure={disclosure} onSelect={(draft) => { setSelected(draft); setExported(false); }} onRetry={generate} />}
        </div>
        <PoetryPulse activeStage={activeStage} />
      </div>
      <LibraryDrawer open={libraryOpen} works={works} onClose={() => setLibraryOpen(false)} onLoad={loadWork} onDelete={(id) => setWorks(removeSavedWork(id))} />
      <footer><span>吟舟 AI · 共创草稿，不冒充古人原作</span><span>基础校验 v1 · 2026</span></footer>
    </main>
  );
}
