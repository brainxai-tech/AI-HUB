export type XiangqiSide = "r" | "b";

export type XiangqiPieceType =
  | "king"
  | "advisor"
  | "bishop"
  | "horse"
  | "rook"
  | "cannon"
  | "pawn";

export type XiangqiSquare = string;

export type XiangqiPiece = {
  type: XiangqiPieceType;
  color: XiangqiSide;
};

export type XiangqiGameResult =
  | "RED_WINS"
  | "BLACK_WINS"
  | "DRAW"
  | "IN_PROGRESS";

export type XiangqiGameEndReason =
  | "CHECKMATE"
  | "STALEMATE"
  | "DRAW"
  | "IN_PROGRESS";

export type XiangqiMoveSummary = {
  uci: string;
  display: string;
  from: XiangqiSquare;
  to: XiangqiSquare;
  color: XiangqiSide;
  piece: XiangqiPieceType;
  captured?: XiangqiPieceType;
};

export type XiangqiGameStatus = {
  turn: XiangqiSide;
  isCheck: boolean;
  isGameOver: boolean;
  result: XiangqiGameResult;
  reason: XiangqiGameEndReason;
};

export type XiangqiErrorCode =
  | "INVALID_FEN"
  | "INVALID_UCI"
  | "ILLEGAL_MOVE";

export type ApplyMoveResult =
  | {
      ok: true;
      fen: string;
      history: string[];
      move: XiangqiMoveSummary;
      status: XiangqiGameStatus;
    }
  | {
      ok: false;
      error: {
        code: XiangqiErrorCode;
        message: string;
      };
    };

type Board = Array<Array<XiangqiPiece | null>>;

type ParsedPosition = {
  board: Board;
  turn: XiangqiSide;
};

type Coordinate = {
  x: number;
  y: number;
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h", "i"] as const;
const RANKS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const BOARD_WIDTH = 9;
const BOARD_HEIGHT = 10;
const INITIAL_BOARD_FEN =
  "rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR";
const UCI_PATTERN = /^[a-i][0-9][a-i][0-9]$/;

const PIECE_FROM_FEN: Record<string, XiangqiPieceType> = {
  k: "king",
  a: "advisor",
  e: "bishop",
  b: "bishop",
  h: "horse",
  n: "horse",
  r: "rook",
  c: "cannon",
  p: "pawn",
};

const PIECE_TO_FEN: Record<XiangqiPieceType, string> = {
  king: "k",
  advisor: "a",
  bishop: "e",
  horse: "h",
  rook: "r",
  cannon: "c",
  pawn: "p",
};

const PIECE_NAMES: Record<XiangqiPieceType, string> = {
  king: "帅",
  advisor: "仕",
  bishop: "相",
  horse: "马",
  rook: "车",
  cannon: "炮",
  pawn: "兵",
};

const BLACK_PIECE_NAMES: Record<XiangqiPieceType, string> = {
  ...PIECE_NAMES,
  king: "将",
  advisor: "士",
  bishop: "象",
  pawn: "卒",
};

const ORTHOGONAL_DIRECTIONS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export function createInitialFen(): string {
  return `${INITIAL_BOARD_FEN} r - - 0 1`;
}

export function normalizeUciMove(input: string): string | null {
  const move = input.trim().toLowerCase();
  return UCI_PATTERN.test(move) ? move : null;
}

export function createXiangqi(fen?: string): ParsedPosition {
  return parseFen(fen ?? createInitialFen());
}

export function getLegalUciMoves(fen?: string): string[] {
  const position = createXiangqi(fen);
  return getLegalMoves(position, position.turn).map((move) => move.uci);
}

export function getPieceAt(
  fen: string | undefined,
  square: string,
): XiangqiPiece | null {
  if (!isSquare(square)) return null;
  const { board } = createXiangqi(fen);
  const { x, y } = squareToCoordinate(square);
  return board[y][x];
}

export function isMoveForSide(
  fen: string | undefined,
  square: string,
  side: XiangqiSide,
): boolean {
  return getPieceAt(fen, square)?.color === side;
}

export function applyUciMove(
  fen: string | undefined,
  uciMove: string,
  history: string[] = [],
): ApplyMoveResult {
  const normalized = normalizeUciMove(uciMove);
  if (!normalized) {
    return {
      ok: false,
      error: {
        code: "INVALID_UCI",
        message: "Move must use Xiangqi coordinate notation, such as a9a8.",
      },
    };
  }

  let position: ParsedPosition;
  try {
    position = createXiangqi(fen);
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_FEN",
        message: "The board position is not a valid Xiangqi FEN string.",
      },
    };
  }

  const legalMove = getLegalMoves(position, position.turn).find(
    (move) => move.uci === normalized,
  );
  if (!legalMove) {
    return {
      ok: false,
      error: {
        code: "ILLEGAL_MOVE",
        message: "That move is not legal in the current Xiangqi position.",
      },
    };
  }

  const board = cloneBoard(position.board);
  makeMoveOnBoard(board, legalMove.from, legalMove.to);
  const nextPosition: ParsedPosition = {
    board,
    turn: opposite(position.turn),
  };
  const nextFen = serializeFen(nextPosition);

  return {
    ok: true,
    fen: nextFen,
    history: [...history, legalMove.display],
    move: legalMove,
    status: getGameStatus(nextFen),
  };
}

export function getGameStatus(fen?: string): XiangqiGameStatus {
  const position = createXiangqi(fen);
  const isCheck = isInCheck(position.board, position.turn);
  const legalMoves = getLegalMoves(position, position.turn);

  if (legalMoves.length === 0) {
    const winner = opposite(position.turn);
    return {
      turn: position.turn,
      isCheck,
      isGameOver: true,
      result: winner === "r" ? "RED_WINS" : "BLACK_WINS",
      reason: isCheck ? "CHECKMATE" : "STALEMATE",
    };
  }

  return {
    turn: position.turn,
    isCheck,
    isGameOver: false,
    result: "IN_PROGRESS",
    reason: "IN_PROGRESS",
  };
}

export function squareToCoordinate(square: XiangqiSquare): Coordinate {
  return {
    x: FILES.indexOf(square[0] as (typeof FILES)[number]),
    y: Number(square[1]),
  };
}

export function coordinateToSquare(x: number, y: number): XiangqiSquare {
  return `${FILES[x]}${RANKS[y]}`;
}

export function getBoardSquares(orientation: XiangqiSide): XiangqiSquare[] {
  const files = orientation === "r" ? FILES : [...FILES].reverse();
  const ranks = orientation === "r" ? RANKS : [...RANKS].reverse();
  return ranks.flatMap((rank) => files.map((file) => `${file}${rank}`));
}

export function formatMoveDisplay(
  piece: XiangqiPiece,
  from: XiangqiSquare,
  to: XiangqiSquare,
): string {
  const sideName = piece.color === "r" ? "红" : "黑";
  const names = piece.color === "r" ? PIECE_NAMES : BLACK_PIECE_NAMES;
  return `${sideName}${names[piece.type]} ${from}-${to}`;
}

function parseFen(fen: string): ParsedPosition {
  const [boardPart, turnPart = "r"] = fen.trim().split(/\s+/);
  const rows = boardPart.split("/");
  if (rows.length !== BOARD_HEIGHT) {
    throw new Error("Xiangqi FEN must include 10 rows.");
  }

  const board = rows.map((row) => parseFenRow(row));
  const turn = turnPart === "b" ? "b" : turnPart === "r" ? "r" : null;
  if (!turn) {
    throw new Error("Xiangqi FEN side to move must be r or b.");
  }

  if (!findKing(board, "r") || !findKing(board, "b")) {
    throw new Error("Xiangqi FEN must include both kings.");
  }

  return { board, turn };
}

function parseFenRow(row: string): Array<XiangqiPiece | null> {
  const result: Array<XiangqiPiece | null> = [];

  for (const char of row) {
    if (/^[1-9]$/.test(char)) {
      result.push(...Array<null>(Number(char)).fill(null));
      continue;
    }

    const type = PIECE_FROM_FEN[char.toLowerCase()];
    if (!type) {
      throw new Error(`Unknown Xiangqi FEN piece: ${char}`);
    }

    result.push({
      type,
      color: char === char.toUpperCase() ? "r" : "b",
    });
  }

  if (result.length !== BOARD_WIDTH) {
    throw new Error("Each Xiangqi FEN row must contain 9 files.");
  }

  return result;
}

function serializeFen(position: ParsedPosition): string {
  const rows = position.board.map((row) => {
    let text = "";
    let empty = 0;

    for (const piece of row) {
      if (!piece) {
        empty += 1;
        continue;
      }

      if (empty) {
        text += String(empty);
        empty = 0;
      }

      const char = PIECE_TO_FEN[piece.type];
      text += piece.color === "r" ? char.toUpperCase() : char;
    }

    return text + (empty ? String(empty) : "");
  });

  return `${rows.join("/")} ${position.turn} - - 0 1`;
}

function getLegalMoves(
  position: ParsedPosition,
  side: XiangqiSide,
): XiangqiMoveSummary[] {
  const pseudoMoves = getPseudoMoves(position.board, side);
  return pseudoMoves.filter((move) => {
    const board = cloneBoard(position.board);
    makeMoveOnBoard(board, move.from, move.to);
    return !isInCheck(board, side);
  });
}

function getPseudoMoves(board: Board, side: XiangqiSide): XiangqiMoveSummary[] {
  const moves: XiangqiMoveSummary[] = [];

  forEachPiece(board, (piece, x, y) => {
    if (piece.color !== side) return;
    for (const target of getPseudoTargets(board, piece, x, y)) {
      const from = coordinateToSquare(x, y);
      const to = coordinateToSquare(target.x, target.y);
      const captured = board[target.y][target.x]?.type;
      moves.push({
        uci: `${from}${to}`,
        display: formatMoveDisplay(piece, from, to),
        from,
        to,
        color: piece.color,
        piece: piece.type,
        captured,
      });
    }
  });

  return moves;
}

function getPseudoTargets(
  board: Board,
  piece: XiangqiPiece,
  x: number,
  y: number,
): Coordinate[] {
  switch (piece.type) {
    case "king":
      return getKingTargets(board, piece, x, y);
    case "advisor":
      return getAdvisorTargets(board, piece, x, y);
    case "bishop":
      return getBishopTargets(board, piece, x, y);
    case "horse":
      return getHorseTargets(board, piece, x, y);
    case "rook":
      return getRookTargets(board, piece, x, y);
    case "cannon":
      return getCannonTargets(board, piece, x, y);
    case "pawn":
      return getPawnTargets(board, piece, x, y);
  }
}

function getKingTargets(
  board: Board,
  piece: XiangqiPiece,
  x: number,
  y: number,
): Coordinate[] {
  const targets = ORTHOGONAL_DIRECTIONS.map((direction) => ({
    x: x + direction.x,
    y: y + direction.y,
  })).filter((target) => isInBounds(target) && isInPalace(target, piece.color));

  const opposingKing = findKing(board, opposite(piece.color));
  if (
    opposingKing &&
    opposingKing.x === x &&
    countPiecesBetween(board, { x, y }, opposingKing) === 0
  ) {
    targets.push(opposingKing);
  }

  return targets.filter((target) => canOccupy(board, piece.color, target));
}

function getAdvisorTargets(
  board: Board,
  piece: XiangqiPiece,
  x: number,
  y: number,
): Coordinate[] {
  return [
    { x: x - 1, y: y - 1 },
    { x: x + 1, y: y - 1 },
    { x: x + 1, y: y + 1 },
    { x: x - 1, y: y + 1 },
  ].filter(
    (target) =>
      isInBounds(target) &&
      isInPalace(target, piece.color) &&
      canOccupy(board, piece.color, target),
  );
}

function getBishopTargets(
  board: Board,
  piece: XiangqiPiece,
  x: number,
  y: number,
): Coordinate[] {
  return [
    { x: x - 2, y: y - 2 },
    { x: x + 2, y: y - 2 },
    { x: x + 2, y: y + 2 },
    { x: x - 2, y: y + 2 },
  ].filter((target) => {
    if (
      !isInBounds(target) ||
      !isOnOwnSideOfRiver(target, piece.color) ||
      !canOccupy(board, piece.color, target)
    ) {
      return false;
    }

    const eye = { x: (x + target.x) / 2, y: (y + target.y) / 2 };
    return !board[eye.y][eye.x];
  });
}

function getHorseTargets(
  board: Board,
  piece: XiangqiPiece,
  x: number,
  y: number,
): Coordinate[] {
  const jumps = [
    { x: x + 1, y: y - 2, leg: { x, y: y - 1 } },
    { x: x + 2, y: y - 1, leg: { x: x + 1, y } },
    { x: x + 2, y: y + 1, leg: { x: x + 1, y } },
    { x: x + 1, y: y + 2, leg: { x, y: y + 1 } },
    { x: x - 1, y: y + 2, leg: { x, y: y + 1 } },
    { x: x - 2, y: y + 1, leg: { x: x - 1, y } },
    { x: x - 2, y: y - 1, leg: { x: x - 1, y } },
    { x: x - 1, y: y - 2, leg: { x, y: y - 1 } },
  ];

  return jumps
    .filter(
      (target) =>
        isInBounds(target) &&
        !board[target.leg.y][target.leg.x] &&
        canOccupy(board, piece.color, target),
    )
    .map(({ x: targetX, y: targetY }) => ({ x: targetX, y: targetY }));
}

function getRookTargets(
  board: Board,
  piece: XiangqiPiece,
  x: number,
  y: number,
): Coordinate[] {
  return getSlidingTargets(board, piece.color, x, y, false);
}

function getCannonTargets(
  board: Board,
  piece: XiangqiPiece,
  x: number,
  y: number,
): Coordinate[] {
  return getSlidingTargets(board, piece.color, x, y, true);
}

function getSlidingTargets(
  board: Board,
  side: XiangqiSide,
  x: number,
  y: number,
  isCannon: boolean,
): Coordinate[] {
  const targets: Coordinate[] = [];

  for (const direction of ORTHOGONAL_DIRECTIONS) {
    let current = { x: x + direction.x, y: y + direction.y };
    let screenSeen = false;

    while (isInBounds(current)) {
      const occupyingPiece = board[current.y][current.x];

      if (!isCannon) {
        if (!occupyingPiece) {
          targets.push({ ...current });
        } else {
          if (occupyingPiece.color !== side) targets.push({ ...current });
          break;
        }
      } else if (!screenSeen) {
        if (!occupyingPiece) {
          targets.push({ ...current });
        } else {
          screenSeen = true;
        }
      } else if (occupyingPiece) {
        if (occupyingPiece.color !== side) targets.push({ ...current });
        break;
      }

      current = { x: current.x + direction.x, y: current.y + direction.y };
    }
  }

  return targets;
}

function getPawnTargets(
  board: Board,
  piece: XiangqiPiece,
  x: number,
  y: number,
): Coordinate[] {
  const forward = piece.color === "r" ? -1 : 1;
  const targets = [{ x, y: y + forward }];

  if (hasCrossedRiver({ x, y }, piece.color)) {
    targets.push({ x: x - 1, y }, { x: x + 1, y });
  }

  return targets.filter(
    (target) =>
      isInBounds(target) && canOccupy(board, piece.color, target),
  );
}

function isInCheck(board: Board, side: XiangqiSide): boolean {
  const king = findKing(board, side);
  if (!king) return true;

  const attacker = opposite(side);
  let attacked = false;
  forEachPiece(board, (piece, x, y) => {
    if (attacked || piece.color !== attacker) return;
    if (attacksSquare(board, piece, x, y, king)) {
      attacked = true;
    }
  });

  return attacked;
}

function attacksSquare(
  board: Board,
  piece: XiangqiPiece,
  x: number,
  y: number,
  target: Coordinate,
): boolean {
  const dx = target.x - x;
  const dy = target.y - y;

  if (piece.type === "rook") {
    return isSameLine(x, y, target) && countPiecesBetween(board, { x, y }, target) === 0;
  }

  if (piece.type === "cannon") {
    return isSameLine(x, y, target) && countPiecesBetween(board, { x, y }, target) === 1;
  }

  if (piece.type === "horse") {
    const valid = (Math.abs(dx) === 1 && Math.abs(dy) === 2) ||
      (Math.abs(dx) === 2 && Math.abs(dy) === 1);
    if (!valid) return false;
    const leg =
      Math.abs(dx) === 2
        ? { x: x + Math.sign(dx), y }
        : { x, y: y + Math.sign(dy) };
    return !board[leg.y][leg.x];
  }

  if (piece.type === "bishop") {
    if (Math.abs(dx) !== 2 || Math.abs(dy) !== 2) return false;
    if (!isOnOwnSideOfRiver(target, piece.color)) return false;
    return !board[(y + target.y) / 2][(x + target.x) / 2];
  }

  if (piece.type === "advisor") {
    return (
      Math.abs(dx) === 1 &&
      Math.abs(dy) === 1 &&
      isInPalace(target, piece.color)
    );
  }

  if (piece.type === "king") {
    if (isSameLine(x, y, target) && countPiecesBetween(board, { x, y }, target) === 0) {
      return true;
    }
    return (
      Math.abs(dx) + Math.abs(dy) === 1 &&
      isInPalace(target, piece.color)
    );
  }

  const forward = piece.color === "r" ? -1 : 1;
  if (dx === 0 && dy === forward) return true;
  return hasCrossedRiver({ x, y }, piece.color) && Math.abs(dx) === 1 && dy === 0;
}

function makeMoveOnBoard(
  board: Board,
  fromSquare: XiangqiSquare,
  toSquare: XiangqiSquare,
) {
  const from = squareToCoordinate(fromSquare);
  const to = squareToCoordinate(toSquare);
  board[to.y][to.x] = board[from.y][from.x];
  board[from.y][from.x] = null;
}

function cloneBoard(board: Board): Board {
  return board.map((row) =>
    row.map((piece) => (piece ? { ...piece } : null)),
  );
}

function forEachPiece(
  board: Board,
  callback: (piece: XiangqiPiece, x: number, y: number) => void,
) {
  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const piece = board[y][x];
      if (piece) callback(piece, x, y);
    }
  }
}

function findKing(board: Board, side: XiangqiSide): Coordinate | null {
  let king: Coordinate | null = null;
  forEachPiece(board, (piece, x, y) => {
    if (!king && piece.type === "king" && piece.color === side) {
      king = { x, y };
    }
  });
  return king;
}

function canOccupy(
  board: Board,
  side: XiangqiSide,
  target: Coordinate,
): boolean {
  const piece = board[target.y][target.x];
  return !piece || piece.color !== side;
}

function isInBounds(target: Coordinate): boolean {
  return (
    target.x >= 0 &&
    target.x < BOARD_WIDTH &&
    target.y >= 0 &&
    target.y < BOARD_HEIGHT
  );
}

function isSquare(value: string): boolean {
  return /^[a-i][0-9]$/.test(value);
}

function isInPalace(target: Coordinate, side: XiangqiSide): boolean {
  if (target.x < 3 || target.x > 5) return false;
  return side === "r" ? target.y >= 7 && target.y <= 9 : target.y >= 0 && target.y <= 2;
}

function isOnOwnSideOfRiver(target: Coordinate, side: XiangqiSide): boolean {
  return side === "r" ? target.y >= 5 : target.y <= 4;
}

function hasCrossedRiver(target: Coordinate, side: XiangqiSide): boolean {
  return side === "r" ? target.y <= 4 : target.y >= 5;
}

function isSameLine(x: number, y: number, target: Coordinate): boolean {
  return x === target.x || y === target.y;
}

function countPiecesBetween(
  board: Board,
  from: Coordinate,
  to: Coordinate,
): number {
  if (!isSameLine(from.x, from.y, to)) return Number.POSITIVE_INFINITY;

  const stepX = Math.sign(to.x - from.x);
  const stepY = Math.sign(to.y - from.y);
  let count = 0;
  let current = { x: from.x + stepX, y: from.y + stepY };

  while (current.x !== to.x || current.y !== to.y) {
    if (board[current.y][current.x]) count += 1;
    current = { x: current.x + stepX, y: current.y + stepY };
  }

  return count;
}

function opposite(side: XiangqiSide): XiangqiSide {
  return side === "r" ? "b" : "r";
}
