import { describe, expect, it } from "vitest";
import {
  applyChessMove,
  CHESS_START_FEN,
  chooseAiChessMove,
  getGameStatus,
  getLegalMoves,
} from "./chess-game";

describe("chess rules", () => {
  it("loads the starting position with twenty legal moves", () => {
    const status = getGameStatus(CHESS_START_FEN);

    expect(status.turn).toBe("w");
    expect(status.legalMoveCount).toBe(20);
    expect(getLegalMoves(CHESS_START_FEN, "e2").map((move) => move.to)).toEqual([
      "e3",
      "e4",
    ]);
  });

  it("applies a legal move and records SAN plus UCI notation", () => {
    const result = applyChessMove(CHESS_START_FEN, { from: "e2", to: "e4" });

    expect(result.record.san).toBe("e4");
    expect(result.record.uci).toBe("e2e4");
    expect(getGameStatus(result.fen).turn).toBe("b");
  });

  it("rejects illegal moves", () => {
    expect(() =>
      applyChessMove(CHESS_START_FEN, { from: "e2", to: "e5" }),
    ).toThrow();
  });

  it("chooses a legal AI move", () => {
    const move = chooseAiChessMove(CHESS_START_FEN, "master");

    expect(move).not.toBeNull();
    expect(move?.uci).toHaveLength(4);
    expect(getLegalMoves(CHESS_START_FEN).some((legal) => legal.lan === move?.uci)).toBe(true);
  });
});
