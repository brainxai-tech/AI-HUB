import { cleanPoemLine } from "../src/shared/analyzer.js";
import {
  isGenre,
  isMode,
  isMood,
  isRhymeBook,
  type CreationInput,
  type GeneratePoemsRequest
} from "../src/shared/contracts.js";

export type ParseError = { ok: false; status: number; code: string; message: string };

const unsafeTheme = /(制造|制作).{0,4}(炸弹|毒品)|恐怖袭击|教我自杀|儿童色情|仇恨清洗/u;

export function parseGenerateRequest(body: unknown): { ok: true; value: GeneratePoemsRequest } | ParseError {
  if (!body || typeof body !== "object") return invalid("请求内容不能为空。");
  const value = body as Partial<GeneratePoemsRequest>;
  if (!value.input || typeof value.input !== "object") return invalid("缺少创作设定。");

  const input = value.input as Partial<CreationInput>;
  const theme = typeof input.theme === "string" ? input.theme.replace(/\s+/gu, " ").trim() : "";
  if (Array.from(theme).length < 2) return invalid("诗引至少输入 2 个字。");
  if (Array.from(theme).length > 160) return invalid("诗引过长，请控制在 160 字以内。");
  if (unsafeTheme.test(theme)) return { ok: false, status: 422, code: "UNSAFE_THEME", message: "这个主题不能用于生成，请换一个安全的创作方向。" };
  if (!isGenre(input.genre)) return invalid("请选择有效的诗体。");
  if (!isMode(input.mode)) return invalid("请选择合律或自在模式。");
  if (!isRhymeBook(input.rhymeBook)) return invalid("请选择有效的韵制。");
  if (!isMood(input.mood)) return invalid("请选择有效的情绪方向。");

  const acrostic = typeof input.acrostic === "string" ? cleanPoemLine(input.acrostic) : "";
  if (input.genre === "acrostic" && Array.from(acrostic).length !== 4) {
    return invalid("藏头诗需要恰好输入四个汉字。");
  }

  return {
    ok: true,
    value: {
      input: {
        theme,
        genre: input.genre,
        mode: input.mode,
        rhymeBook: input.rhymeBook,
        mood: input.mood,
        acrostic
      }
    }
  };
}

function invalid(message: string): ParseError {
  return { ok: false, status: 422, code: "VALIDATION_ERROR", message };
}
