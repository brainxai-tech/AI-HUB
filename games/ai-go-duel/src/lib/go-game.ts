import GoBoard, { type Sign, type SignMap, type Vertex } from "@sabaki/go-board";

export type GoSign = 1 | -1;
export type GoPlayer = "black" | "white";
export type GoDifficulty = "beginner" | "club" | "dan";

export type KoInfo = {
  sign: GoSign;
  vertex: Vertex;
};

export type GoState = {
  size: number;
  signMap: SignMap;
  next: GoPlayer;
  captures: Record<GoPlayer, number>;
  consecutivePasses: number;
  moveNumber: number;
  ko: KoInfo | null;
};

export type GoMoveRecord = {
  player: GoPlayer;
  vertex: Vertex | null;
  coord: string;
  captures: number;
  boardBefore: string;
  boardAfter: string;
  pass: boolean;
};

type BoardWithKo = GoBoard & {
  _koInfo?: {
    sign: Sign;
    vertex: Vertex;
  };
};

const DEFAULT_SIZE = 9;
const STAR_POINTS = new Set(["2,2", "6,2", "4,4", "2,6", "6,6"]);

export function createGoState(size = DEFAULT_SIZE): GoState {
  return {
    size,
    signMap: GoBoard.fromDimensions(size, size).signMap,
    next: "black",
    captures: { black: 0, white: 0 },
    consecutivePasses: 0,
    moveNumber: 0,
    ko: null,
  };
}

export function createGoStateFromSignMap(
  signMap: SignMap,
  next: GoPlayer = "black",
  captures: Record<GoPlayer, number> = { black: 0, white: 0 },
  ko: KoInfo | null = null,
): GoState {
  return {
    size: signMap.length,
    signMap: cloneSignMap(signMap),
    next,
    captures,
    consecutivePasses: 0,
    moveNumber: 0,
    ko,
  };
}

export function applyGoMove(
  state: GoState,
  vertex: Vertex | "pass",
): { state: GoState; record: GoMoveRecord } {
  const player = state.next;
  const sign = playerToSign(player);
  const board = boardFromState(state);
  const boardBefore = summarizeGoState(state);

  if (vertex === "pass") {
    const nextState: GoState = {
      ...state,
      signMap: cloneSignMap(state.signMap),
      next: otherPlayer(player),
      consecutivePasses: state.consecutivePasses + 1,
      moveNumber: state.moveNumber + 1,
      ko: null,
    };

    return {
      state: nextState,
      record: {
        player,
        vertex: null,
        coord: "pass",
        captures: 0,
        boardBefore,
        boardAfter: summarizeGoState(nextState),
        pass: true,
      },
    };
  }

  const analysis = board.analyzeMove(sign, vertex);
  if (analysis.pass) throw new Error("Move is outside the board.");
  if (analysis.overwrite) throw new Error("Move would overwrite a stone.");
  if (analysis.suicide) throw new Error("Move is suicide.");
  if (analysis.ko) throw new Error("Move violates ko.");

  const capturesBefore = board.getCaptures(sign) ?? 0;
  const moved = board.makeMove(sign, vertex, {
    preventOverwrite: true,
    preventSuicide: true,
    preventKo: true,
  });
  const capturesAfter = moved.getCaptures(sign) ?? capturesBefore;

  const nextState: GoState = {
    size: state.size,
    signMap: cloneSignMap(moved.signMap),
    next: otherPlayer(player),
    captures: {
      black: moved.getCaptures(1) ?? 0,
      white: moved.getCaptures(-1) ?? 0,
    },
    consecutivePasses: 0,
    moveNumber: state.moveNumber + 1,
    ko: readKoInfo(moved),
  };

  return {
    state: nextState,
    record: {
      player,
      vertex,
      coord: moved.stringifyVertex(vertex),
      captures: capturesAfter - capturesBefore,
      boardBefore,
      boardAfter: summarizeGoState(nextState),
      pass: false,
    },
  };
}

export function listLegalGoMoves(state: GoState): Vertex[] {
  const board = boardFromState(state);
  const sign = playerToSign(state.next);
  const moves: Vertex[] = [];

  for (let y = 0; y < state.size; y += 1) {
    for (let x = 0; x < state.size; x += 1) {
      const vertex: Vertex = [x, y];
      if (board.get(vertex) !== 0) continue;

      const analysis = board.analyzeMove(sign, vertex);
      if (!analysis.overwrite && !analysis.suicide && !analysis.ko) {
        moves.push(vertex);
      }
    }
  }

  return moves;
}

export function chooseAiGoMove(
  state: GoState,
  difficulty: GoDifficulty = "club",
): Vertex | "pass" {
  const legalMoves = listLegalGoMoves(state);
  if (!legalMoves.length) return "pass";

  const ranked = legalMoves
    .map((vertex) => ({ vertex, score: scoreGoMove(state, vertex) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return vertexKey(a.vertex).localeCompare(vertexKey(b.vertex));
    });

  if (difficulty === "beginner") {
    return ranked[Math.min(ranked.length - 1, Math.floor(ranked.length * 0.68))].vertex;
  }

  if (difficulty === "dan") {
    return ranked[0].vertex;
  }

  return ranked[Math.min(ranked.length - 1, 1)].vertex;
}

export function summarizeGoState(state: GoState): string {
  const rows: string[] = [];

  for (let y = 0; y < state.size; y += 1) {
    const row = state.signMap[y]
      .map((sign) => {
        if (sign === 1) return "B";
        if (sign === -1) return "W";
        return ".";
      })
      .join(" ");
    rows.push(`${state.size - y} ${row}`);
  }

  return rows.join("\n");
}

export function getStoneCounts(state: GoState) {
  let black = 0;
  let white = 0;

  for (const row of state.signMap) {
    for (const sign of row) {
      if (sign === 1) black += 1;
      if (sign === -1) white += 1;
    }
  }

  return { black, white };
}

export function playerToSign(player: GoPlayer): GoSign {
  return player === "black" ? 1 : -1;
}

export function signToPlayer(sign: GoSign): GoPlayer {
  return sign === 1 ? "black" : "white";
}

export function otherPlayer(player: GoPlayer): GoPlayer {
  return player === "black" ? "white" : "black";
}

export function vertexKey(vertex: Vertex): string {
  return `${vertex[0]},${vertex[1]}`;
}

function scoreGoMove(state: GoState, vertex: Vertex): number {
  const board = boardFromState(state);
  const sign = playerToSign(state.next);
  const capturesBefore = board.getCaptures(sign) ?? 0;
  const moved = board.makeMove(sign, vertex, {
    preventOverwrite: true,
    preventSuicide: true,
    preventKo: true,
  });
  const capturesAfter = moved.getCaptures(sign) ?? capturesBefore;
  const liberties = moved.getLiberties(vertex).length;
  const friendlyNeighbors = moved
    .getNeighbors(vertex)
    .filter((neighbor) => moved.get(neighbor) === sign).length;
  const centerDistance = Math.abs(vertex[0] - 4) + Math.abs(vertex[1] - 4);
  const starBonus = STAR_POINTS.has(vertexKey(vertex)) ? 18 : 0;

  return (
    (capturesAfter - capturesBefore) * 120 +
    liberties * 12 +
    friendlyNeighbors * 10 +
    starBonus -
    centerDistance * 3
  );
}

function boardFromState(state: GoState): GoBoard {
  const board = new GoBoard(cloneSignMap(state.signMap))
    .setCaptures(1, state.captures.black)
    .setCaptures(-1, state.captures.white);

  (board as BoardWithKo)._koInfo = state.ko
    ? { sign: state.ko.sign, vertex: [...state.ko.vertex] as Vertex }
    : { sign: 0, vertex: [-1, -1] };

  return board;
}

function readKoInfo(board: GoBoard): KoInfo | null {
  const koInfo = (board as BoardWithKo)._koInfo;
  if (!koInfo || (koInfo.sign !== 1 && koInfo.sign !== -1)) return null;
  return {
    sign: koInfo.sign,
    vertex: [...koInfo.vertex] as Vertex,
  };
}

function cloneSignMap(signMap: SignMap): SignMap {
  return signMap.map((row) => row.map((sign) => sign as Sign));
}
