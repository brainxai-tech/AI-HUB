import { z } from "zod";
import { getGameStatus, getLegalUciMoves } from "./xiangqi";
import type { XiangqiDifficulty } from "./xiangqi-engine";

export const ProviderSchema = z.enum(["deepseek", "openai", "anthropic", "gemini"]);
export const PlayerColorSchema = z.enum(["r", "b"]);
export const XiangqiDifficultySchema = z.enum([
  "beginner",
  "casual",
  "club",
  "master",
]);
export const MoveSourceSchema = z.preprocess(
  (value) =>
    value === "engine" || value === "pikafish" || value === "deepseek"
      ? "xiangqi-engine"
      : value,
  z.literal("xiangqi-engine"),
);

export type Provider = z.infer<typeof ProviderSchema>;
export type PlayerColor = z.infer<typeof PlayerColorSchema>;
export type MoveSource = z.infer<typeof MoveSourceSchema>;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const AiMoveRequestSchema = z.object({
  moveSource: MoveSourceSchema.default("xiangqi-engine"),
  provider: ProviderSchema.default("deepseek"),
  model: z.string().trim().min(1).max(100).default("deepseek-v4-flash"),
  explainWithDeepSeek: z.boolean().default(false),
  engineDifficulty: XiangqiDifficultySchema.default("casual"),
  fen: z.string().trim().min(1).max(260),
  moveHistory: z.array(z.string().trim().max(60)).max(400).default([]),
  playerColor: PlayerColorSchema,
});

export const XiangqiHintRequestSchema = z.object({
  fen: z.string().trim().min(1).max(260),
  moveHistory: z.array(z.string().trim().max(60)).max(400).default([]),
  playerColor: PlayerColorSchema,
  engineDifficulty: XiangqiDifficultySchema.default("master"),
});

export const PostGameMoveAnalysisRequestSchema = z.object({
  provider: ProviderSchema.default("deepseek"),
  model: z.string().trim().min(1).max(100).default("deepseek-v4-flash"),
  fenBefore: z.string().trim().min(1).max(260),
  moveHistoryBefore: z.array(z.string().trim().max(60)).max(400).default([]),
  selectedMoveUci: z.string().trim().min(4).max(4),
  selectedMoveDisplay: z.string().trim().min(1).max(80),
  selectedMoveBy: z.enum(["player", "engine"]),
  engineDifficulty: XiangqiDifficultySchema.default("master"),
});

export const ProviderTestRequestSchema = z.object({
  provider: ProviderSchema,
  model: z.string().trim().min(1).max(100).optional(),
});

const MoveRecordSchema = z.object({
  display: z.string().trim().min(1).max(80),
  uci: z.string().trim().min(4).max(4),
  by: z.enum(["player", "engine"]),
  fenAfter: z.string().trim().min(1).max(260),
  engineScore: z.number().optional(),
  engineDepth: z.number().optional(),
  enginePv: z.array(z.string().trim().max(8)).max(20).optional(),
});

export const GameReviewRequestSchema = z.object({
  provider: ProviderSchema.default("deepseek"),
  model: z.string().trim().min(1).max(100).default("deepseek-v4-flash"),
  playerColor: PlayerColorSchema,
  result: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(1).max(120),
  finalFen: z.string().trim().min(1).max(260),
  moveHistory: z.array(z.string().trim().max(60)).max(400).default([]),
  moveRecords: z.array(MoveRecordSchema).max(400).default([]),
});

export const XiangqiExplanationRequestSchema = z.object({
  provider: ProviderSchema.default("deepseek"),
  model: z.string().trim().min(1).max(100).default("deepseek-v4-flash"),
  fenBefore: z.string().trim().min(1).max(260),
  moveHistoryBefore: z.array(z.string().trim().max(60)).max(400).default([]),
  aiColor: PlayerColorSchema,
  moveUci: z.string().trim().min(4).max(4),
  displayMove: z.string().trim().min(1).max(80),
  score: z.number().optional(),
  depth: z.number().optional(),
  pv: z.array(z.string().trim().max(8)).max(20).optional(),
  engineReason: z.string().trim().min(1).max(360),
});

const XiangqiExplanationContentSchema = z.object({
  explanation: z.string().trim().min(1).max(1600),
});

const GameReviewContentSchema = z.object({
  review: z.string().trim().min(1).max(3600),
});

const XIANGQI_COACH_SYSTEM_PROMPT =
  "你是简洁、可靠的中文中国象棋教练，擅长解释车马炮兵、仕相、将帅安全、线路控制、牵制和攻防转换。";

export function buildXiangqiExplanationMessages(input: {
  fenBefore: string;
  moveHistoryBefore: string[];
  aiColor: PlayerColor;
  moveUci: string;
  displayMove: string;
  score?: number;
  depth?: number;
  pv?: string[];
  engineReason: string;
}): ChatMessage[] {
  const colorName = input.aiColor === "r" ? "红方" : "黑方";
  const scoreText =
    typeof input.score === "number" ? String(input.score) : "unknown";

  return [
    {
      role: "system",
      content: `${XIANGQI_COACH_SYSTEM_PROMPT} 只解释提供的引擎走法；不要选择、改变或替换走法。只能使用给定 FEN、历史、评分、深度和主变化；不要编造非法变招。Return compact JSON with one key: explanation.`,
    },
    {
      role: "user",
      content: [
        `AI side: ${colorName}`,
        `Position before move FEN: ${input.fenBefore}`,
        `Move history before move: ${input.moveHistoryBefore.join(" ") || "(none)"}`,
        `Engine move UCI: ${input.moveUci}`,
        `Engine move display: ${input.displayMove}`,
        `Engine evaluation: ${scoreText}`,
        `Engine search depth: ${input.depth ?? "unknown"}`,
        `Principal variation UCI: ${input.pv?.join(" ") || "(none)"}`,
        `Engine technical note: ${input.engineReason}`,
        "用 3-5 句中文说明这步棋的意图、攻击或防守了哪些车马炮兵、对将帅安全或关键线路有什么影响。",
        "如果主变化存在，提到一个后续计划。不要编造未给出的变化，不要声称自己重新算棋。",
        'Return exactly: {"explanation":"中文讲解"}',
      ].join("\n"),
    },
  ];
}

export function parseXiangqiExplanationContent(content: string): string {
  const jsonText = unwrapJson(content);
  const parsed = XiangqiExplanationContentSchema.safeParse(JSON.parse(jsonText));

  if (!parsed.success) {
    throw new Error("DeepSeek explanation JSON must include an explanation string.");
  }

  return parsed.data.explanation;
}

export function buildPostGameMoveAnalysisMessages(input: {
  fenBefore: string;
  moveHistoryBefore: string[];
  sideToMove: PlayerColor;
  selectedMoveUci: string;
  selectedMoveDisplay: string;
  selectedMoveBy: "player" | "engine";
  bestMoveUci: string;
  bestMoveDisplay: string;
  score?: number;
  depth?: number;
  pv?: string[];
  engineReason: string;
}): ChatMessage[] {
  const sideName = input.sideToMove === "r" ? "红方" : "黑方";

  return [
    {
      role: "system",
      content: `${XIANGQI_COACH_SYSTEM_PROMPT} 只解释提供的赛后引擎改进；不要继续真实棋局，不要选择额外走法，不要编造非法变招。Return compact JSON with one key: explanation.`,
    },
    {
      role: "user",
      content: [
        `Side to move in reviewed position: ${sideName}`,
        `Reviewed position before original move FEN: ${input.fenBefore}`,
        `Move history before original move: ${input.moveHistoryBefore.join(" ") || "(none)"}`,
        `Original played move by: ${input.selectedMoveBy}`,
        `Original played move UCI: ${input.selectedMoveUci}`,
        `Original played move display: ${input.selectedMoveDisplay}`,
        `Engine better move UCI: ${input.bestMoveUci}`,
        `Engine better move display: ${input.bestMoveDisplay}`,
        `Engine evaluation: ${input.score ?? "unknown"}`,
        `Engine search depth: ${input.depth ?? "unknown"}`,
        `Principal variation UCI: ${input.pv?.join(" ") || "(none)"}`,
        `Engine technical note: ${input.engineReason}`,
        "用 3-5 句中文说明为什么引擎路线更好。比较原走法和推荐走法对车马炮兵、将帅安全、线路、牵制和攻防节奏的影响。",
        'Return exactly: {"explanation":"中文讲解"}',
      ].join("\n"),
    },
  ];
}

export function buildGameReviewMessages(input: {
  playerColor: PlayerColor;
  result: string;
  reason: string;
  finalFen: string;
  moveHistory: string[];
  moveRecords?: Array<z.infer<typeof MoveRecordSchema>>;
}): ChatMessage[] {
  const playerSide = input.playerColor === "r" ? "红方" : "黑方";
  const aiSide = input.playerColor === "r" ? "黑方" : "红方";
  const detailedMoves = input.moveRecords?.length
    ? input.moveRecords
        .map((record, index) => {
          const score =
            typeof record.engineScore === "number"
              ? ` score ${record.engineScore}`
              : "";
          const depth = record.engineDepth ? ` depth ${record.engineDepth}` : "";
          const pv = record.enginePv?.length ? ` pv ${record.enginePv.join(" ")}` : "";
          return `${index + 1}. ${record.by} ${record.display} (${record.uci})${score}${depth}${pv}`;
        })
        .join("\n")
    : "(none)";

  return [
    {
      role: "system",
      content: `${XIANGQI_COACH_SYSTEM_PROMPT} 只复盘提供的已结束中国象棋棋局；不要继续对局或选择新走法。只使用给定 FEN、棋谱、评分和主变化。Return compact JSON with one key: review.`,
    },
    {
      role: "user",
      content: [
        `Human player side: ${playerSide}`,
        `AI side: ${aiSide}`,
        `Game result: ${input.result}`,
        `Game end reason: ${input.reason}`,
        `Final FEN: ${input.finalFen}`,
        `Move history: ${input.moveHistory.join(" ") || "(none)"}`,
        "Detailed move records:",
        detailedMoves,
        "请用清楚短章节写中文：比赛结果、整局概览、关键转折、双方棋子意图、给你的建议。",
        "点名关键车马炮兵和将帅安全问题。只在有帮助时提到引擎评分。",
        'Return exactly: {"review":"中文赛后复盘"}',
      ].join("\n"),
    },
  ];
}

export function parseGameReviewContent(content: string): string {
  const jsonText = unwrapJson(content);
  const parsed = GameReviewContentSchema.safeParse(JSON.parse(jsonText));

  if (!parsed.success) {
    throw new Error("DeepSeek game review JSON must include a review string.");
  }

  return parsed.data.review;
}

export function getServerMoveContext(fen: string, playerColor: PlayerColor) {
  const status = getGameStatus(fen);
  const aiColor: PlayerColor = playerColor === "r" ? "b" : "r";

  return {
    status,
    aiColor,
    legalMoves: status.isGameOver ? [] : getLegalUciMoves(fen),
    isAiTurn: status.turn === aiColor,
  };
}

export function toEngineDifficulty(value: z.infer<typeof XiangqiDifficultySchema>): XiangqiDifficulty {
  return value;
}

function unwrapJson(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}
