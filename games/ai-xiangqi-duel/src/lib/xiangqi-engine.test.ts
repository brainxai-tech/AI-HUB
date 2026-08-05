import { describe, expect, it } from "vitest";
import { getLegalUciMoves } from "./xiangqi";
import {
  chooseXiangqiMove,
  normalizePrincipalVariation,
  XiangqiEngineUnavailableError,
} from "./xiangqi-engine";

describe("xiangqi engine adapter", () => {
  it("returns a legal move from the starting position", async () => {
    const engineMove = await chooseXiangqiMove(undefined, {
      difficulty: "casual",
      preferPikafish: false,
    });

    expect(engineMove).not.toBeNull();
    expect(getLegalUciMoves()).toContain(engineMove?.moveUci);
    expect(engineMove?.engineName).toContain("Xiangqi");
    expect(engineMove?.pv[0]).toBe(engineMove?.moveUci);
  });

  it("requires Pikafish by default when the dedicated engine is unavailable", async () => {
    await expect(
      chooseXiangqiMove(undefined, {
        difficulty: "casual",
        pikafishPath: "C:\\missing\\pikafish.exe",
        timeoutMs: 1_000,
      }),
    ).rejects.toBeInstanceOf(XiangqiEngineUnavailableError);
  });

  it("only falls back to the heuristic engine when explicitly allowed", async () => {
    const engineMove = await chooseXiangqiMove(undefined, {
      allowHeuristicFallback: true,
      difficulty: "casual",
      pikafishPath: "C:\\missing\\pikafish.exe",
      timeoutMs: 1_000,
    });

    expect(engineMove?.source).toBe("heuristic");
    expect(engineMove?.reason).toContain("Pikafish 未接管本步");
    expect(getLegalUciMoves()).toContain(engineMove?.moveUci);
  });

  it("returns null when the game is already over", async () => {
    const checkmateFen = "3RkR3/3RRR3/9/9/9/9/9/9/9/4K4 b - - 0 1";

    await expect(chooseXiangqiMove(checkmateFen)).resolves.toBeNull();
  });

  it("normalizes a principal variation that starts with a different move", () => {
    expect(normalizePrincipalVariation("a9a8", ["b9c7", "a0a1"])).toEqual([
      "a9a8",
    ]);
  });
});
