"use client";

import { Brain, CircleDot, RefreshCw, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { Vertex } from "@sabaki/go-board";
import type { Provider } from "@/lib/ai";
import {
  applyGoMove,
  chooseAiGoMove,
  createGoState,
  getStoneCounts,
  listLegalGoMoves,
  otherPlayer,
  summarizeGoState,
  type GoDifficulty,
  type GoMoveRecord,
  type GoPlayer,
  type GoState,
  vertexKey,
} from "@/lib/go-game";

const PROVIDERS: Array<{ id: Provider; label: string; model: string }> = [
  { id: "deepseek", label: "DeepSeek", model: "deepseek-v4-flash" },
  { id: "openai", label: "GPT", model: "gpt-5.5" },
  { id: "anthropic", label: "Claude", model: "claude-opus-4-8" },
  { id: "gemini", label: "Gemini", model: "gemini-3.5-flash" },
];

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function apiPath(path: string) {
  return `${BASE_PATH}${path}`;
}

export function GoApp() {
  const [state, setState] = useState<GoState>(() => createGoState());
  const [records, setRecords] = useState<GoMoveRecord[]>([]);
  const [humanPlayer, setHumanPlayer] = useState<GoPlayer>("black");
  const [difficulty, setDifficulty] = useState<GoDifficulty>("club");
  const [provider, setProvider] = useState<Provider>("deepseek");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [thinking, setThinking] = useState(false);
  const [coachText, setCoachText] = useState("AI Hub 模型密钥由 Hub 统一管理，本项目不接收用户 API Key。");
  const [coachLoading, setCoachLoading] = useState(false);

  const legalMoveKeys = useMemo(
    () => new Set(listLegalGoMoves(state).map(vertexKey)),
    [state],
  );
  const stoneCounts = useMemo(() => getStoneCounts(state), [state]);
  const lastRecord = records[records.length - 1];
  const isGameOver = state.consecutivePasses >= 2;
  const isHumanTurn = state.next === humanPlayer && !thinking && !isGameOver;

  function resetGame(nextHuman = humanPlayer) {
    const nextState = createGoState();
    setState(nextState);
    setRecords([]);
    setThinking(false);
    setHumanPlayer(nextHuman);
    setCoachText("新对局已开始。黑棋先行，合法落点会保持可点。");

    if (nextHuman === "white") {
      window.setTimeout(() => playAiMove(nextState, []), 180);
    }
  }

  function handleProviderChange(nextProvider: Provider) {
    setProvider(nextProvider);
    const preset = PROVIDERS.find((item) => item.id === nextProvider);
    if (preset) setModel(preset.model);
  }

  function handlePointClick(vertex: Vertex) {
    if (!isHumanTurn || !legalMoveKeys.has(vertexKey(vertex))) return;
    playMove(vertex, "human");
  }

  function passTurn() {
    if (!isHumanTurn) return;
    playMove("pass", "human");
  }

  function playMove(vertex: Vertex | "pass", actor: "human" | "ai") {
    try {
      const result = applyGoMove(state, vertex);
      const nextRecords = [...records, result.record];
      setState(result.state);
      setRecords(nextRecords);
      setCoachText(
        result.record.pass
          ? `${actor === "human" ? "你" : "AI"} 选择停一手。`
          : `${actor === "human" ? "你" : "AI"} 下在 ${result.record.coord}。`,
      );

      if (actor === "human" && result.state.next !== humanPlayer && result.state.consecutivePasses < 2) {
        window.setTimeout(() => playAiMove(result.state, nextRecords), 260);
      }
    } catch (error) {
      setCoachText(error instanceof Error ? error.message : "这手棋不合法。");
    }
  }

  function playAiMove(currentState: GoState, currentRecords: GoMoveRecord[]) {
    setThinking(true);
    window.setTimeout(() => {
      try {
        const picked = chooseAiGoMove(currentState, difficulty);
        const result = applyGoMove(currentState, picked);
        setState(result.state);
        setRecords([...currentRecords, result.record]);
        setCoachText(result.record.pass ? "AI 停一手。" : `AI 下在 ${result.record.coord}。`);
      } catch (error) {
        setCoachText(error instanceof Error ? error.message : "AI 无法完成落子。");
      } finally {
        setThinking(false);
      }
    }, 220);
  }

  async function askCoach() {
    if (!lastRecord) {
      setCoachText("先下一手，再让教练讲解。");
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
          boardBefore: lastRecord.boardBefore,
          boardAfter: lastRecord.boardAfter,
          moveHistory: records.map((record) => `${record.player}:${record.coord}`),
          playedBy: lastRecord.player === humanPlayer ? "human" : "ai",
          player: lastRecord.player,
          moveText: lastRecord.coord,
          captures: lastRecord.captures,
          result: isGameOver ? "Both sides passed; game ended by agreement." : "game continues",
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
      <section className="board-stage" aria-label="9路围棋棋盘">
        <header className="game-header">
          <div>
            <p className="eyebrow">AI Project Hub</p>
            <h1>AI 围棋 9路</h1>
            <p className="game-subtitle">合法落子、提子、禁自杀、禁立即打劫</p>
          </div>
          <div className={`turn-pill ${thinking ? "thinking" : ""}`}>
            <CircleDot size={18} />
            {isGameOver
              ? "双方停一手，对局结束"
              : thinking
                ? "AI 思考中"
                : state.next === "black"
                  ? "黑棋行棋"
                  : "白棋行棋"}
          </div>
        </header>

        <div className="go-board" role="grid" aria-label="Go board">
          {state.signMap.map((row, y) =>
            row.map((sign, x) => {
              const vertex: Vertex = [x, y];
              const key = vertexKey(vertex);
              const isLegal = legalMoveKeys.has(key);
              const isLast =
                lastRecord?.vertex &&
                lastRecord.vertex[0] === x &&
                lastRecord.vertex[1] === y;
              return (
                <button
                  type="button"
                  key={key}
                  className={[
                    "point",
                    sign === 1 ? "black" : "",
                    sign === -1 ? "white" : "",
                    isLegal && isHumanTurn ? "legal" : "",
                    isLast ? "last" : "",
                  ].join(" ")}
                  onClick={() => handlePointClick(vertex)}
                  aria-label={`${x + 1},${y + 1}`}
                >
                  {sign !== 0 ? <span className="stone" /> : null}
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
              aria-pressed={humanPlayer === "black"}
              onClick={() => resetGame("black")}
            >
              执黑
            </button>
            <button
              type="button"
              aria-pressed={humanPlayer === "white"}
              onClick={() => resetGame("white")}
            >
              执白
            </button>
          </div>
          <label className="field">
            <span>AI 强度</span>
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as GoDifficulty)}
            >
              <option value="beginner">入门</option>
              <option value="club">棋会</option>
              <option value="dan">段位感</option>
            </select>
          </label>
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={() => resetGame()}>
              <RefreshCw size={16} />
              重开
            </button>
            <button type="button" className="secondary-button" onClick={passTurn} disabled={!isHumanTurn}>
              停一手
            </button>
          </div>
        </section>

        <section className="panel stats">
          <h2>局面</h2>
          <div className="stats-grid">
            <div>
              <span>黑子</span>
              <strong>{stoneCounts.black}</strong>
            </div>
            <div>
              <span>白子</span>
              <strong>{stoneCounts.white}</strong>
            </div>
            <div>
              <span>黑提</span>
              <strong>{state.captures.black}</strong>
            </div>
            <div>
              <span>白提</span>
              <strong>{state.captures.white}</strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">
            <Wand2 size={18} />
            <h2>Hub 教练</h2>
          </div>
          <label className="field">
            <span>模型供应商</span>
            <select
              value={provider}
              onChange={(event) => handleProviderChange(event.target.value as Provider)}
            >
              {PROVIDERS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>模型</span>
            <input value={model} onChange={(event) => setModel(event.target.value)} />
          </label>
          <button
            type="button"
            className="primary-button"
            disabled={coachLoading || !lastRecord}
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
            {records.map((record, index) => (
              <li key={`${record.player}-${record.coord}-${index}`}>
                <span>{index + 1}</span>
                <strong>
                  {record.player === "black" ? "黑" : "白"} {record.coord}
                </strong>
                <em>{record.player === humanPlayer ? "你" : "AI"}</em>
              </li>
            ))}
          </ol>
          <pre className="sr-summary">{summarizeGoState(state)}</pre>
        </section>
      </aside>
    </main>
  );
}
