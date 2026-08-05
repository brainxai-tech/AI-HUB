import { z } from "zod";
import type { ChessSide } from "./chess-game";

export const ProviderSchema = z.literal("openai");
export const GptModelSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^gpt-[a-z0-9][a-z0-9._-]*$/i, "Only GPT chat models are supported.");

export type Provider = z.infer<typeof ProviderSchema>;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const ProviderTestRequestSchema = z.object({
  provider: ProviderSchema,
  model: GptModelSchema.optional(),
});

export const ChessCoachRequestSchema = z.object({
  provider: ProviderSchema.default("openai"),
  model: GptModelSchema.default("gpt-5.4-mini"),
  fenBefore: z.string().trim().min(1).max(120),
  fenAfter: z.string().trim().min(1).max(120),
  moveHistory: z.array(z.string().trim().max(80)).max(240).default([]),
  playedBy: z.enum(["human", "ai"]),
  side: z.enum(["w", "b"]),
  moveSan: z.string().trim().min(1).max(40),
  moveUci: z.string().trim().min(4).max(5),
  result: z.string().trim().max(80).optional(),
});

const ChessCoachContentSchema = z.object({
  explanation: z.string().trim().min(1).max(1800),
});

const CHESS_COACH_SYSTEM_PROMPT =
  "You are a concise Chinese chess coach for international chess. Explain only the supplied move and board facts. Do not invent engine lines or claim you calculated with an engine. Return compact JSON.";

export function buildChessCoachMessages(input: {
  fenBefore: string;
  fenAfter: string;
  moveHistory: string[];
  playedBy: "human" | "ai";
  side: ChessSide;
  moveSan: string;
  moveUci: string;
  result?: string;
}): ChatMessage[] {
  const sideName = input.side === "w" ? "White" : "Black";

  return [
    {
      role: "system",
      content: `${CHESS_COACH_SYSTEM_PROMPT} Return exactly: {"explanation":"中文讲解"}.`,
    },
    {
      role: "user",
      content: [
        `Side to move before the move: ${sideName}`,
        `Move played by: ${input.playedBy}`,
        `FEN before move: ${input.fenBefore}`,
        `FEN after move: ${input.fenAfter}`,
        `Move SAN: ${input.moveSan}`,
        `Move UCI: ${input.moveUci}`,
        `Move history: ${input.moveHistory.join(" ") || "(none)"}`,
        `Current result: ${input.result || "game continues"}`,
        "用 3-5 句中文解释这步棋的目的。请覆盖王的安全、中心、子力协调、威胁或防守点。",
        "如果这步是吃子、将军、王车易位或升变，请直接点明。不要推荐未验证的新变化。",
      ].join("\n"),
    },
  ];
}

export function parseChessCoachContent(content: string): string {
  const parsed = ChessCoachContentSchema.safeParse(JSON.parse(unwrapJson(content)));
  if (!parsed.success) {
    throw new Error("Coach JSON must include an explanation string.");
  }

  return parsed.data.explanation;
}

function unwrapJson(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}
