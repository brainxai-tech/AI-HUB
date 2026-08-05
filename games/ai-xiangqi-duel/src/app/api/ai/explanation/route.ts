import { NextResponse } from "next/server";
import {
  buildXiangqiExplanationMessages,
  parseXiangqiExplanationContent,
  XiangqiExplanationRequestSchema,
} from "@/lib/ai";
import { jsonError } from "@/lib/api-response";
import { callHubChat, ProviderError } from "@/lib/deepseek";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("VALIDATION_ERROR", "Request body must be JSON.", 400);
  }

  const parsed = XiangqiExplanationRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Xiangqi explanation request is invalid.",
      422,
      parsed.error.flatten(),
    );
  }

  const input = parsed.data;

  try {
    const content = await callHubChat({
      provider: input.provider,
      model: input.model,
      messages: buildXiangqiExplanationMessages({
        fenBefore: input.fenBefore,
        moveHistoryBefore: input.moveHistoryBefore,
        aiColor: input.aiColor,
        moveUci: input.moveUci,
        displayMove: input.displayMove,
        score: input.score,
        depth: input.depth,
        pv: input.pv,
        engineReason: input.engineReason,
      }),
    });

    return NextResponse.json({
      explanation: parseXiangqiExplanationContent(content),
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      const status = error.code === "PROVIDER_AUTH_FAILED" ? 401 : 502;
      return jsonError(error.code, error.message, status);
    }

    console.error("[api/ai/explanation] Failed to explain move", error);
    return jsonError("INTERNAL_ERROR", "Unable to explain the move.", 500);
  }
}
