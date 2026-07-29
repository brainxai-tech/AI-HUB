import { z } from "zod";
import type { GoPlayer } from "./go-game";

export const ProviderSchema = z.enum(["deepseek", "openai", "anthropic", "gemini"]);

export type Provider = z.infer<typeof ProviderSchema>;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const ProviderTestRequestSchema = z.object({
  provider: ProviderSchema,
  model: z.string().trim().min(1).max(100).optional(),
});

export const GoCoachRequestSchema = z.object({
  provider: ProviderSchema.default("deepseek"),
  model: z.string().trim().min(1).max(100).default("deepseek-v4-flash"),
  boardBefore: z.string().trim().min(1).max(1200),
  boardAfter: z.string().trim().min(1).max(1200),
  moveHistory: z.array(z.string().trim().max(80)).max(300).default([]),
  playedBy: z.enum(["human", "ai"]),
  player: z.enum(["black", "white"]),
  moveText: z.string().trim().min(1).max(40),
  captures: z.number().int().min(0).max(81).default(0),
  result: z.string().trim().max(120).optional(),
});

const GoCoachContentSchema = z.object({
  explanation: z.string().trim().min(1).max(1800),
});

const GO_COACH_SYSTEM_PROMPT =
  "You are a concise Chinese Go coach for 9x9 Go. Explain only the supplied move and board facts. Do not invent reading lines beyond the board summary. Return compact JSON.";

export function buildGoCoachMessages(input: {
  boardBefore: string;
  boardAfter: string;
  moveHistory: string[];
  playedBy: "human" | "ai";
  player: GoPlayer;
  moveText: string;
  captures: number;
  result?: string;
}): ChatMessage[] {
  const playerName = input.player === "black" ? "Black" : "White";

  return [
    {
      role: "system",
      content: `${GO_COACH_SYSTEM_PROMPT} Return exactly: {"explanation":"中文讲解"}.`,
    },
    {
      role: "user",
      content: [
        `Player: ${playerName}`,
        `Move played by: ${input.playedBy}`,
        `Move: ${input.moveText}`,
        `Captures by this move: ${input.captures}`,
        `Move history: ${input.moveHistory.join(" ") || "(none)"}`,
        `Board before:\n${input.boardBefore}`,
        `Board after:\n${input.boardAfter}`,
        `Current result: ${input.result || "game continues"}`,
        "用 3-5 句中文解释这手棋。请覆盖气、连接、断点、角边中腹价值、提子或劫争。",
        "不要继续替用户下棋，也不要编造未给出的变化。",
      ].join("\n"),
    },
  ];
}

export function parseGoCoachContent(content: string): string {
  const parsed = GoCoachContentSchema.safeParse(JSON.parse(unwrapJson(content)));
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
