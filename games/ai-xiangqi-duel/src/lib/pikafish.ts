import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { applyUciMove, createInitialFen } from "./xiangqi";

type PikafishDifficulty = "beginner" | "casual" | "club" | "master";

export type PikafishSearchOptions = {
  difficulty?: PikafishDifficulty;
  timeoutMs?: number;
  enginePath?: string;
};

export type PikafishSearchResult = {
  moveUci: string;
  score?: number;
  depth?: number;
  pv: string[];
  engineName: string;
  rawBestMove: string;
};

export type PikafishFailureCode =
  | "PIKAFISH_NOT_CONFIGURED"
  | "PIKAFISH_SPAWN_FAILED"
  | "PIKAFISH_TIMEOUT"
  | "PIKAFISH_NO_BESTMOVE"
  | "PIKAFISH_ILLEGAL_MOVE";

export type PikafishQueryResult =
  | {
      ok: true;
      move: PikafishSearchResult;
    }
  | {
      ok: false;
      code: PikafishFailureCode;
      reason: string;
    };

type ResolvePikafishPathInput = {
  env?: Partial<Pick<NodeJS.ProcessEnv, "PIKAFISH_PATH">>;
};

type ParsedPikafishInfo = {
  depth?: number;
  score?: number;
  pv?: string[];
};

const DEFAULT_ENGINE_NAME = "Pikafish";
const PIKAFISH_EVAL_FILE = "pikafish.nnue";
const MAX_PV_MOVES = 12;
const INTERNAL_MOVE_PATTERN = /^[a-i][0-9][a-i][0-9]$/;
const PIKAFISH_MOVE_PATTERN = /^[a-i][0-9][a-i][0-9][a-z]?$/;
const PIKAFISH_TIMEOUT_MS = 10_000;
const PIKAFISH_MOVETIME_MS: Record<PikafishDifficulty, number> = {
  beginner: 300,
  casual: 700,
  club: 1_400,
  master: 2_500,
};

const FEN_TO_PIKAFISH_PIECES: Record<string, string> = {
  h: "n",
  H: "N",
  e: "b",
  E: "B",
};

export async function queryPikafishMove(
  fen?: string,
  options: PikafishSearchOptions = {},
): Promise<PikafishQueryResult> {
  const enginePath = options.enginePath ?? resolvePikafishPath();
  if (!enginePath) {
    return {
      ok: false,
      code: "PIKAFISH_NOT_CONFIGURED",
      reason:
        "Pikafish is not configured. Set PIKAFISH_PATH to the local engine binary.",
    };
  }

  try {
    const result = await runPikafish(enginePath, toPikafishFen(fen), options);
    const moveUci = fromPikafishMove(result.rawBestMove);
    if (!moveUci) {
      return {
        ok: false,
        code: "PIKAFISH_NO_BESTMOVE",
        reason: `Pikafish returned an unsupported bestmove: ${result.rawBestMove}.`,
      };
    }

    const applied = applyUciMove(fen, moveUci);
    if (!applied.ok) {
      return {
        ok: false,
        code: "PIKAFISH_ILLEGAL_MOVE",
        reason: `Pikafish returned a move that failed local validation: ${moveUci}.`,
      };
    }

    return {
      ok: true,
      move: {
        moveUci,
        score: result.score,
        depth: result.depth,
        pv: normalizePikafishPrincipalVariation(moveUci, result.pv),
        engineName: result.engineName,
        rawBestMove: result.rawBestMove,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message === "PIKAFISH_TIMEOUT") {
      return {
        ok: false,
        code: "PIKAFISH_TIMEOUT",
        reason: "Pikafish did not return a move before the request timed out.",
      };
    }

    return {
      ok: false,
      code: "PIKAFISH_SPAWN_FAILED",
      reason:
        error instanceof Error
          ? error.message
          : "Pikafish could not be started.",
    };
  }
}

export function resolvePikafishPath(
  input: ResolvePikafishPathInput = {},
): string | null {
  const env = input.env ?? process.env;
  const configured = env.PIKAFISH_PATH?.trim();

  if (configured) return configured;
  return null;
}

export function resolvePikafishEvalFile(
  enginePath: string,
  cwd = process.cwd(),
): string | null {
  const absoluteEnginePath = path.isAbsolute(enginePath)
    ? enginePath
    : path.resolve(cwd, enginePath);
  const candidateFiles = [
    path.join(path.dirname(absoluteEnginePath), PIKAFISH_EVAL_FILE),
    path.join(path.dirname(path.dirname(absoluteEnginePath)), PIKAFISH_EVAL_FILE),
    path.resolve(cwd, PIKAFISH_EVAL_FILE),
  ];
  const found = candidateFiles.find((candidate) => existsSync(candidate));

  if (!found) return null;

  const relative = path.relative(cwd, found);
  if (isRelativePathInsideCwd(relative)) {
    return toUciFilePath(relative);
  }

  return toUciFilePath(found);
}

export function toPikafishFen(fen?: string): string {
  const [boardPart, turnPart = "r", castling = "-", ep = "-", halfmove = "0", fullmove = "1"] =
    (fen ?? createInitialFen()).trim().split(/\s+/);
  const board = boardPart.replace(/[hHeE]/g, (piece) => FEN_TO_PIKAFISH_PIECES[piece] ?? piece);
  const turn = turnPart === "r" ? "w" : turnPart;

  return `${board} ${turn} ${castling} ${ep} ${halfmove} ${fullmove}`;
}

export function fromPikafishMove(move: string): string | null {
  const normalized = move.trim().toLowerCase();
  if (!PIKAFISH_MOVE_PATTERN.test(normalized)) return null;

  const converted = `${fromPikafishSquare(normalized.slice(0, 2))}${fromPikafishSquare(
    normalized.slice(2, 4),
  )}`;
  return INTERNAL_MOVE_PATTERN.test(converted) ? converted : null;
}

export function parsePikafishInfoLine(line: string): ParsedPikafishInfo | null {
  const parts = line.trim().split(/\s+/);
  if (parts[0] !== "info") return null;

  const parsed: ParsedPikafishInfo = {};
  const depthIndex = parts.indexOf("depth");
  if (depthIndex >= 0) parsed.depth = toInteger(parts[depthIndex + 1]);

  const scoreIndex = parts.indexOf("score");
  if (scoreIndex >= 0) {
    const scoreKind = parts[scoreIndex + 1];
    const rawScore = toInteger(parts[scoreIndex + 2]);
    if (typeof rawScore === "number") {
      parsed.score =
        scoreKind === "mate" ? mateScoreToEvaluation(rawScore) : rawScore;
    }
  }

  const pvIndex = parts.indexOf("pv");
  if (pvIndex >= 0) {
    parsed.pv = parts
      .slice(pvIndex + 1)
      .map(fromPikafishMove)
      .filter((move): move is string => Boolean(move))
      .slice(0, MAX_PV_MOVES);
  }

  return Object.keys(parsed).length ? parsed : null;
}

export function normalizePikafishPrincipalVariation(
  moveUci: string,
  pv: string[] | undefined,
): string[] {
  const normalizedPv = pv?.filter((move) => INTERNAL_MOVE_PATTERN.test(move)) ?? [];
  if (normalizedPv[0] !== moveUci) return [moveUci];
  return normalizedPv.slice(0, MAX_PV_MOVES);
}

function runPikafish(
  enginePath: string,
  fen: string,
  options: PikafishSearchOptions,
): Promise<PikafishSearchResult> {
  return new Promise((resolve, reject) => {
    const timeoutMs = Math.max(1_000, options.timeoutMs ?? PIKAFISH_TIMEOUT_MS);
    const difficulty = options.difficulty ?? "casual";
    const movetime = PIKAFISH_MOVETIME_MS[difficulty];
    const evalFile = resolvePikafishEvalFile(enginePath);
    const engine = spawn(enginePath, [], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let phase: "uci" | "ready" | "search" | "done" = "uci";
    let engineName = DEFAULT_ENGINE_NAME;
    let stderr = "";
    let stdoutBuffer = "";
    let lastInfo: ParsedPikafishInfo = {};
    let settled = false;

    const finish = (result: PikafishSearchResult) => {
      if (settled) return;
      settled = true;
      phase = "done";
      clearTimeout(timeout);
      writeCommand(engine, "quit");
      resolve(result);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      phase = "done";
      clearTimeout(timeout);
      engine.kill();
      reject(error);
    };

    const timeout = setTimeout(() => {
      fail(new Error("PIKAFISH_TIMEOUT"));
    }, timeoutMs);

    engine.once("error", (error) => {
      fail(new Error(`Failed to start Pikafish at ${enginePath}: ${error.message}`));
    });

    engine.once("spawn", () => {
      writeCommand(engine, "uci");
    });

    engine.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    engine.stdout.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString("utf8");
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        if (line.startsWith("id name ")) {
          engineName = line.slice("id name ".length).trim() || DEFAULT_ENGINE_NAME;
        }

        if (phase === "uci" && line === "uciok") {
          phase = "ready";
          if (evalFile) {
            writeCommand(engine, `setoption name EvalFile value ${evalFile}`);
          }
          writeCommand(engine, "isready");
          continue;
        }

        if (phase === "ready" && line === "readyok") {
          phase = "search";
          writeCommand(engine, "ucinewgame");
          writeCommand(engine, `position fen ${fen}`);
          writeCommand(engine, `go movetime ${movetime}`);
          continue;
        }

        if (phase === "search" && line.startsWith("info ")) {
          lastInfo = { ...lastInfo, ...parsePikafishInfoLine(line) };
          continue;
        }

        if (phase === "search" && line.startsWith("bestmove ")) {
          const rawBestMove = line.split(/\s+/)[1] ?? "";
          if (!rawBestMove || rawBestMove === "(none)" || rawBestMove === "0000") {
            fail(new Error(`Pikafish did not return a best move.${stderr ? ` ${stderr}` : ""}`));
            return;
          }

          finish({
            rawBestMove,
            score: lastInfo.score,
            depth: lastInfo.depth,
            pv: lastInfo.pv ?? [],
            engineName,
            moveUci: rawBestMove,
          });
        }
      }
    });

    engine.once("exit", (code) => {
      if (!settled) {
        fail(
          new Error(
            `Pikafish exited before returning a move with code ${code ?? "unknown"}.${
              stderr ? ` ${stderr}` : ""
            }`,
          ),
        );
      }
    });
  });
}

function writeCommand(
  engine: ReturnType<typeof spawn>,
  command: string,
): void {
  engine.stdin?.write(`${command}\n`);
}

function isRelativePathInsideCwd(relativePath: string): boolean {
  return (
    Boolean(relativePath) &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

function toUciFilePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function fromPikafishSquare(square: string): string {
  return `${square[0]}${9 - Number(square[1])}`;
}

function toInteger(value: string | undefined): number | undefined {
  if (!value || !/^-?\d+$/.test(value)) return undefined;
  return Number(value);
}

function mateScoreToEvaluation(mateIn: number): number {
  const sign = Math.sign(mateIn);
  if (sign === 0) return 0;
  return sign * (100_000 - Math.abs(mateIn));
}
