import { describe, expect, it } from "vitest";
import {
  applyUciMove,
  createInitialFen,
  getBoardSquares,
  getGameStatus,
  getLegalUciMoves,
  getPieceAt,
  isMoveForSide,
  normalizeUciMove,
} from "./xiangqi";

describe("xiangqi domain helpers", () => {
  it("creates a valid initial position with red to move", () => {
    const fen = createInitialFen();

    expect(fen).toContain(" r ");
    expect(getPieceAt(fen, "a0")).toMatchObject({ type: "rook", color: "b" });
    expect(getPieceAt(fen, "e9")).toMatchObject({ type: "king", color: "r" });
    expect(getLegalUciMoves(fen).length).toBeGreaterThan(0);
  });

  it("normalizes coordinate moves", () => {
    expect(normalizeUciMove(" A9A8 ")).toBe("a9a8");
    expect(normalizeUciMove("h7e7")).toBe("h7e7");
    expect(normalizeUciMove("i9i10")).toBe(null);
  });

  it("applies a legal red rook move and records display metadata", () => {
    const result = applyUciMove(undefined, "a9a8");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.move.uci).toBe("a9a8");
    expect(result.move.display).toContain("红车");
    expect(result.fen).toContain(" b ");
    expect(result.history).toEqual([result.move.display]);
  });

  it("rejects a horse move when its leg is blocked", () => {
    const result = applyUciMove(undefined, "b9d8");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ILLEGAL_MOVE");
  });

  it("allows a cannon capture only with exactly one screen", () => {
    const legalMoves = getLegalUciMoves();

    expect(legalMoves).toContain("b7b0");
    expect(legalMoves).not.toContain("b7b1");
  });

  it("keeps advisors and kings inside the palace", () => {
    expect(getLegalUciMoves().some((move) => move.startsWith("e9e8"))).toBe(true);
    expect(getLegalUciMoves().some((move) => move.startsWith("e9e7"))).toBe(false);
    expect(getLegalUciMoves().some((move) => move.startsWith("d9e8"))).toBe(true);
    expect(getLegalUciMoves().some((move) => move.startsWith("d9c8"))).toBe(false);
  });

  it("does not allow bishops to cross the river", () => {
    const first = applyUciMove(undefined, "c9e7");
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = applyUciMove(first.fen, "a0a1", first.history);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const legalToRiver = applyUciMove(second.fen, "e7g5", second.history);
    expect(legalToRiver.ok).toBe(true);
    if (!legalToRiver.ok) return;

    const third = applyUciMove(legalToRiver.fen, "a1a0", legalToRiver.history);
    expect(third.ok).toBe(true);
    if (!third.ok) return;

    const illegal = applyUciMove(third.fen, "g5i3", third.history);
    expect(illegal.ok).toBe(false);
    if (illegal.ok) return;
    expect(illegal.error.code).toBe("ILLEGAL_MOVE");
  });

  it("allows pawns to move sideways only after crossing the river", () => {
    let state = applyUciMove(undefined, "a6a5");
    expect(state.ok).toBe(true);
    if (!state.ok) return;

    state = applyUciMove(state.fen, "a0a1", state.history);
    expect(state.ok).toBe(true);
    if (!state.ok) return;

    const beforeRiver = applyUciMove(state.fen, "a5b5", state.history);
    expect(beforeRiver.ok).toBe(false);

    state = applyUciMove(state.fen, "a5a4", state.history);
    expect(state.ok).toBe(true);
    if (!state.ok) return;

    state = applyUciMove(state.fen, "a1a0", state.history);
    expect(state.ok).toBe(true);
    if (!state.ok) return;

    const afterRiver = applyUciMove(state.fen, "a4b4", state.history);
    expect(afterRiver.ok).toBe(true);
  });

  it("forbids a move that leaves the two kings facing each other", () => {
    const fen = "4k4/9/9/9/9/9/9/9/4R4/4K4 r - - 0 1";
    const result = applyUciMove(fen, "e8a8");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ILLEGAL_MOVE");
  });

  it("detects checkmate when the side to move has no legal escape", () => {
    const fen = "3RkR3/3RRR3/9/9/9/9/9/9/9/4K4 b - - 0 1";
    const status = getGameStatus(fen);

    expect(status.isGameOver).toBe(true);
    expect(status.result).toBe("RED_WINS");
    expect(status.reason).toBe("CHECKMATE");
  });

  it("detects which side owns a selected piece", () => {
    expect(isMoveForSide(undefined, "a9", "r")).toBe(true);
    expect(isMoveForSide(undefined, "a9", "b")).toBe(false);
    expect(isMoveForSide(undefined, "e4", "r")).toBe(false);
  });

  it("orients the board with the selected side at the bottom", () => {
    const redView = getBoardSquares("r");
    const blackView = getBoardSquares("b");

    expect(redView.slice(0, 9)).toEqual([
      "a0",
      "b0",
      "c0",
      "d0",
      "e0",
      "f0",
      "g0",
      "h0",
      "i0",
    ]);
    expect(redView.slice(-9)).toEqual([
      "a9",
      "b9",
      "c9",
      "d9",
      "e9",
      "f9",
      "g9",
      "h9",
      "i9",
    ]);
    expect(blackView.slice(0, 9)).toEqual([
      "i9",
      "h9",
      "g9",
      "f9",
      "e9",
      "d9",
      "c9",
      "b9",
      "a9",
    ]);
    expect(blackView.slice(-9)).toEqual([
      "i0",
      "h0",
      "g0",
      "f0",
      "e0",
      "d0",
      "c0",
      "b0",
      "a0",
    ]);
  });
});
