export const genreOptions = ["five-quatrain", "seven-quatrain", "acrostic"] as const;
export const modeOptions = ["regulated", "free"] as const;
export const rhymeBookOptions = ["new-rhyme", "pingshui"] as const;
export const moodOptions = ["quiet", "bright", "heroic", "wistful"] as const;
export const styleOptions = ["清雅", "雄浑", "自然"] as const;

export type Genre = (typeof genreOptions)[number];
export type CreationMode = (typeof modeOptions)[number];
export type RhymeBook = (typeof rhymeBookOptions)[number];
export type Mood = (typeof moodOptions)[number];
export type PoemStyle = (typeof styleOptions)[number];

export const genreLabels: Record<Genre, string> = {
  "five-quatrain": "五言绝句",
  "seven-quatrain": "七言绝句",
  acrostic: "七言藏头"
};

export const moodLabels: Record<Mood, string> = {
  quiet: "清寂",
  bright: "明朗",
  heroic: "壮阔",
  wistful: "含思"
};

export interface CreationInput {
  theme: string;
  genre: Genre;
  mode: CreationMode;
  rhymeBook: RhymeBook;
  mood: Mood;
  acrostic: string;
}

export type CheckStatus = "pass" | "warn" | "info";

export interface QualityCheck {
  label: string;
  status: CheckStatus;
  summary: string;
  detail: string;
}

export interface QualityReport {
  score: number;
  structure: QualityCheck;
  rhyme: QualityCheck;
  repetition: QualityCheck;
  acrostic?: QualityCheck;
  rhymeWords: string[];
  repeatedCharacters: string[];
  scopeNote: string;
}

export interface SourceNote {
  label: string;
  note: string;
  source?: string;
}

export interface PoemDraft {
  id: string;
  title: string;
  style: PoemStyle;
  lines: string[];
  interpretation: string;
  imagery: string[];
  sources: SourceNote[];
  report: QualityReport;
}

export interface GeneratePoemsRequest {
  input: CreationInput;
}

export interface GeneratePoemsResult {
  drafts: PoemDraft[];
  disclosure: string;
}

export interface ApiMeta {
  provider: "openai";
  model: string;
  mode: "model";
  generatedAt: string;
}

export interface ApiResponse<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface SavedWork {
  id: string;
  title: string;
  lines: string[];
  input: CreationInput;
  style: PoemStyle;
  updatedAt: string;
  versions: string[][];
}

export function isGenre(value: unknown): value is Genre {
  return typeof value === "string" && genreOptions.includes(value as Genre);
}

export function isMood(value: unknown): value is Mood {
  return typeof value === "string" && moodOptions.includes(value as Mood);
}

export function isMode(value: unknown): value is CreationMode {
  return typeof value === "string" && modeOptions.includes(value as CreationMode);
}

export function isRhymeBook(value: unknown): value is RhymeBook {
  return typeof value === "string" && rhymeBookOptions.includes(value as RhymeBook);
}

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-5)}`;
}
