import { describe, expect, it } from "vitest";
import type { SignMap } from "@sabaki/go-board";
import {
  applyGoMove,
  chooseAiGoMove,
  createGoState,
  createGoStateFromSignMap,
  listLegalGoMoves,
  playerToSign,
} from "./go-game";

describe("go rules", () => {
  it("starts with an empty 9x9 board and black to move", () => {
    const state = createGoState();

    expect(state.size).toBe(9);
    expect(state.next).toBe("black");
    expect(listLegalGoMoves(state)).toHaveLength(81);
  });

  it("places a stone and flips the player without mutating the source state", () => {
    const state = createGoState();
    const result = applyGoMove(state, [4, 4]);

    expect(result.state.signMap[4][4]).toBe(1);
    expect(result.state.next).toBe("white");
    expect(state.signMap[4][4]).toBe(0);
    expect(result.record.coord).toBe("E5");
  });

  it("prevents overwriting an existing stone", () => {
    const first = applyGoMove(createGoState(), [4, 4]).state;

    expect(() => applyGoMove(first, [4, 4])).toThrow(/overwrite/);
  });

  it("captures surrounded stones", () => {
    const signMap = emptySignMap();
    signMap[0][0] = -1;
    signMap[1][0] = 1;
    const state = createGoStateFromSignMap(signMap, "black");
    const result = applyGoMove(state, [1, 0]);

    expect(result.state.signMap[0][0]).toBe(0);
    expect(result.state.captures.black).toBe(1);
    expect(result.record.captures).toBe(1);
  });

  it("prevents suicide", () => {
    const signMap = emptySignMap();
    for (const [x, y] of [
      [0, 1],
      [1, 0],
      [1, 2],
      [2, 0],
      [2, 2],
      [3, 1],
    ]) {
      signMap[y][x] = 1;
    }
    signMap[1][1] = -1;
    const state = createGoStateFromSignMap(signMap, "white");

    expect(() => applyGoMove(state, [2, 1])).toThrow(/suicide/);
  });

  it("prevents immediate ko recapture", () => {
    const signMap = emptySignMap();
    for (const [x, y] of [
      [0, 1],
      [1, 0],
      [1, 2],
      [2, 1],
    ]) {
      signMap[y][x] = 1;
    }
    for (const [x, y] of [
      [2, 0],
      [2, 2],
      [3, 1],
    ]) {
      signMap[y][x] = -1;
    }
    const state = createGoStateFromSignMap(signMap, "white");
    const afterCapture = applyGoMove(state, [1, 1]).state;

    expect(afterCapture.ko).toEqual({ sign: playerToSign("black"), vertex: [2, 1] });
    expect(() => applyGoMove(afterCapture, [2, 1])).toThrow(/ko/);
  });

  it("chooses only legal AI moves", () => {
    const state = createGoState();
    const move = chooseAiGoMove(state, "dan");

    expect(move).not.toBe("pass");
    expect(listLegalGoMoves(state)).toContainEqual(move);
  });
});

function emptySignMap(size = 9): SignMap {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
}
