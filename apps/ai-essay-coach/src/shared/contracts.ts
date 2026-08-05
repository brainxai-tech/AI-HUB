export const gradeOptions = ["初一", "初二", "初三", "高一", "高二", "高三"] as const;
export const genreOptions = ["记叙文", "议论文", "材料作文"] as const;
export type Grade = (typeof gradeOptions)[number];
export type Genre = (typeof genreOptions)[number];

export interface EssayInput {
  prompt: string;
  grade: Grade;
  genre: Genre;
  targetLength: number;
  includePunctuation: boolean;
  scene: "日常练习" | "课堂作业" | "考前训练";
}

export interface AnalysisResult {
  theme: string;
  task: string;
  requirements: string[];
  avoid: string[];
  angles: string[];
  questions: string[];
}

export interface MaterialAnswers {
  experience: string;
  detail: string;
  insight: string;
}

export interface OutlineSection {
  heading: string;
  purpose: string;
  targetLength: number;
}

export interface EssayOutline {
  id: string;
  style: "稳妥型" | "个性型" | "提分型";
  title: string;
  thesis: string;
  highlight: string;
  sections: OutlineSection[];
}

export interface OutlineResult {
  outlines: EssayOutline[];
}

export interface FeedbackDimension {
  name: "审题" | "立意" | "结构" | "内容" | "语言";
  score: number;
  max: number;
  comment: string;
  evidence: string;
}

export interface EssayFeedback {
  totalScore: number;
  dimensions: FeedbackDimension[];
  strengths: string[];
  priority: string;
  nextExercise: string;
}

export interface EssayAnnotation {
  quote: string;
  note: string;
  tone: "good" | "revise";
}

export interface EssayResult {
  title: string;
  essay: string;
  characterCount: number;
  annotations: EssayAnnotation[];
  feedback: EssayFeedback;
  safetyNote: string;
}

export interface AnalyzeRequest {
  input: EssayInput;
}

export interface OutlineRequest {
  input: EssayInput;
  analysis: AnalysisResult;
  materials: MaterialAnswers;
}

export interface ComposeRequest {
  input: EssayInput;
  materials: MaterialAnswers;
  outline: EssayOutline;
}

export interface ApiResponse<T> {
  data: T;
  meta: {
    provider: "openai";
    model: string;
    mode: "model";
    generatedAt: string;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function isGrade(value: unknown): value is Grade {
  return typeof value === "string" && gradeOptions.includes(value as Grade);
}

export function isGenre(value: unknown): value is Genre {
  return typeof value === "string" && genreOptions.includes(value as Genre);
}

export function countEssayLength(text: string, includePunctuation = true) {
  return Array.from(text.normalize("NFC")).filter((character) => {
    if (/\s/u.test(character)) return false;
    if (includePunctuation) return true;
    return /[\p{L}\p{N}]/u.test(character);
  }).length;
}

export function trimEssayToLength(text: string, maxLength: number, includePunctuation = true) {
  let count = 0;
  let output = "";

  for (const character of Array.from(text.normalize("NFC"))) {
    const counts = !/\s/u.test(character) && (includePunctuation || /[\p{L}\p{N}]/u.test(character));
    if (counts && count >= maxLength) break;
    output += character;
    if (counts) count += 1;
  }

  let cleaned = output.trim().replace(/[，、；：]$/u, "。");
  if (cleaned && !/[。！？…」”]$/u.test(cleaned)) {
    if (includePunctuation && count >= maxLength) {
      const characters = Array.from(cleaned);
      characters[characters.length - 1] = "。";
      cleaned = characters.join("");
    } else {
      cleaned = `${cleaned}。`;
    }
  }
  return cleaned;
}

export function fitEssayLength(
  essay: string,
  targetLength: number,
  includePunctuation: boolean,
  expansionParagraphs: string[] = []
) {
  const minimum = Math.ceil(targetLength * 0.95);
  const maximum = Math.floor(targetLength * 1.05);
  let next = essay.trim();

  for (const paragraph of expansionParagraphs) {
    if (countEssayLength(next, includePunctuation) >= minimum) break;
    next = `${next}\n\n${paragraph.trim()}`;
  }

  if (countEssayLength(next, includePunctuation) > maximum) {
    next = trimEssayToLength(next, targetLength, includePunctuation);
  }

  return next;
}

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-5)}`;
}
