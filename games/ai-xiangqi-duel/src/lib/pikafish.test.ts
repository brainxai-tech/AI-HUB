import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  fromPikafishMove,
  normalizePikafishPrincipalVariation,
  parsePikafishInfoLine,
  resolvePikafishEvalFile,
  resolvePikafishPath,
  toPikafishFen,
} from "./pikafish";

describe("Pikafish adapter helpers", () => {
  it("converts the internal Xiangqi FEN into Pikafish-compatible FEN", () => {
    expect(
      toPikafishFen(
        "rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR r - - 0 1",
      ),
    ).toBe(
      "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1",
    );
  });

  it("converts Pikafish move coordinates back to internal board coordinates", () => {
    expect(fromPikafishMove("b2e2")).toBe("b7e7");
    expect(fromPikafishMove("h9g7")).toBe("h0g2");
    expect(fromPikafishMove("bestmove")).toBeNull();
  });

  it("parses depth, score, and principal variation from an info line", () => {
    const parsed = parsePikafishInfoLine(
      "info depth 9 seldepth 13 score cp 42 nodes 3000 pv b2e2 h9g7",
    );

    expect(parsed).toEqual({
      depth: 9,
      score: 42,
      pv: ["b7e7", "h0g2"],
    });
  });

  it("parses mate scores as large signed engine scores", () => {
    expect(parsePikafishInfoLine("info depth 11 score mate -2 pv b2b9")).toEqual({
      depth: 11,
      score: -99_998,
      pv: ["b7b0"],
    });
  });

  it("normalizes a Pikafish PV so the returned move is first", () => {
    expect(normalizePikafishPrincipalVariation("b7e7", ["h0g2"])).toEqual([
      "b7e7",
    ]);
  });

  it("resolves an explicit engine path from PIKAFISH_PATH", () => {
    expect(
      resolvePikafishPath({
        env: { PIKAFISH_PATH: "C:\\engines\\pikafish.exe" },
      }),
    ).toBe("C:\\engines\\pikafish.exe");
  });

  it("returns null when no explicit engine path is configured", () => {
    expect(resolvePikafishPath({ env: {} })).toBeNull();
  });

  it("resolves the official package NNUE file one directory above the Windows binary", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "pikafish-"));
    try {
      const packageRoot = path.join(cwd, "Pikafish-2026-01-02");
      mkdirSync(path.join(packageRoot, "Windows"), { recursive: true });
      writeFileSync(path.join(packageRoot, "pikafish.nnue"), "");

      expect(
        resolvePikafishEvalFile(
          "Pikafish-2026-01-02/Windows/pikafish-avx2.exe",
          cwd,
        ),
      ).toBe("Pikafish-2026-01-02/pikafish.nnue");
    } finally {
      rmSync(cwd, { force: true, recursive: true });
    }
  });
});
