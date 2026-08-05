import { LoaderCircle, Sparkles } from "lucide-react";
import {
  genreLabels,
  moodLabels,
  type CreationInput,
  type Genre,
  type Mood
} from "../shared/contracts";

interface ComposerPanelProps {
  input: CreationInput;
  loading: boolean;
  onInputChange: (input: CreationInput) => void;
  onGenerate: () => void;
}

const suggestions = ["雨后江南，独自归舟", "登高望远，胸怀未酬", "月下思乡，灯火将眠", "写给故友的春日祝福"];
const genres = Object.entries(genreLabels) as Array<[Genre, string]>;
const moods = Object.entries(moodLabels) as Array<[Mood, string]>;
export function ComposerPanel({ input, loading, onInputChange, onGenerate }: ComposerPanelProps) {
  const update = <K extends keyof CreationInput>(key: K, value: CreationInput[K]) => onInputChange({ ...input, [key]: value });

  return (
    <section className="composer" aria-labelledby="composer-title">
      <div className="section-kicker"><span>诗引</span><span>从一念开始</span></div>
      <h2 id="composer-title">此刻，想写什么？</h2>
      <p className="section-intro">写下一处景、一段心绪，或一句想送给谁的话。</p>

      <label className="field-label" htmlFor="theme">诗引</label>
      <div className="theme-field">
        <textarea
          id="theme"
          value={input.theme}
          maxLength={160}
          placeholder="例如：小雨初停，我在西湖边想起旧友……"
          onChange={(event) => update("theme", event.target.value)}
        />
        <span>{Array.from(input.theme).length}/160</span>
      </div>
      <div className="prompt-suggestions" aria-label="诗引示例">
        {suggestions.map((suggestion) => (
          <button key={suggestion} type="button" onClick={() => update("theme", suggestion)}>{suggestion}</button>
        ))}
      </div>

      <fieldset className="choice-group">
        <legend>诗体</legend>
        <div className="segmented three">
          {genres.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={input.genre === value} onClick={() => update("genre", value)}>{label}</button>
          ))}
        </div>
      </fieldset>

      {input.genre === "acrostic" && (
        <label className="inline-field">
          <span>藏入四字</span>
          <input value={input.acrostic} maxLength={4} placeholder="吟舟春江" onChange={(event) => update("acrostic", event.target.value)} />
        </label>
      )}

      <div className="two-fields">
        <fieldset className="choice-group compact">
          <legend>取意</legend>
          <div className="mood-grid">
            {moods.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={input.mood === value} onClick={() => update("mood", value)}>{label}</button>
            ))}
          </div>
        </fieldset>
        <div className="select-stack">
          <label>规则
            <select value={input.mode} onChange={(event) => update("mode", event.target.value as CreationInput["mode"])}>
              <option value="regulated">合律模式</option>
              <option value="free">自在模式</option>
            </select>
          </label>
          <label>韵制
            <select value={input.rhymeBook} onChange={(event) => update("rhymeBook", event.target.value as CreationInput["rhymeBook"])}>
              <option value="new-rhyme">中华新韵</option>
              <option value="pingshui">平水韵</option>
            </select>
          </label>
        </div>
      </div>

      <button className="generate-button" type="button" disabled={loading || input.theme.trim().length < 2} onClick={onGenerate}>
        {loading ? <LoaderCircle className="spin" size={19} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
        {loading ? "正在起稿" : "请为我起三稿"}
      </button>
      <p className="fine-print">AI 生成内容仅作共创草稿，请继续核对、修改后使用。</p>
    </section>
  );
}
