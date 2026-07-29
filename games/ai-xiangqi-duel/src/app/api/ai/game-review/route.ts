import { NextResponse } from "next/server";
import {
  buildGameReviewMessages,
  GameReviewRequestSchema,
  parseGameReviewContent,
} from "@/lib/ai";
import { jsonError } from "@/lib/api-response";
import { getGameStatus } from "@/lib/xiangqi";
import { callDeepSeekChat, ProviderError } from "@/lib/deepseek";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("VALIDATION_ERROR", "Request body must be JSON.", 400);
  }

  const parsed = GameReviewRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Game review request is invalid.",
      422,
      parsed.error.flatten(),
    );
  }

  const input = parsed.data;

  try {
    const status = getGameStatus(input.finalFen);
    if (!status.isGameOver) {
      return jsonError("GAME_NOT_OVER", "The game is not over yet.", 409);
    }
  } catch {
    return jsonError(
      "VALIDATION_ERROR",
      "The final board position is not a valid Xiangqi FEN string.",
      422,
    );
  }

  try {
    const content = await callDeepSeekChat({
      provider: input.provider,
      model: input.model,
      messages: buildGameReviewMessages({
        playerColor: input.playerColor,
        result: input.result,
        reason: input.reason,
        finalFen: input.finalFen,
        moveHistory: input.moveHistory,
        moveRecords: input.moveRecords,
      }),
    });

    return NextResponse.json({
      review: parseGameReviewContent(content),
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      const status = error.code === "PROVIDER_AUTH_FAILED" ? 401 : 502;
      return jsonError(error.code, error.message, status);
    }

    return jsonError("INTERNAL_ERROR", "Unable to review the game.", 500);
  }
}
