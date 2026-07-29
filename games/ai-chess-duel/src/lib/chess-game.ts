import { Chess, DEFAULT_POSITION } from "chess.js";
import type { Move, Square } from "chess.js";

export type ChessSide = "w" | "b";
export type ChessDifficulty = "beginner" | "club" | "master";

export type ChessMoveInput = {
  from: string;
  to: string;
  promotion?: string;
};

export type ChessMoveRecord = {
  san: string;
  uci: string;
  from: string;
  to: string;
  color: ChessSide;
  captured?: string;
  promotion?: string;
  before: string;
  after: string;
};

export type ChessSquareState = {
  square: Square;
  type: string;
  color: ChessSide;
} | null;

const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

const CENTER_SQUARES = new Set(["d4", "e4", "d5", "e5", "c4", "f4", "c5", "f5"]);

export const CHESS_START_FEN = DEFAULT_POSITION;

export function createChess(fen: string = CHESS_START_FEN): Chess {
  return new Chess(fen);
}

export function getChessBoard(fen: string = CHESS_START_FEN): ChessSquareState[][] {
  return createChess(fen).board().map((rank) =>
    rank.map((piece) =>
      piece
        ? {
            square: piece.square,
            type: piece.type,
            color: piece.color,
          }
        : null,
    ),
  );
}

export function getGameStatus(fen: string = CHESS_START_FEN) {
  const chess = createChess(fen);

  return {
    fen: chess.fen(),
    turn: chess.turn() as ChessSide,
    isCheck: chess.isCheck(),
    isCheckmate: chess.isCheckmate(),
    isDraw: chess.isDraw(),
    isGameOver: chess.isGameOver(),
    result: getResultText(chess),
    legalMoveCount: chess.moves().length,
  };
}

export function getLegalMoves(fen: string = CHESS_START_FEN, square?: string): Move[] {
  const chess = createChess(fen);
  const options =
    square && isSquare(square)
      ? ({ verbose: true, square } as const)
      : ({ verbose: true } as const);

  return chess.moves(options);
}

export function applyChessMove(
  fen: string,
  move: ChessMoveInput,
): { fen: string; record: ChessMoveRecord } {
  const chess = createChess(fen);
  const before = chess.fen();
  const played = chess.move({
    from: move.from,
    to: move.to,
    promotion: move.promotion || "q",
  });

  if (!played) {
    throw new Error("Illegal chess move.");
  }

  const after = chess.fen();
  return {
    fen: after,
    record: {
      san: played.san,
      uci: toUci(played),
      from: played.from,
      to: played.to,
      color: played.color,
      captured: played.captured,
      promotion: played.promotion,
      before,
      after,
    },
  };
}

export function chooseAiChessMove(
  fen: string,
  difficulty: ChessDifficulty = "club",
): ChessMoveRecord | null {
  const legalMoves = getLegalMoves(fen);
  if (!legalMoves.length) return null;

  const ranked = legalMoves
    .map((move) => ({ move, score: scoreMove(fen, move) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.move.lan.localeCompare(b.move.lan);
    });

  const picked =
    difficulty === "beginner"
      ? ranked[Math.min(ranked.length - 1, Math.floor(ranked.length * 0.72))]
      : difficulty === "master"
        ? ranked[0]
        : ranked[Math.min(ranked.length - 1, 1)];

  return applyChessMove(fen, {
    from: picked.move.from,
    to: picked.move.to,
    promotion: picked.move.promotion || "q",
  }).record;
}

export function toUci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

function scoreMove(fen: string, move: Move): number {
  const chess = createChess(fen);
  let score = 0;

  if (move.captured) score += PIECE_VALUES[move.captured] ?? 0;
  if (move.promotion) score += PIECE_VALUES[move.promotion] ?? 800;
  if (CENTER_SQUARES.has(move.to)) score += 35;
  if (move.piece === "n" || move.piece === "b") {
    if (move.from.endsWith(move.color === "w" ? "1" : "8")) score += 25;
  }
  if (move.isKingsideCastle() || move.isQueensideCastle()) score += 45;

  chess.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
  if (chess.isCheckmate()) score += 20_000;
  else if (chess.isCheck()) score += 140;
  if (chess.isDraw()) score -= 120;

  return score;
}

function getResultText(chess: Chess): string {
  if (chess.isCheckmate()) return chess.turn() === "w" ? "Black wins by checkmate" : "White wins by checkmate";
  if (chess.isStalemate()) return "Draw by stalemate";
  if (chess.isThreefoldRepetition()) return "Draw by repetition";
  if (chess.isDrawByFiftyMoves()) return "Draw by fifty-move rule";
  if (chess.isInsufficientMaterial()) return "Draw by insufficient material";
  if (chess.isDraw()) return "Draw";
  if (chess.isCheck()) return `${chess.turn() === "w" ? "White" : "Black"} is in check`;
  return "Game in progress";
}

function isSquare(value: string): value is Square {
  return /^[a-h][1-8]$/.test(value);
}
