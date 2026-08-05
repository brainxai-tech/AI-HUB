import { NextResponse } from "next/server";
import {
  buildPostGameMoveAnalysisMessages,
  parseXiangqiExplanationContent,
  PostGameMoveAnalysisRequestSchema,
  toEngineDifficulty,
} from "@/lib/ai";
import { jsonError, pikafishRequiredError } from "@/lib/api-response";
import { applyUciMove, getGameStatus } from "@/lib/xiangqi";
import {
  callHubChat,
  getHubExplanationErrorMessage,
  ProviderError,
} from "@/lib/deepseek";
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

  const parsed = PostGameMoveAnalysisRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Post-game move analysis request is invalid.",
      422,
      parsed.error.flatten(),
    );
  }

  const input = parsed.data;
  let status: ReturnType<typeof getGameStatus>;

  try {
    status = getGameStatus(input.fenBefore);
  } catch {
    return jsonError(
      "VALIDATION_ERROR",
      "The reviewed board position is not a valid Xiangqi FEN string.",
      422,
    );
  }

  if (status.isGameOver) {
    return jsonError("AI_NO_LEGAL_MOVES", "The reviewed position is already over.", 409);
  }

  const originalMove = applyUciMove(
    input.fenBefore,
    input.selectedMoveUci,
    input.moveHistoryBefore,
  );

  if (!originalMove.ok) {
    return jsonError(
      "VALIDATION_ERROR",
      "The selected move is not legal in the reviewed position.",
      422,
    );
  }

  try {
    const engineMove = await chooseXiangqiMove(input.fenBefore, {
      difficulty: toEngineDifficulty(input.engineDifficulty),
      timeoutMs: 12_000,
    });

    if (!engineMove) {
      return jsonError("AI_NO_LEGAL_MOVES", "The engine has no legal move.", 409);
    }

    const recommendedMove = applyUciMove(
      input.fenBefore,
      engineMove.moveUci,
      input.moveHistoryBefore,
    );

    if (!recommendedMove.ok) {
      return jsonError("AI_INVALID_MOVE", recommendedMove.error.message, 502);
    }

    let explanation: string | undefined;
    let explanationError: string | undefined;

    try {
      const content = await callHubChat({
        provider: input.provider,
        model: input.model,
        messages: buildPostGameMoveAnalysisMessages({
          fenBefore: input.fenBefore,
          moveHistoryBefore: input.moveHistoryBefore,
          sideToMove: status.turn,
          selectedMoveUci: originalMove.move.uci,
          selectedMoveDisplay: originalMove.move.display,
          selectedMoveBy: input.selectedMoveBy,
          bestMoveUci: recommendedMove.move.uci,
          bestMoveDisplay: recommendedMove.move.display,
          score: engineMove.score,
          depth: engineMove.depth,
          pv: engineMove.pv,
          engineReason: engineMove.reason,
        }),
      });
      explanation = parseXiangqiExplanationContent(content);
    } catch (error) {
      explanationError =
        error instanceof ProviderError
          ? getHubExplanationErrorMessage(error)
          : "The model did not finish explaining this improvement.";
    }

    return NextResponse.json({
      selectedMove: {
        moveUci: originalMove.move.uci,
        display: originalMove.move.display,
        by: input.selectedMoveBy,
        fenAfter: originalMove.fen,
      },
      recommendation: {
        moveUci: recommendedMove.move.uci,
        display: recommendedMove.move.display,
        from: recommendedMove.move.from,
        to: recommendedMove.move.to,
        fenAfter: recommendedMove.fen,
        reason: engineMove.reason,
        score: engineMove.score,
        depth: engineMove.depth,
        pv: engineMove.pv,
        engineName: engineMove.engineName,
        source: engineMove.source,
      },
      explanation,
      explanationError,
    });
  } catch (error) {
    if (error instanceof XiangqiEngineUnavailableError) {
      return pikafishRequiredError(error.reason);
    }

    console.error("[api/ai/post-game-analysis] Xiangqi analysis failed", error);
    return jsonError("POST_GAME_ANALYSIS_FAILED", "Unable to analyze this move.", 502);
  }
}
