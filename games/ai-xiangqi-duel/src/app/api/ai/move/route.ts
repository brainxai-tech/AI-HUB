import { NextResponse } from "next/server";
import {
  AiMoveRequestSchema,
  buildXiangqiExplanationMessages,
  getServerMoveContext,
  parseXiangqiExplanationContent,
  toEngineDifficulty,
  type Provider,
} from "@/lib/ai";
import { jsonError, pikafishRequiredError } from "@/lib/api-response";
import { applyUciMove } from "@/lib/xiangqi";
import { callHubChat, ProviderError } from "@/lib/deepseek";
import {
  chooseXiangqiMove,
  XiangqiEngineUnavailableError,
  type XiangqiEngineMove,
} from "@/lib/xiangqi-engine";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("VALIDATION_ERROR", "Request body must be JSON.", 400);
  }

  const parsed = AiMoveRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "AI move request is invalid.",
      422,
      parsed.error.flatten(),
    );
  }

  const input = parsed.data;
  let context: ReturnType<typeof getServerMoveContext>;

  try {
    context = getServerMoveContext(input.fen, input.playerColor);
  } catch {
    return jsonError(
      "VALIDATION_ERROR",
      "The board position is not a valid Xiangqi FEN string.",
      422,
    );
  }

  if (context.status.isGameOver) {
    return jsonError("AI_NO_LEGAL_MOVES", "The game is already over.", 409);
  }

  if (!context.isAiTurn) {
    return jsonError("AI_NOT_TO_MOVE", "It is not AI's turn.", 409);
  }

  if (context.legalMoves.length === 0) {
    return jsonError("AI_NO_LEGAL_MOVES", "AI has no legal moves.", 409);
  }

  try {
    const engineMove = await chooseXiangqiMove(input.fen, {
      difficulty: toEngineDifficulty(input.engineDifficulty),
      timeoutMs: 12_000,
    });
    if (!engineMove) {
      return jsonError("AI_NO_LEGAL_MOVES", "AI has no legal moves.", 409);
    }

    const applied = applyUciMove(input.fen, engineMove.moveUci, input.moveHistory);
    if (!applied.ok) {
      return jsonError("AI_INVALID_MOVE", applied.error.message, 502);
    }

    const explanation = await explainEngineMove({
      provider: input.provider,
      model: input.model,
      enabled: input.explainWithModel,
      fenBefore: input.fen,
      moveHistoryBefore: input.moveHistory,
      aiColor: context.aiColor,
      engineMove,
    });

    return NextResponse.json({
      moveUci: applied.move.uci,
      display: applied.move.display,
      fen: applied.fen,
      history: applied.history,
      status: applied.status,
      reason: explanation.text,
      explanationSource: explanation.source,
      explanationError: explanation.error,
      source: "xiangqi-engine",
      score: engineMove.score,
      engine: {
        reason: engineMove.reason,
        score: engineMove.score,
        depth: engineMove.depth,
        pv: engineMove.pv,
        engineName: engineMove.engineName,
        source: engineMove.source,
        difficulty: input.engineDifficulty,
      },
    });
  } catch (error) {
    if (error instanceof XiangqiEngineUnavailableError) {
      return pikafishRequiredError(error.reason);
    }

    if (error instanceof ProviderError) {
      const status = error.code === "PROVIDER_AUTH_FAILED" ? 401 : 502;
      return jsonError(error.code, error.message, status);
    }

    console.error("[api/ai/move] Xiangqi move failed", error);
    return jsonError("XIANGQI_MOVE_FAILED", "Unable to ask AI for a move.", 502);
  }
}

async function explainEngineMove(input: {
  provider: Provider;
  model: string;
  enabled: boolean;
  fenBefore: string;
  moveHistoryBefore: string[];
  aiColor: "r" | "b";
  engineMove: XiangqiEngineMove;
}): Promise<{
  text: string;
  source: "model" | "engine";
  error?: string;
}> {
  if (!input.enabled) {
    return {
      text: input.engineMove.reason,
      source: "engine",
    };
  }

  try {
    const content = await callHubChat({
      provider: input.provider,
      model: input.model,
      messages: buildXiangqiExplanationMessages({
        fenBefore: input.fenBefore,
        moveHistoryBefore: input.moveHistoryBefore,
        aiColor: input.aiColor,
        moveUci: input.engineMove.moveUci,
        displayMove: input.engineMove.display,
        score: input.engineMove.score,
        depth: input.engineMove.depth,
        pv: input.engineMove.pv,
        engineReason: input.engineMove.reason,
      }),
    });

    return {
      text: parseXiangqiExplanationContent(content),
      source: "model",
    };
  } catch (error) {
    return {
      text: input.engineMove.reason,
      source: "engine",
      error: error instanceof Error ? error.message : "Model explanation failed.",
    };
  }
}
