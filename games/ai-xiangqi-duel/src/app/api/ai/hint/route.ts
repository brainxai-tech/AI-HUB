import { NextResponse } from "next/server";
import { XiangqiHintRequestSchema, toEngineDifficulty } from "@/lib/ai";
import { jsonError, pikafishRequiredError } from "@/lib/api-response";
import { applyUciMove, getGameStatus } from "@/lib/xiangqi";
import {
  chooseXiangqiMove,
  XiangqiEngineUnavailableError,
} from "@/lib/xiangqi-engine";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("VALIDATION_ERROR", "Request body must be JSON.", 400);
  }

  const parsed = XiangqiHintRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Xiangqi hint request is invalid.",
      422,
      parsed.error.flatten(),
    );
  }

  const input = parsed.data;
  let status: ReturnType<typeof getGameStatus>;

  try {
    status = getGameStatus(input.fen);
  } catch {
    return jsonError(
      "VALIDATION_ERROR",
      "The board position is not a valid Xiangqi FEN string.",
      422,
    );
  }

  if (status.isGameOver) {
    return jsonError("AI_NO_LEGAL_MOVES", "The game is already over.", 409);
  }

  if (status.turn !== input.playerColor) {
    return jsonError("AI_NOT_TO_MOVE", "It is not the player's turn.", 409);
  }

  try {
    const engineMove = await chooseXiangqiMove(input.fen, {
      difficulty: toEngineDifficulty(input.engineDifficulty),
      timeoutMs: 10_000,
    });
    if (!engineMove) {
      return jsonError("AI_NO_LEGAL_MOVES", "No legal hint is available.", 409);
    }

    const applied = applyUciMove(input.fen, engineMove.moveUci, input.moveHistory);
    if (!applied.ok) {
      return jsonError("AI_INVALID_MOVE", applied.error.message, 502);
    }

    return NextResponse.json({
      moveUci: applied.move.uci,
      display: applied.move.display,
      from: applied.move.from,
      to: applied.move.to,
      reason: engineMove.reason,
      score: engineMove.score,
      depth: engineMove.depth,
      pv: engineMove.pv,
      engineName: engineMove.engineName,
      source: engineMove.source,
    });
  } catch (error) {
    if (error instanceof XiangqiEngineUnavailableError) {
      return pikafishRequiredError(error.reason);
    }

    console.error("[api/ai/hint] Xiangqi hint failed", error);
    return jsonError("XIANGQI_HINT_FAILED", "Unable to ask the engine for a hint.", 502);
  }
}
