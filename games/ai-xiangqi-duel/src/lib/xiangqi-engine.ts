import {
  applyUciMove,
  createXiangqi,
  getGameStatus,
  getLegalUciMoves,
  getPieceAt,
  type XiangqiPieceType,
} from "./xiangqi";
import { queryPikafishMove } from "./pikafish";

export type XiangqiDifficulty = "beginner" | "casual" | "club" | "master";

export type XiangqiEngineMove = {
  moveUci: string;
  display: string;
  score?: number;
  depth?: number;
  pv: string[];
  reason: string;
  engineName: string;
  source: "heuristic" | "pikafish";
};

export type XiangqiEngineOptions = {
  difficulty?: XiangqiDifficulty;
  timeoutMs?: number;
  preferPikafish?: boolean;
  allowHeuristicFallback?: boolean;
  pikafishPath?: string;
};

export class XiangqiEngineUnavailableError extends Error {
  readonly code = "XIANGQI_ENGINE_UNAVAILABLE";

  constructor(readonly reason: string) {
    super(`Pikafish is required before the AI can move. ${reason}`);
    this.name = "XiangqiEngineUnavailableError";
  }
}

const ENGINE_NAME = "Local Xiangqi Heuristic Engine";
const MAX_PV_MOVES = 12;
const PIECE_VALUES: Record<XiangqiPieceType, number> = {
  king: 10_000,
  rook: 900,
  cannon: 450,
  horse: 420,
  pawn: 120,
  advisor: 180,
  bishop: 180,
};

const DIFFICULTY_DEPTH: Record<XiangqiDifficulty, number> = {
  beginner: 1,
  casual: 2,
  club: 3,
  master: 4,
};

export async function chooseXiangqiMove(
  fen?: string,
  options: XiangqiEngineOptions = {},
): Promise<XiangqiEngineMove | null> {
  const status = getGameStatus(fen);
  if (status.isGameOver) return null;

  const legalMoves = getLegalUciMoves(fen);
  if (legalMoves.length === 0) return null;

  const difficulty = options.difficulty ?? "casual";
  let fallbackReason: string | undefined;

  if (options.preferPikafish ?? true) {
    const pikafish = await queryPikafishMove(fen, {
      difficulty,
      timeoutMs: options.timeoutMs,
      enginePath: options.pikafishPath,
    });

    if (pikafish.ok) {
      const applied = applyUciMove(fen, pikafish.move.moveUci);
      if (!applied.ok) {
        throw new Error("Pikafish selected an illegal move.");
      }

      return {
        moveUci: applied.move.uci,
        display: applied.move.display,
        score: pikafish.move.score,
        depth: pikafish.move.depth,
        pv: pikafish.move.pv,
        reason: describePikafishMove(
          pikafish.move.engineName,
          pikafish.move.score,
          pikafish.move.depth,
          difficulty,
        ),
        engineName: pikafish.move.engineName,
        source: "pikafish",
      };
    }

    fallbackReason = pikafish.reason;
    if (options.allowHeuristicFallback !== true) {
      throw new XiangqiEngineUnavailableError(pikafish.reason);
    }
  }

  const depth = DIFFICULTY_DEPTH[difficulty];
  const ranked = legalMoves
    .map((move) => scoreMove(fen, move, depth))
    .sort((a, b) => b.score - a.score || a.move.localeCompare(b.move));
  const selected = ranked[0];
  const applied = applyUciMove(fen, selected.move);

  if (!applied.ok) {
    throw new Error("Xiangqi engine selected an illegal move.");
  }

  return {
    moveUci: applied.move.uci,
    display: applied.move.display,
    score: selected.score,
    depth,
    pv: normalizePrincipalVariation(applied.move.uci, selected.pv),
    reason: describeMove(selected.score, depth, difficulty, fallbackReason),
    engineName: ENGINE_NAME,
    source: "heuristic",
  };
}

export function normalizePrincipalVariation(
  moveUci: string,
  pv: string[] | undefined,
): string[] {
  const normalizedPv = pv?.filter((move) => getMoveLike(move)) ?? [];
  if (normalizedPv[0] !== moveUci) return [moveUci];
  return normalizedPv.slice(0, MAX_PV_MOVES);
}

function scoreMove(
  fen: string | undefined,
  move: string,
  depth: number,
): { move: string; score: number; pv: string[] } {
  const beforeTarget = getPieceAt(fen, move.slice(2, 4));
  const applied = applyUciMove(fen, move);
  if (!applied.ok) return { move, score: Number.NEGATIVE_INFINITY, pv: [move] };

  const status = getGameStatus(applied.fen);
  const material = evaluateMaterial(applied.fen);
  const moverMultiplier = applied.move.color === "r" ? 1 : -1;
  const captureBonus = beforeTarget ? PIECE_VALUES[beforeTarget.type] * 2 : 0;
  const checkBonus = status.isCheck ? 120 : 0;
  const mateBonus = status.isGameOver ? 100_000 : 0;
  const developmentBonus = centerPressure(move);
  const score =
    material * moverMultiplier +
    captureBonus +
    checkBonus +
    mateBonus +
    developmentBonus;

  return {
    move,
    score,
    pv: buildPrincipalVariation(applied.fen, move, depth),
  };
}

function buildPrincipalVariation(
  fen: string,
  firstMove: string,
  depth: number,
): string[] {
  const pv = [firstMove];
  let currentFen = fen;

  for (let index = 1; index < depth; index += 1) {
    const status = getGameStatus(currentFen);
    if (status.isGameOver) break;

    const legalMoves = getLegalUciMoves(currentFen);
    if (legalMoves.length === 0) break;

    const next = legalMoves
      .map((move) => scoreMoveShallow(currentFen, move))
      .sort((a, b) => b.score - a.score || a.move.localeCompare(b.move))[0];
    const applied = applyUciMove(currentFen, next.move);
    if (!applied.ok) break;

    pv.push(next.move);
    currentFen = applied.fen;
  }

  return pv;
}

function scoreMoveShallow(
  fen: string | undefined,
  move: string,
): { move: string; score: number } {
  const target = getPieceAt(fen, move.slice(2, 4));
  const applied = applyUciMove(fen, move);
  if (!applied.ok) return { move, score: Number.NEGATIVE_INFINITY };

  const material = evaluateMaterial(applied.fen);
  const side = applied.move.color;
  return {
    move,
    score:
      material * (side === "r" ? 1 : -1) +
      (target ? PIECE_VALUES[target.type] : 0) +
      centerPressure(move),
  };
}

function evaluateMaterial(fen: string): number {
  const position = createXiangqi(fen);
  let score = 0;

  for (const row of position.board) {
    for (const piece of row) {
      if (!piece) continue;
      const value = PIECE_VALUES[piece.type];
      score += piece.color === "r" ? value : -value;
    }
  }

  return score;
}

function centerPressure(move: string): number {
  const file = move.charCodeAt(2) - "a".charCodeAt(0);
  const rank = Number(move[3]);
  const fileBonus = 4 - Math.abs(4 - file);
  const rankBonus = 5 - Math.abs(4.5 - rank);
  return Math.round(fileBonus * 4 + rankBonus * 3);
}

function describeMove(
  score: number,
  depth: number,
  difficulty: XiangqiDifficulty,
  fallbackReason?: string,
): string {
  const scoreText = score > 0 ? `+${score}` : String(score);
  const fallbackText = fallbackReason
    ? `Pikafish 未接管本步：${fallbackReason} 已明确降级到本地启发式。`
    : "";
  return `${fallbackText}${ENGINE_NAME} 以 ${difficulty} 难度搜索 ${depth} 层，当前启发式评分 ${scoreText}。`;
}

function describePikafishMove(
  engineName: string,
  score: number | undefined,
  depth: number | undefined,
  difficulty: XiangqiDifficulty,
): string {
  const scoreText =
    typeof score === "number"
      ? `，评分 ${score > 0 ? `+${score}` : score}`
      : "";
  const depthText = depth ? `，搜索深度 ${depth}` : "";
  return `${engineName} 作为专用中国象棋引擎接管落子，当前难度 ${difficulty}${depthText}${scoreText}。`;
}

function getMoveLike(value: string): string | null {
  return /^[a-i][0-9][a-i][0-9]$/.test(value) ? value : null;
}
