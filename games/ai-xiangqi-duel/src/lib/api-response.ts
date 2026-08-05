import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_BAD_RESPONSE"
  | "AI_NOT_TO_MOVE"
  | "AI_NO_LEGAL_MOVES"
  | "AI_INVALID_MOVE"
  | "PIKAFISH_REQUIRED"
  | "XIANGQI_MOVE_FAILED"
  | "XIANGQI_HINT_FAILED"
  | "POST_GAME_ANALYSIS_FAILED"
  | "GAME_NOT_OVER"
  | "INTERNAL_ERROR";

export function jsonError(
  code: ApiErrorCode,
  message: string,
  status = 400,
  details?: unknown,
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    },
    { status },
  );
}

export function pikafishRequiredError(reason: string) {
  return jsonError(
    "PIKAFISH_REQUIRED",
    "未检测到 Pikafish 专用中国象棋引擎。为避免启发式算法乱下，AI 已停止走棋；请设置 PIKAFISH_PATH 后重启本地服务。",
    503,
    { reason },
  );
}
