"use client";

import { Brain, RefreshCw, Swords, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Square } from "chess.js";
import {
  applyChessMove,
  CHESS_START_FEN,
  chooseAiChessMove,
  getChessBoard,
  getGameStatus,
  getLegalMoves,
  type ChessDifficulty,
  type ChessMoveRecord,
  type ChessSide,
} from "@/lib/chess-game";
import type { Provider } from "@/lib/ai";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const PIECE_SYMBOLS: Record<string, string> = {
  wp: "♙",
  wn: "♘",
  wb: "♗",
  wr: "♖",
  wq: "♕",
  wk: "♔",
  bp: "♟",
  bn: "♞",
  bb: "♝",
  br: "♜",
  bq: "♛",
  bk: "♚",
};

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function apiPath(path: string) {
  return `${BASE_PATH}${path}`;
}

const DEFAULT_MODEL = "gpt-5.4-mini";

export function ChessApp() {
  const [fen, setFen] = useState(CHESS_START_FEN);
  const [selected, setSelected] = useState<string | null>(null);
  const [moves, setMoves] = useState<ChessMoveRecord[]>([]);
  const [humanSide, setHumanSide] = useState<ChessSide>("w");
  const [difficulty, setDifficulty] = useState<ChessDifficulty>("club");
  const provider: Provider = "openai";
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [thinking, setThinking] = useState(false);
  const [coachText, setCoachText] = useState("AI Hub 模型密钥由 Hub 统一管理，本项目不接收用户 API Key。");
  const [coachLoading, setCoachLoading] = useState(false);

  const status = useMemo(() => getGameStatus(fen), [fen]);
  const board = useMemo(() => getChessBoard(fen), [fen]);
  const legalMoves = useMemo(() => getLegalMoves(fen, selected ?? undefined), [fen, selected]);
  const targetSquares = new Set(legalMoves.map((move) => move.to));
  const lastMove = moves[moves.length - 1];
  const isHumanTurn = status.turn === humanSide && !status.isGameOver && !thinking;

  function resetGame(nextSide = humanSide) {
    setFen(CHESS_START_FEN);
    setMoves([]);
    setSelected(null);
    setThinking(false);
    setCoachText("新对局已开始。选择棋子后，合法落点会亮起。");
    setHumanSide(nextSide);

    if (nextSide === "b") {
      window.setTimeout(() => playAiMove(CHESS_START_FEN), 180);
    }
  }

  useEffect(() => {
    let active = true;
    void fetch(apiPath("/api/provider/test"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider }),
    })
      .then(async (response) => {
        const data = (await response.json()) as { models?: string[] };
        if (!response.ok || !data.models?.[0]) throw new Error("Hub GPT 配置暂不可用。");
        if (active) setModel(data.models[0]);
      })
      .catch(() => {
        if (active) setCoachText("Hub GPT 配置暂不可用，棋局仍可继续。请稍后刷新页面重试。");
      });
    return () => {
      active = false;
    };
  }, [provider]);

  function handleSquareClick(square: string) {
    if (!isHumanTurn) return;

    if (!selected) {
      const piece = board.flat().find((item) => item?.square === square);
      if (piece?.color === humanSide) setSelected(square);
      return;
    }

    if (selected === square) {
      setSelected(null);
      return;
    }

    const legal = legalMoves.find((move) => move.to === square);
    if (!legal) {
      const piece = board.flat().find((item) => item?.square === square);
      setSelected(piece?.color === humanSide ? square : null);
      return;
    }

    try {
      const result = applyChessMove(fen, {
        from: selected,
        to: square,
        promotion: legal.promotion || "q",
      });
      const nextMoves = [...moves, result.record];
      setFen(result.fen);
      setMoves(nextMoves);
      setSelected(null);
      setCoachText(`你下了 ${result.record.san}。需要时可以让 Hub 教练讲解这步棋。`);

      if (!getGameStatus(result.fen).isGameOver) {
        window.setTimeout(() => playAiMove(result.fen, nextMoves), 260);
      }
    } catch {
      setCoachText("这步棋不合法。请重新选择棋子和目标格。");
    }
  }

  function playAiMove(currentFen: string, currentMoves = moves) {
    setThinking(true);
    window.setTimeout(() => {
      const aiMove = chooseAiChessMove(currentFen, difficulty);
      if (!aiMove) {
        setThinking(false);
        return;
      }

      setFen(aiMove.after);
      setMoves([...currentMoves, aiMove]);
      setCoachText(`AI 下了 ${aiMove.san}。Hub 教练可以解释它的意图。`);
      setThinking(false);
    }, 220);
  }

  async function askCoach() {
    if (!lastMove) {
      setCoachText("先下一步棋，再让教练讲解。");
      return;
    }

    setCoachLoading(true);
    setCoachText("正在通过 AI Project Hub 请求模型讲解...");
    try {
      const response = await fetch(apiPath("/api/coach"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          fenBefore: lastMove.before,
          fenAfter: lastMove.after,
          moveHistory: moves.map((move) => move.san),
          playedBy: lastMove.color === humanSide ? "human" : "ai",
          side: lastMove.color,
          moveSan: lastMove.san,
          moveUci: lastMove.uci,
          result: status.result,
        }),
      });
      const data = (await response.json()) as { explanation?: string; error?: { message?: string } };
      if (!response.ok || !data.explanation) {
        throw new Error(data.error?.message || "Coach request failed.");
      }
      setCoachText(data.explanation);
    } catch (error) {
      setCoachText(error instanceof Error ? error.message : "教练讲解失败，请稍后再试。");
    } finally {
      setCoachLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="board-stage" aria-label="国际象棋棋盘">
        <header className="game-header">
          <div>
            <p className="eyebrow">AI Project Hub</p>
            <h1>AI 国际象棋</h1>
            <p className="game-subtitle">本地合法走子 + Hub 共享模型教练</p>
          </div>
          <div className="game-header-actions">
            <a className="hub-home-link" href="/hub/">
              AI HUB
            </a>
            <div className={`turn-pill ${thinking ? "thinking" : ""}`}>
              <Swords size={18} />
              {thinking ? "AI 思考中" : status.result}
            </div>
          </div>
        </header>

        <div className="chess-board" role="grid" aria-label="Chess board">
          {board.map((rank, rankIndex) =>
            rank.map((piece, fileIndex) => {
              const square = `${FILES[fileIndex]}${8 - rankIndex}` as Square;
              const isDark = (rankIndex + fileIndex) % 2 === 1;
              const isSelected = selected === square;
              const isTarget = targetSquares.has(square);
              const isLast =
                lastMove && (lastMove.from === square || lastMove.to === square);
              return (
                <button
                  type="button"
                  key={square}
                  className={[
                    "square",
                    isDark ? "dark" : "light",
                    isSelected ? "selected" : "",
                    isTarget ? "target" : "",
                    isLast ? "last" : "",
                  ].join(" ")}
                  onClick={() => handleSquareClick(square)}
                  aria-label={`${square}${piece ? ` ${piece.color}${piece.type}` : ""}`}
                >
                  {piece ? (
                    <span className={`piece ${piece.color}`}>
                      {PIECE_SYMBOLS[`${piece.color}${piece.type}`]}
                    </span>
                  ) : null}
                  <span className="coord">{square}</span>
                </button>
              );
            }),
          )}
        </div>
      </section>

      <aside className="control-rail" aria-label="对局控制">
        <section className="panel">
          <div className="panel-title">
            <Brain size={18} />
            <h2>对局设置</h2>
          </div>
          <div className="segmented">
            <button
              type="button"
              aria-pressed={humanSide === "w"}
              onClick={() => resetGame("w")}
            >
              执白
            </button>
            <button
              type="button"
              aria-pressed={humanSide === "b"}
              onClick={() => resetGame("b")}
            >
              执黑
            </button>
          </div>
          <label className="field">
            <span>AI 强度</span>
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as ChessDifficulty)}
            >
              <option value="beginner">入门</option>
              <option value="club">俱乐部</option>
              <option value="master">大师</option>
            </select>
          </label>
          <button type="button" className="secondary-button" onClick={() => resetGame()}>
            <RefreshCw size={16} />
            重开
          </button>
        </section>

        <section className="panel">
          <div className="panel-title">
            <Wand2 size={18} />
            <h2>Hub 教练</h2>
          </div>
          <div className="field model-readout">
            <span>Hub GPT</span>
            <output aria-label="当前 Hub GPT 模型">{model}</output>
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={coachLoading || !lastMove}
            onClick={askCoach}
          >
            <Wand2 size={16} />
            讲解上一手
          </button>
          <p className="coach-box">{coachText}</p>
        </section>

        <section className="panel history-panel">
          <h2>棋谱</h2>
          <ol className="move-list">
            {moves.map((move, index) => (
              <li key={`${move.uci}-${index}`}>
                <span>{index + 1}</span>
                <strong>{move.san}</strong>
                <em>{move.color === humanSide ? "你" : "AI"}</em>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </main>
  );
}
