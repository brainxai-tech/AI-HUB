"use client";

import {
  ArrowLeft,
  BookOpenText,
  Bot,
  Brain,
  CheckCircle2,
  Gauge,
  Lightbulb,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  applyUciMove,
  createInitialFen,
  createXiangqi,
  getBoardSquares,
  getGameStatus,
  getLegalUciMoves,
  getPieceAt,
  type XiangqiGameStatus,
  type XiangqiPiece,
  type XiangqiSide,
  type XiangqiSquare,
} from "@/lib/xiangqi";
import type { XiangqiDifficulty } from "@/lib/xiangqi-engine";
import type { Provider } from "@/lib/ai";

type Message = {
  tone: "info" | "success" | "error";
  text: string;
};

type ApiErrorBody = {
  error?: {
    message?: string;
  };
};

type EngineInfo = {
  reason?: string;
  score?: number;
  depth?: number;
  pv?: string[];
  engineName?: string;
  source?: "heuristic" | "pikafish";
  difficulty?: XiangqiDifficulty;
};

type AiMoveResponse = {
  moveUci: string;
  display: string;
  fen: string;
  history: string[];
  status: XiangqiGameStatus;
  reason?: string;
  explanationSource?: "model" | "engine";
  explanationError?: string;
  engine?: EngineInfo;
};

type HintResponse = {
  moveUci: string;
  display: string;
  from: XiangqiSquare;
  to: XiangqiSquare;
  reason?: string;
  score?: number;
  depth?: number;
  pv?: string[];
  engineName?: string;
  source?: "heuristic" | "pikafish";
};

type MoveExplanationResponse = {
  explanation: string;
};

type GameReviewResponse = {
  review: string;
};

type PostGameMoveAnalysisResponse = {
  selectedMove: {
    moveUci: string;
    display: string;
    by: "player" | "engine";
    fenAfter: string;
  };
  recommendation: HintResponse & {
    fenAfter: string;
  };
  explanation?: string;
  explanationError?: string;
};

type PendingMoveExplanation = {
  fenBefore: string;
  moveHistoryBefore: string[];
  aiColor: XiangqiSide;
  moveUci: string;
  display: string;
  engineReason: string;
  engine?: EngineInfo;
};

type MoveRecord = {
  display: string;
  uci: string;
  by: "player" | "engine";
  fenAfter: string;
  engineScore?: number;
  engineDepth?: number;
  enginePv?: string[];
};

type LastMove = {
  from: XiangqiSquare;
  to: XiangqiSquare;
  by: "player" | "engine";
  display?: string;
};

type GameReviewState = {
  status: "idle" | "loading" | "ready" | "error";
  text: string;
  error?: string;
};

type PostGameAnalysisState = {
  status: "idle" | "loading" | "ready" | "error";
  moveIndex?: number;
  response?: PostGameMoveAnalysisResponse;
  error?: string;
};

type MoveReviewTarget = {
  index: number;
  moveNumber: number;
  sideLabel: "红方" | "黑方";
  fenBefore: string;
  fenAfter: string;
  historyBefore: string[];
  record: MoveRecord;
};

type AppView = "setup" | "game";
type BoardThemeId = "ink" | "classic";

const LEGACY_STORAGE_KEY = "ai-xiangqi-duel-api-key";
const LEGACY_REMEMBER_KEY = "ai-xiangqi-duel-remember-key";
const DEFAULT_MODEL = "gpt-5.4-mini";
const DEFAULT_PROVIDER: Provider = "openai";
const HUB_MODEL_LABEL = "Hub GPT";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function apiPath(path: string) {
  return `${BASE_PATH}${path}`;
}

const MAX_ENGINE_PV_MOVES = 20;

const BOARD_THEME_OPTIONS: Array<{
  id: BoardThemeId;
  label: string;
  note: string;
}> = [
  { id: "ink", label: "现代训练盘", note: "清楚高对比" },
  { id: "classic", label: "经典木纹盘", note: "安静耐看" },
];

const DIFFICULTIES: Array<{
  id: XiangqiDifficulty;
  label: string;
  note: string;
  profile: string;
}> = [
  {
    id: "beginner",
    label: "入门",
    note: "会犯错",
    profile: "适合练基本走法和吃子",
  },
  {
    id: "casual",
    label: "日常",
    note: "稳但不压迫",
    profile: "适合轻松对局",
  },
  {
    id: "club",
    label: "高手",
    note: "更重视局势",
    profile: "适合认真训练",
  },
  {
    id: "master",
    label: "大师",
    note: "更深搜索",
    profile: "适合挑战和复盘",
  },
];

const PIECE_LABELS: Record<XiangqiSide, Record<string, string>> = {
  r: {
    king: "帅",
    advisor: "仕",
    bishop: "相",
    horse: "马",
    rook: "车",
    cannon: "炮",
    pawn: "兵",
  },
  b: {
    king: "将",
    advisor: "士",
    bishop: "象",
    horse: "马",
    rook: "车",
    cannon: "炮",
    pawn: "卒",
  },
};

export function XiangqiApp() {
  const [appView, setAppView] = useState<AppView>("setup");
  const provider: Provider = DEFAULT_PROVIDER;
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [playerColor, setPlayerColor] = useState<XiangqiSide>("r");
  const [boardTheme, setBoardTheme] = useState<BoardThemeId>("ink");
  const [difficulty, setDifficulty] = useState<XiangqiDifficulty>("casual");
  const [fen, setFen] = useState(createInitialFen);
  const [history, setHistory] = useState<string[]>([]);
  const [moveRecords, setMoveRecords] = useState<MoveRecord[]>([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<XiangqiSquare | null>(null);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isHintLoading, setIsHintLoading] = useState(false);
  const [isExplanationLoading, setIsExplanationLoading] = useState(false);
  const [message, setMessage] = useState<Message>({
    tone: "info",
    text: "选择棋盘、执棋方和 AI 难度后即可开始。模型讲解是可选项。",
  });
  const [aiReason, setAiReason] = useState("");
  const [aiExplanationSource, setAiExplanationSource] = useState<
    "model" | "engine" | null
  >(null);
  const [explanationError, setExplanationError] = useState("");
  const [engineInfo, setEngineInfo] = useState<EngineInfo | null>(null);
  const [hint, setHint] = useState<HintResponse | null>(null);
  const [pendingMoveExplanation, setPendingMoveExplanation] =
    useState<PendingMoveExplanation | null>(null);
  const [reviewedMoveIndex, setReviewedMoveIndex] = useState<number | null>(null);
  const [gameReviewState, setGameReviewState] = useState<GameReviewState>({
    status: "idle",
    text: "",
  });
  const [postGameAnalysisState, setPostGameAnalysisState] =
    useState<PostGameAnalysisState>({ status: "idle" });
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  const status = useMemo(() => getGameStatus(fen), [fen]);
  const aiColor: XiangqiSide = playerColor === "r" ? "b" : "r";
  const selectedDifficulty =
    DIFFICULTIES.find((item) => item.id === difficulty) ?? DIFFICULTIES[1];
  const selectedTheme =
    BOARD_THEME_OPTIONS.find((item) => item.id === boardTheme) ??
    BOARD_THEME_OPTIONS[0];
  const selectedProvider = { label: HUB_MODEL_LABEL };
  const boardSquares = useMemo(() => getBoardSquares(playerColor), [playerColor]);
  const legalMoves = useMemo(() => getLegalUciMoves(fen), [fen]);
  const selectedMoves = useMemo(
    () =>
      selectedSquare
        ? legalMoves.filter((move) => move.startsWith(selectedSquare))
        : [],
    [legalMoves, selectedSquare],
  );
  const targetSquares = useMemo(
    () => new Set(selectedMoves.map((move) => move.slice(2, 4))),
    [selectedMoves],
  );
  const reviewedMove = useMemo(
    () => getMoveReviewTarget(moveRecords, history, reviewedMoveIndex),
    [history, moveRecords, reviewedMoveIndex],
  );
  const activePostGameResponse =
    postGameAnalysisState.status === "ready" &&
    postGameAnalysisState.moveIndex === reviewedMoveIndex
      ? postGameAnalysisState.response
      : undefined;
  const boardFen = activePostGameResponse && reviewedMove
    ? reviewedMove.fenBefore
    : reviewedMove?.fenAfter ?? fen;
  const boardStatus = useMemo(() => getGameStatus(boardFen), [boardFen]);
  const boardLastMove =
    activePostGameResponse && reviewedMove
      ? null
      : reviewedMove
        ? moveRecordToLastMove(reviewedMove.record)
        : lastMove;
  const boardHintMove = activePostGameResponse?.recommendation
    ? {
        from: activePostGameResponse.recommendation.from,
        to: activePostGameResponse.recommendation.to,
      }
    : reviewedMove
      ? null
      : hint;
  const isPostGame = status.isGameOver;
  const isAiTurn = gameStarted && !status.isGameOver && status.turn === aiColor;
  const isPlayerTurn =
    gameStarted &&
    !status.isGameOver &&
    !isAiThinking &&
    !isHintLoading &&
    status.turn === playerColor;

  useEffect(() => {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(LEGACY_REMEMBER_KEY);
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
    void testProvider();
  }, []);

  async function testProvider() {
    setIsTestingKey(true);
    setMessage({ tone: "info", text: `正在读取 AI Hub 的 ${selectedProvider.label} 配置。` });

    try {
      const response = await fetch(apiPath("/api/provider/test"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model }),
      });
      const data = (await response.json()) as
        | { ok: true; models: string[]; selectedModelAvailable: boolean | null }
        | ApiErrorBody;

      if (!response.ok || !("ok" in data)) {
        throw new Error(getApiErrorMessage(data, `${selectedProvider.label} 连接测试失败。`));
      }

      if (!data.models[0]) throw new Error("AI Hub 尚未给本游戏分配 GPT 模型。");
      setModel(data.models[0]);

      setMessage({
        tone: data.selectedModelAvailable === false ? "info" : "success",
        text:
          data.selectedModelAvailable === false
            ? "AI Hub 可用，但当前模型不在模型列表里。"
            : "AI Hub 模型配置可用，可以生成讲解。",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : `${selectedProvider.label} 连接测试失败。`,
      });
    } finally {
      setIsTestingKey(false);
    }
  }

  function startGame() {
    const startingFen = createInitialFen();
    setFen(startingFen);
    setHistory([]);
    setMoveRecords([]);
    setGameStarted(true);
    setAppView("game");
    setSelectedSquare(null);
    setLastMove(null);
    setIsHintLoading(false);
    setIsExplanationLoading(false);
    setHint(null);
    setAiReason("");
    setAiExplanationSource(null);
    setExplanationError("");
    setEngineInfo(null);
    setPendingMoveExplanation(null);
    setReviewedMoveIndex(null);
    setPostGameAnalysisState({ status: "idle" });
    setGameReviewState({ status: "idle", text: "" });
    setIsReviewModalOpen(false);
    setMessage({
      tone: "info",
      text: playerColor === "r" ? "你执红先行。" : "AI 执红先行。",
    });

    if (playerColor === "b") {
      void requestAiMove(startingFen, []);
    }
  }

  function resetGame() {
    setFen(createInitialFen());
    setHistory([]);
    setMoveRecords([]);
    setGameStarted(false);
    setSelectedSquare(null);
    setLastMove(null);
    setHint(null);
    setAiReason("");
    setAiExplanationSource(null);
    setExplanationError("");
    setEngineInfo(null);
    setPendingMoveExplanation(null);
    setReviewedMoveIndex(null);
    setPostGameAnalysisState({ status: "idle" });
    setGameReviewState({ status: "idle", text: "" });
    setIsReviewModalOpen(false);
    setAppView("setup");
    setMessage({ tone: "info", text: "已回到配置页，可以重新开局。" });
  }

  function handleSquareClick(square: XiangqiSquare) {
    if (!isPlayerTurn || reviewedMove) return;

    const piece = getPieceAt(fen, square);
    if (!selectedSquare) {
      if (piece?.color === playerColor) setSelectedSquare(square);
      return;
    }

    if (piece?.color === playerColor && square !== selectedSquare) {
      setSelectedSquare(square);
      return;
    }

    const chosenMove = selectedMoves.find((move) => move.slice(2, 4) === square);
    if (!chosenMove) {
      setSelectedSquare(null);
      return;
    }

    const result = applyUciMove(fen, chosenMove, history);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error.message });
      setSelectedSquare(null);
      return;
    }

    setFen(result.fen);
    setHistory(result.history);
    setMoveRecords((records) => [
      ...records,
      {
        by: "player",
        display: result.move.display,
        uci: result.move.uci,
        fenAfter: result.fen,
      },
    ]);
    setSelectedSquare(null);
    setLastMove({
      from: result.move.from,
      to: result.move.to,
      by: "player",
      display: result.move.display,
    });
    setHint(null);
    setAiReason("");
    setAiExplanationSource(null);
    setExplanationError("");
    setEngineInfo(null);
    setPendingMoveExplanation(null);

    if (result.status.isGameOver) {
      setMessage({ tone: "success", text: describeStatus(result.status) });
      return;
    }

    void requestAiMove(result.fen, result.history);
  }

  async function requestAiMove(currentFen: string, currentHistory: string[]) {
    setIsAiThinking(true);
    setMessage({ tone: "info", text: "Pikafish 正在计算下一手。" });

    try {
      const response = await fetch(apiPath("/api/ai/move"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          moveSource: "xiangqi-engine",
          model,
          explainWithModel: false,
          engineDifficulty: difficulty,
          fen: currentFen,
          moveHistory: currentHistory,
          playerColor,
        }),
      });
      const data = (await response.json()) as AiMoveResponse | ApiErrorBody;

      if (!response.ok || !("moveUci" in data)) {
        throw new Error(getApiErrorMessage(data, "AI 没有返回合法走法。"));
      }

      const from = data.moveUci.slice(0, 2);
      const to = data.moveUci.slice(2, 4);
      setFen(data.fen);
      setHistory(data.history);
      setMoveRecords((records) => [
        ...records,
        {
          by: "engine",
          display: data.display,
          uci: data.moveUci,
          fenAfter: data.fen,
          engineScore: data.engine?.score,
          engineDepth: data.engine?.depth,
          enginePv: trimEnginePv(data.engine?.pv),
        },
      ]);
      setLastMove({ from, to, by: "engine", display: data.display });
      setHint(null);
      setAiReason("");
      setAiExplanationSource(null);
      setExplanationError(data.explanationError ?? "");
      setEngineInfo(data.engine ?? null);
      setPendingMoveExplanation({
        fenBefore: currentFen,
        moveHistoryBefore: currentHistory,
        aiColor,
        moveUci: data.moveUci,
        display: data.display,
        engineReason: data.engine?.reason ?? data.reason ?? "AI 选择当前候选走法。",
        engine: data.engine,
      });
      setMessage({
        tone: "success",
        text: data.status.isGameOver
          ? describeStatus(data.status)
          : `AI 落子：${data.display}。需要时可生成 ${selectedProvider.label} 讲解。`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "AI 请求失败。",
      });
    } finally {
      setIsAiThinking(false);
    }
  }

  async function requestHint() {
    if (!isPlayerTurn) {
      setMessage({ tone: "info", text: "只有轮到你走时才能请求提示。" });
      return;
    }

    setIsHintLoading(true);
    setHint(null);
    setSelectedSquare(null);
    setMessage({ tone: "info", text: "Pikafish 正在给你找一手建议。" });

    try {
      const response = await fetch(apiPath("/api/ai/hint"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fen,
          moveHistory: history,
          playerColor,
          engineDifficulty: "master",
        }),
      });
      const data = (await response.json()) as HintResponse | ApiErrorBody;

      if (!response.ok || !("moveUci" in data)) {
        throw new Error(getApiErrorMessage(data, "AI 没有返回提示。"));
      }

      setHint(data);
      setSelectedSquare(data.from);
      setMessage({ tone: "success", text: `提示：${data.display}` });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "提示请求失败。",
      });
    } finally {
      setIsHintLoading(false);
    }
  }

  async function requestMoveExplanation() {
    if (!pendingMoveExplanation) return;

    setIsExplanationLoading(true);
    setExplanationError("");
    setMessage({ tone: "info", text: "正在生成本步讲解。" });

    try {
      const response = await fetch(apiPath("/api/ai/explanation"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          fenBefore: pendingMoveExplanation.fenBefore,
          moveHistoryBefore: pendingMoveExplanation.moveHistoryBefore,
          aiColor: pendingMoveExplanation.aiColor,
          moveUci: pendingMoveExplanation.moveUci,
          displayMove: pendingMoveExplanation.display,
          score: pendingMoveExplanation.engine?.score,
          depth: pendingMoveExplanation.engine?.depth,
          pv: pendingMoveExplanation.engine?.pv,
          engineReason: pendingMoveExplanation.engineReason,
        }),
      });
      const data = (await response.json()) as MoveExplanationResponse | ApiErrorBody;

      if (!response.ok || !("explanation" in data)) {
        throw new Error(getApiErrorMessage(data, `${selectedProvider.label} 讲解生成失败。`));
      }

      setAiReason(data.explanation);
      setAiExplanationSource("model");
      setMessage({ tone: "success", text: `${selectedProvider.label} 已生成本步讲解。` });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : `${selectedProvider.label} 讲解生成失败。`;
      setExplanationError(errorMessage);
      setMessage({ tone: "error", text: errorMessage });
    } finally {
      setIsExplanationLoading(false);
    }
  }

  async function requestGameReview() {
    setIsReviewModalOpen(true);

    setGameReviewState({ status: "loading", text: "" });

    try {
      const response = await fetch(apiPath("/api/ai/game-review"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          playerColor,
          result: status.result,
          reason: status.reason,
          finalFen: fen,
          moveHistory: history,
          moveRecords: toReviewMoveRecords(moveRecords),
        }),
      });
      const data = (await response.json()) as GameReviewResponse | ApiErrorBody;

      if (!response.ok || !("review" in data)) {
        throw new Error(getApiErrorMessage(data, `${selectedProvider.label} 赛后复盘失败。`));
      }

      setGameReviewState({ status: "ready", text: data.review });
    } catch (error) {
      setGameReviewState({
        status: "error",
        text: "",
        error: error instanceof Error ? error.message : `${selectedProvider.label} 赛后复盘失败。`,
      });
    }
  }

  function selectReviewedMove(index: number) {
    if (!status.isGameOver) return;
    const target = getMoveReviewTarget(moveRecords, history, index);
    if (!target) return;

    setReviewedMoveIndex(index);
    setPostGameAnalysisState((current) =>
      current.moveIndex === index ? current : { status: "idle", moveIndex: index },
    );
    setSelectedSquare(null);
    setHint(null);
    setMessage({
      tone: "info",
      text: `已跳到第 ${target.moveNumber} 手：${target.sideLabel} ${target.record.display}`,
    });
  }

  async function requestPostGameMoveAnalysis() {
    if (!status.isGameOver || !reviewedMove) {
      setMessage({ tone: "info", text: "请先在赛后棋谱里选择一步。" });
      return;
    }

    setPostGameAnalysisState({
      status: "loading",
      moveIndex: reviewedMove.index,
    });
      setMessage({ tone: "info", text: "Pikafish 正在分析这一手。" });

    try {
      const response = await fetch(apiPath("/api/ai/post-game-analysis"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          fenBefore: reviewedMove.fenBefore,
          moveHistoryBefore: reviewedMove.historyBefore,
          selectedMoveUci: reviewedMove.record.uci,
          selectedMoveDisplay: reviewedMove.record.display,
          selectedMoveBy: reviewedMove.record.by,
          engineDifficulty: "master",
        }),
      });
      const data = (await response.json()) as
        | PostGameMoveAnalysisResponse
        | ApiErrorBody;

      if (!response.ok || !("recommendation" in data)) {
        throw new Error(getApiErrorMessage(data, "赛后单手分析失败。"));
      }

      setPostGameAnalysisState({
        status: "ready",
        moveIndex: reviewedMove.index,
        response: data,
      });
      setMessage({
        tone: data.explanation ? "success" : "info",
        text: data.explanation
          ? `推荐：${data.recommendation.display}，${selectedProvider.label} 已解释。`
          : `推荐：${data.recommendation.display}。AI Hub 暂未返回模型解释。`,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "赛后单手分析失败。";
      setPostGameAnalysisState({
        status: "error",
        moveIndex: reviewedMove.index,
        error: errorMessage,
      });
      setMessage({ tone: "error", text: errorMessage });
    }
  }

  if (appView === "setup") {
    return (
      <main className="setup-shell">
        <section className="setup-panel" aria-labelledby="setup-title">
          <div className="setup-intro">
            <a className="hub-home-link" href="/hub/">
              返回 AI HUB
            </a>
            <p className="eyebrow">AI Xiangqi Duel</p>
            <h1 id="setup-title">现代棋院分析桌</h1>
            <p className="setup-copy">
              选边、定棋力、开局。Pikafish 负责对弈，多模型教练负责复盘讲解。
            </p>
          </div>

          <PreviewBoard boardTheme={boardTheme} />

          <div className="setup-grid">
            <section className="setup-section">
              <h2>棋盘</h2>
              <div className="choice-grid">
                {BOARD_THEME_OPTIONS.map((theme) => (
                  <button
                    aria-pressed={boardTheme === theme.id}
                    className={boardTheme === theme.id ? "choice active" : "choice"}
                    key={theme.id}
                    onClick={() => setBoardTheme(theme.id)}
                    type="button"
                  >
                    <strong>{theme.label}</strong>
                    <span>{theme.note}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="setup-section">
              <h2>执棋方</h2>
              <div className="segmented">
                <button
                  aria-pressed={playerColor === "r"}
                  onClick={() => setPlayerColor("r")}
                  type="button"
                >
                  红方先行
                </button>
                <button
                  aria-pressed={playerColor === "b"}
                  onClick={() => setPlayerColor("b")}
                  type="button"
                >
                  黑方后手
                </button>
              </div>
            </section>

            <section className="setup-section">
              <h2>AI 难度</h2>
              <div className="choice-grid difficulty-grid">
                {DIFFICULTIES.map((item) => (
                  <button
                    aria-pressed={difficulty === item.id}
                    className={difficulty === item.id ? "choice active" : "choice"}
                    key={item.id}
                    onClick={() => setDifficulty(item.id)}
                    type="button"
                  >
                    <strong>{item.label}</strong>
                    <span>{item.note}</span>
                  </button>
                ))}
              </div>
              <p className="muted">{selectedDifficulty.profile}</p>
            </section>

            <details className="setup-section provider-section advanced-section">
              <summary>
                <span>模型教练</span>
                <strong>可选</strong>
              </summary>
              <div className="advanced-content">
                <div className="field model-readout">
                  <span>Hub GPT</span>
                  <output aria-label="当前 Hub GPT 模型">{model}</output>
                </div>
                <p className="muted">
                  模型密钥由 AI Hub 统一托管，本页面不会读取、保存或发送浏览器 API Key。
                </p>
                <div className="button-row">
                  <button
                    className="secondary-button"
                    disabled={isTestingKey}
                    onClick={() => void testProvider()}
                    type="button"
                  >
                    {isTestingKey ? (
                      <Loader2 aria-hidden="true" className="spin" size={17} />
                    ) : (
                      <ShieldCheck aria-hidden="true" size={17} />
                    )}
                    测试 Hub 配置
                  </button>
                </div>
              </div>
            </details>
          </div>

          <div className={`status-line ${message.tone}`} role="status">
            {message.text}
          </div>

          <button className="primary-button start-button" onClick={startGame} type="button">
            <Play aria-hidden="true" size={18} />
            开局
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={`app-shell ${isPostGame ? "review-mode" : "play-mode"}`}>
      <section
        className={[
          "board-stage",
          isAiThinking ? "thinking" : "",
          boardStatus.isCheck ? "in-check" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-labelledby="game-title"
      >
        <div className="game-header">
          <div>
            <p className="eyebrow">AI Xiangqi Duel</p>
            <h1 id="game-title">中国象棋 AI 对弈</h1>
            <p className="game-subtitle">{sideLabel(playerColor)}在下，AI 执{sideLabel(aiColor)}</p>
          </div>
          <div className="game-header-actions">
            <a className="hub-home-link" href="/hub/">
              AI HUB
            </a>
            <div className={`turn-pill ${isAiThinking ? "thinking" : ""}`}>
              {isAiThinking ? (
                <Loader2 aria-hidden="true" className="spin" size={18} />
              ) : (
                <Bot aria-hidden="true" size={18} />
              )}
              <span>{getTurnLabel(status, playerColor, gameStarted)}</span>
            </div>
          </div>
        </div>

        <XiangqiBoard
          boardFen={boardFen}
          boardSquares={boardSquares}
          boardTheme={boardTheme}
          disabled={!isPlayerTurn}
          hintMove={boardHintMove}
          lastMove={boardLastMove}
          onSquareClick={handleSquareClick}
          playerColor={playerColor}
          selectedSquare={selectedSquare}
          status={boardStatus}
          targetSquares={reviewedMove ? new Set<string>() : targetSquares}
        />

        <EngineInsightStrip
          difficultyLabel={selectedDifficulty.label}
          engineInfo={engineInfo}
          isAiThinking={isAiThinking}
          lastMove={lastMove}
          pendingMoveExplanation={pendingMoveExplanation}
        />

        <div className={`status-line ${message.tone}`} role="status">
          {message.text}
        </div>
      </section>

      <aside className="analysis-rail" aria-label="对局信息">
        <section className="rail-section">
          <div className="block-title">
            <CheckCircle2 aria-hidden="true" size={18} />
            <h2>{isPostGame ? "终局" : "棋局"}</h2>
          </div>

          <div className="match-summary-grid">
            <div>
              <Bot aria-hidden="true" size={16} />
              <span>AI</span>
              <strong>{sideLabel(aiColor)}</strong>
            </div>
            <div>
              <Gauge aria-hidden="true" size={16} />
              <span>难度</span>
              <strong>{selectedDifficulty.label}</strong>
            </div>
            <div>
              <ShieldCheck aria-hidden="true" size={16} />
              <span>棋盘</span>
              <strong>{selectedTheme.label}</strong>
            </div>
            <div>
              <Brain aria-hidden="true" size={16} />
              <span>模型</span>
              <strong>{model}</strong>
            </div>
          </div>

          <div className="button-row">
            <button
              className="secondary-button"
              disabled={isAiThinking}
              onClick={resetGame}
              type="button"
            >
              <ArrowLeft aria-hidden="true" size={17} />
              配置
            </button>
            <button
              className="secondary-button"
              disabled={isAiThinking}
              onClick={startGame}
              type="button"
            >
              <RotateCcw aria-hidden="true" size={17} />
              新局
            </button>
          </div>

          {!isPostGame ? (
            <div className="primary-action-stack">
              <button
                className="secondary-button full-button"
                disabled={!isAiTurn || isAiThinking}
                onClick={() => void requestAiMove(fen, history)}
                type="button"
              >
                {isAiThinking ? (
                  <Loader2 aria-hidden="true" className="spin" size={17} />
                ) : (
                  <Brain aria-hidden="true" size={17} />
                )}
                Pikafish 走棋/重试
              </button>
              <button
                className="primary-button full-button"
                disabled={!isPlayerTurn || isHintLoading}
                onClick={() => void requestHint()}
                type="button"
              >
                {isHintLoading ? (
                  <Loader2 aria-hidden="true" className="spin" size={17} />
                ) : (
                  <Lightbulb aria-hidden="true" size={17} />
                )}
                求助 Pikafish
              </button>
            </div>
          ) : null}

          {hint && !isPostGame ? (
            <section className="analysis-box">
              <p className="hint-move">
                推荐 <strong>{hint.display}</strong>
              </p>
              {hint.reason ? <p className="muted">{hint.reason}</p> : null}
              <EngineFacts engineInfo={hint} />
            </section>
          ) : null}
        </section>

        {!isPostGame ? (
          <section className="rail-section">
            <div className="block-title">
              <Brain aria-hidden="true" size={18} />
              <h2>AI 讲解</h2>
              <span className={`source-badge ${aiExplanationSource === "model" ? "ready" : ""}`}>
                {isExplanationLoading
                  ? "生成中"
                  : aiExplanationSource === "model"
                    ? selectedProvider.label
                    : pendingMoveExplanation
                      ? "按需生成"
                      : "等待落子"}
              </span>
            </div>

            {pendingMoveExplanation ? (
              <button
                className="secondary-button full-button"
                disabled={isAiThinking || isExplanationLoading}
                onClick={() => void requestMoveExplanation()}
                type="button"
              >
                {isExplanationLoading ? (
                  <Loader2 aria-hidden="true" className="spin" size={17} />
                ) : (
                  <Brain aria-hidden="true" size={17} />
                )}
                {aiReason ? "重新生成讲解" : "生成本步讲解"}
              </button>
            ) : null}

            {aiReason || pendingMoveExplanation || engineInfo ? (
              <section className="analysis-box">
                {aiReason ? (
                  <p className="analysis-text">{aiReason}</p>
                ) : pendingMoveExplanation ? (
                  <p className="muted">本步尚未生成模型讲解。</p>
                ) : null}
                {engineInfo ? <EngineFacts engineInfo={engineInfo} /> : null}
                {explanationError ? (
                  <p className="analysis-warning">讲解未完成：{explanationError}</p>
                ) : null}
              </section>
            ) : (
              <p className="muted">AI 落子后，可在这里生成中文教练讲解。</p>
            )}
          </section>
        ) : null}

        {!isPostGame ? (
          <details className="rail-section history-section">
            <summary>
              <span>棋谱</span>
              <strong>{moveRecords.length ? `${moveRecords.length} 手` : "尚未开始"}</strong>
            </summary>
            {moveRecords.length ? (
              <MoveHistoryList
                isReviewEnabled={false}
                moveRecords={moveRecords}
                onSelect={selectReviewedMove}
                reviewedMoveIndex={reviewedMoveIndex}
              />
            ) : (
              <p className="muted">开局后会记录每一步。</p>
            )}
          </details>
        ) : null}

        {isPostGame ? (
          <>
            <section className="rail-section">
              <div className="block-title">
                <BookOpenText aria-hidden="true" size={18} />
                <h2>赛后分析</h2>
                <span className="source-badge ready">可复盘</span>
              </div>
              <div className="review-result">
                <span>当前回看</span>
                <strong>
                  {reviewedMove
                    ? `第 ${reviewedMove.moveNumber} 手 ${reviewedMove.sideLabel} ${reviewedMove.record.display}`
                    : "最终局面"}
                </strong>
              </div>
              <div className="button-row">
                <button
                  className="secondary-button"
                  disabled={gameReviewState.status === "loading"}
                  onClick={() => {
                    if (gameReviewState.status === "ready") {
                      setIsReviewModalOpen(true);
                      return;
                    }
                    void requestGameReview();
                  }}
                  type="button"
                >
                  {gameReviewState.status === "loading" ? (
                    <Loader2 aria-hidden="true" className="spin" size={17} />
                  ) : (
                    <Brain aria-hidden="true" size={17} />
                  )}
                  {gameReviewState.status === "ready" ? "查看整局复盘" : "生成整局复盘"}
                </button>
                <button
                  className="primary-button"
                  disabled={!reviewedMove || postGameAnalysisState.status === "loading"}
                  onClick={() => void requestPostGameMoveAnalysis()}
                  type="button"
                >
                  {postGameAnalysisState.status === "loading" ? (
                    <Loader2 aria-hidden="true" className="spin" size={17} />
                  ) : (
                    <Lightbulb aria-hidden="true" size={17} />
                  )}
                  求更优解
                </button>
              </div>

              {postGameAnalysisState.status === "loading" ? (
                <div aria-busy="true" className="review-loading" role="status">
                  <Loader2 aria-hidden="true" className="spin" size={18} />
                  <span>Pikafish 正在分析这一手。</span>
                </div>
              ) : postGameAnalysisState.status === "error" ? (
                <div className="review-error" role="alert">
                  <strong>分析失败</strong>
                  <p>{postGameAnalysisState.error}</p>
                </div>
              ) : activePostGameResponse ? (
                <section className="analysis-box">
                  <p className="hint-move">
                    推荐 <strong>{activePostGameResponse.recommendation.display}</strong>
                  </p>
                  {activePostGameResponse.explanation ? (
                    <p className="analysis-text">{activePostGameResponse.explanation}</p>
                  ) : (
                    <p className="analysis-warning">
                      {activePostGameResponse.explanationError ??
                        "AI Hub 暂未返回模型解释，本次只显示引擎路线。"}
                    </p>
                  )}
                  <EngineFacts engineInfo={activePostGameResponse.recommendation} />
                </section>
              ) : (
                <p className="muted">点选棋谱中的一步，再让 AI 从那一步前找更好的走法。</p>
              )}
            </section>

            <section className="rail-section">
              <div className="block-title">
                <BookOpenText aria-hidden="true" size={18} />
                <h2>回放棋谱</h2>
                <span className="source-badge">{moveRecords.length} 手</span>
              </div>
              <MoveHistoryList
                isReviewEnabled
                moveRecords={moveRecords}
                onSelect={selectReviewedMove}
                reviewedMoveIndex={reviewedMoveIndex}
              />
            </section>
          </>
        ) : null}
      </aside>

      <nav className="mobile-action-bar" aria-label="快捷操作">
        {isPostGame ? (
          <>
            <button
              disabled={gameReviewState.status === "loading"}
              onClick={() => {
                if (gameReviewState.status === "ready") {
                  setIsReviewModalOpen(true);
                  return;
                }
                void requestGameReview();
              }}
              type="button"
            >
              <BookOpenText aria-hidden="true" size={17} />
              复盘
            </button>
            <button
              disabled={!reviewedMove || postGameAnalysisState.status === "loading"}
              onClick={() => void requestPostGameMoveAnalysis()}
              type="button"
            >
              <Lightbulb aria-hidden="true" size={17} />
              更优
            </button>
          </>
        ) : (
          <>
            <button
              disabled={!isPlayerTurn || isHintLoading}
              onClick={() => void requestHint()}
              type="button"
            >
              <Lightbulb aria-hidden="true" size={17} />
              提示
            </button>
            <button
              disabled={!pendingMoveExplanation || isAiThinking || isExplanationLoading}
              onClick={() => void requestMoveExplanation()}
              type="button"
            >
              <Brain aria-hidden="true" size={17} />
              讲解
            </button>
          </>
        )}
        <button disabled={isAiThinking} onClick={startGame} type="button">
          <RotateCcw aria-hidden="true" size={17} />
          新局
        </button>
      </nav>

      {isReviewModalOpen ? (
        <GameReviewModal
          onClose={() => setIsReviewModalOpen(false)}
          onNewGame={startGame}
          onRetry={() => void requestGameReview()}
          onSetup={resetGame}
          resultText={describeStatus(status)}
          state={gameReviewState}
        />
      ) : null}
    </main>
  );
}

function PreviewBoard(props: { boardTheme: BoardThemeId }) {
  const previewSquares = getBoardSquares("r");
  return (
    <div className={`preview-board theme-${props.boardTheme}`} aria-hidden="true">
      {previewSquares.map((square, index) => {
        const piece = getPieceAt(undefined, square);
        return (
          <span
            className="preview-point"
            key={square}
            style={getBoardPointStyle(index)}
          >
            {piece ? <span className={`piece ${piece.color}`}>{pieceText(piece)}</span> : null}
          </span>
        );
      })}
      <span className="river-label">楚河 汉界</span>
    </div>
  );
}

function XiangqiBoard(props: {
  boardFen: string;
  boardSquares: XiangqiSquare[];
  boardTheme: BoardThemeId;
  disabled: boolean;
  hintMove: { from: XiangqiSquare; to: XiangqiSquare } | null;
  lastMove: LastMove | null;
  onSquareClick: (square: XiangqiSquare) => void;
  playerColor: XiangqiSide;
  selectedSquare: XiangqiSquare | null;
  status: XiangqiGameStatus;
  targetSquares: Set<string>;
}) {
  return (
    <div className="board-wrap">
      {props.lastMove ? (
        <div
          aria-live="polite"
          className={`move-callout ${props.lastMove.by === "engine" ? "engine" : "player"}`}
          role="status"
        >
          <span>{props.lastMove.by === "engine" ? "AI 刚走" : "你刚走"}</span>
          <strong>{props.lastMove.display ?? `${props.lastMove.from}-${props.lastMove.to}`}</strong>
          <em>
            {props.lastMove.from} 到 {props.lastMove.to}
          </em>
        </div>
      ) : null}
      <div
        aria-label="中国象棋棋盘"
        className={`xiangqi-board theme-${props.boardTheme}`}
        role="grid"
      >
        {props.boardSquares.map((square, index) => {
          const piece = getPieceAt(props.boardFen, square);
          const isSelected = props.selectedSquare === square;
          const isTarget = props.targetSquares.has(square);
          const isLast =
            props.lastMove?.from === square || props.lastMove?.to === square;
          const isLastFrom = props.lastMove?.from === square;
          const isLastTo = props.lastMove?.to === square;
          const isHint =
            props.hintMove?.from === square || props.hintMove?.to === square;
          const isOwnPiece = piece?.color === props.playerColor;
          const isActionable = !props.disabled && (isOwnPiece || isTarget);
          const isCheckKing =
            props.status.isCheck &&
            piece?.type === "king" &&
            piece.color === props.status.turn;

          return (
            <button
              aria-disabled={!isActionable}
              aria-label={getPointLabel(square, piece, {
                isActionable,
                isSelected,
                isTarget,
              })}
              aria-selected={isSelected || undefined}
              className={[
                "board-point",
                isActionable ? "actionable" : "",
                isSelected ? "selected" : "",
                isTarget ? "target" : "",
                isLast ? "last" : "",
                isLastFrom ? "last-from" : "",
                isLastTo ? "last-to" : "",
                props.lastMove?.by === "engine" && isLast ? "engine-move" : "",
                props.lastMove?.by === "player" && isLast ? "player-move" : "",
                isHint ? "hint" : "",
                isCheckKing ? "check-king" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={!isActionable}
              key={square}
              onClick={() => {
                if (isActionable) props.onSquareClick(square);
              }}
              role="gridcell"
              style={getBoardPointStyle(index)}
              tabIndex={isActionable ? 0 : -1}
              type="button"
            >
              <span className="coord">{square}</span>
              {piece ? (
                <span aria-hidden="true" className={`piece ${piece.color}`}>
                  {pieceText(piece)}
                </span>
              ) : null}
              {isLastFrom || isLastTo ? (
                <span aria-hidden="true" className="move-marker">
                  {isLastFrom ? "起" : "落"}
                </span>
              ) : null}
            </button>
          );
        })}
        <span className="river-label">楚河 汉界</span>
      </div>
    </div>
  );
}

function getBoardPointStyle(index: number): CSSProperties {
  return {
    "--board-x": index % 9,
    "--board-y": Math.floor(index / 9),
  } as CSSProperties;
}

function EngineInsightStrip(props: {
  difficultyLabel: string;
  engineInfo: EngineInfo | null;
  isAiThinking: boolean;
  lastMove: LastMove | null;
  pendingMoveExplanation: PendingMoveExplanation | null;
}) {
  const pv = props.engineInfo?.pv ?? [];
  const engineLabel =
    props.engineInfo?.source === "pikafish"
      ? "Pikafish"
      : props.engineInfo?.source === "heuristic"
        ? "启发式降级"
        : "Pikafish 引擎";
  const recentMove =
    props.lastMove?.by === "engine"
      ? props.lastMove.display
      : props.pendingMoveExplanation?.display;

  return (
    <section className="engine-strip" aria-label="AI 引擎信息">
      <div className={`engine-pulse ${props.isAiThinking ? "active" : ""}`}>
        <Bot aria-hidden="true" size={17} />
        <div>
          <span>{props.isAiThinking ? "Pikafish 正在计算" : engineLabel}</span>
          <strong>{props.difficultyLabel}难度</strong>
        </div>
      </div>
      <div className="engine-fact-tile">
        <span>评分</span>
        <strong>{typeof props.engineInfo?.score === "number" ? props.engineInfo.score : "待评估"}</strong>
      </div>
      <div className="engine-fact-tile">
        <span>深度</span>
        <strong>{props.engineInfo?.depth ?? "-"}</strong>
      </div>
      <div className="engine-fact-tile wide">
        <span>最近一手</span>
        <strong>{recentMove ?? "等待落子"}</strong>
      </div>
      <div className="engine-fact-tile pv">
        <span>主变化</span>
        <strong>{pv.length ? formatPvPreview(pv, 5) : "暂无"}</strong>
      </div>
    </section>
  );
}

function EngineFacts(props: { engineInfo: EngineInfo | HintResponse }) {
  const sourceLabel =
    props.engineInfo.source === "pikafish"
      ? "专用引擎"
      : props.engineInfo.source === "heuristic"
        ? "启发式降级"
        : undefined;

  return (
    <dl className="engine-facts">
      {props.engineInfo.engineName ? (
        <>
          <dt>引擎</dt>
          <dd>
            {props.engineInfo.engineName}
            {sourceLabel ? ` · ${sourceLabel}` : ""}
          </dd>
        </>
      ) : null}
      {typeof props.engineInfo.score === "number" ? (
        <>
          <dt>评分</dt>
          <dd>{props.engineInfo.score}</dd>
        </>
      ) : null}
      {props.engineInfo.depth ? (
        <>
          <dt>深度</dt>
          <dd>{props.engineInfo.depth}</dd>
        </>
      ) : null}
      {props.engineInfo.pv?.length ? (
        <>
          <dt>主变化</dt>
          <dd>{formatPvPreview(props.engineInfo.pv)}</dd>
        </>
      ) : null}
    </dl>
  );
}

function MoveHistoryList(props: {
  isReviewEnabled: boolean;
  moveRecords: MoveRecord[];
  onSelect: (index: number) => void;
  reviewedMoveIndex: number | null;
}) {
  return (
    <ol className="move-list">
      {toMovePairs(props.moveRecords).map((pair, index) => (
        <li key={`${pair.red?.uci ?? ""}-${pair.black?.uci ?? ""}-${index}`}>
          <span>{index + 1}.</span>
          <MoveHistoryButton
            isActive={props.reviewedMoveIndex === index * 2}
            isReviewEnabled={props.isReviewEnabled}
            move={pair.red}
            onSelect={() => props.onSelect(index * 2)}
          />
          <MoveHistoryButton
            isActive={props.reviewedMoveIndex === index * 2 + 1}
            isReviewEnabled={props.isReviewEnabled}
            move={pair.black}
            onSelect={() => props.onSelect(index * 2 + 1)}
          />
        </li>
      ))}
    </ol>
  );
}

function MoveHistoryButton(props: {
  isActive: boolean;
  isReviewEnabled: boolean;
  move?: MoveRecord;
  onSelect: () => void;
}) {
  if (!props.move) {
    return <span className="move-empty" aria-hidden="true" />;
  }

  return (
    <button
      aria-pressed={props.isActive}
      className={[
        "move-history-button",
        props.isActive ? "active" : "",
        props.move.by === "engine" ? "engine-move" : "player-move",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={!props.isReviewEnabled}
      onClick={props.onSelect}
      type="button"
    >
      <strong>{props.move.display}</strong>
      <span>{props.move.by === "player" ? "你" : "AI"}</span>
    </button>
  );
}

function GameReviewModal(props: {
  state: GameReviewState;
  resultText: string;
  onClose: () => void;
  onRetry: () => void;
  onNewGame: () => void;
  onSetup: () => void;
}) {
  const isLoading = props.state.status === "loading";

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="game-review-title"
        aria-modal="true"
        className="review-modal"
        role="dialog"
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">赛后复盘</p>
            <h2 id="game-review-title">{props.resultText}</h2>
          </div>
          <button aria-label="关闭复盘" className="icon-button" onClick={props.onClose} type="button">
            <X aria-hidden="true" size={19} />
          </button>
        </div>

        {isLoading ? (
          <div aria-busy="true" className="review-loading" role="status">
            <Loader2 aria-hidden="true" className="spin" size={20} />
            <span>模型正在整理整局复盘。</span>
          </div>
        ) : props.state.status === "error" ? (
          <div className="review-error" role="alert">
            <strong>复盘未完成</strong>
            <p>{props.state.error}</p>
            <button className="secondary-button" onClick={props.onRetry} type="button">
              重试
            </button>
          </div>
        ) : props.state.status === "ready" ? (
          <div className="review-content">
            {formatReviewText(props.state.text).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        ) : (
          <p className="muted">对局结束后可以生成整局复盘。</p>
        )}

        <div className="button-row">
          <button className="primary-button" onClick={props.onNewGame} type="button">
            新局
          </button>
          <button className="secondary-button" onClick={props.onSetup} type="button">
            回配置
          </button>
        </div>
      </section>
    </div>
  );
}

function getPointLabel(
  square: string,
  piece: XiangqiPiece | null | undefined,
  state: { isActionable: boolean; isSelected: boolean; isTarget: boolean },
): string {
  const parts = [square];
  if (piece) parts.push(`${sideLabel(piece.color)}${pieceText(piece)}`);
  if (state.isSelected) parts.push("已选中");
  else if (state.isTarget) parts.push("可落子");
  else if (state.isActionable) parts.push("可选择");
  return parts.join("，");
}

function pieceText(piece: XiangqiPiece): string {
  return PIECE_LABELS[piece.color][piece.type];
}

function sideLabel(side: XiangqiSide): "红方" | "黑方" {
  return side === "r" ? "红方" : "黑方";
}

function getTurnLabel(
  status: XiangqiGameStatus,
  playerColor: XiangqiSide,
  gameStarted: boolean,
): string {
  if (!gameStarted) return "待开始";
  if (status.isGameOver) return describeStatus(status);
  const owner = status.turn === playerColor ? "你" : "AI";
  return `${owner}走，${sideLabel(status.turn)}`;
}

function describeStatus(status: XiangqiGameStatus): string {
  if (!status.isGameOver) return status.isCheck ? "将军。" : "对局进行中。";
  if (status.result === "RED_WINS") return "红方获胜。";
  if (status.result === "BLACK_WINS") return "黑方获胜。";
  return "和棋。";
}

function toMovePairs(records: MoveRecord[]) {
  const pairs: Array<{ red?: MoveRecord; black?: MoveRecord }> = [];
  for (let index = 0; index < records.length; index += 2) {
    pairs.push({ red: records[index], black: records[index + 1] });
  }
  return pairs;
}

function getMoveReviewTarget(
  records: MoveRecord[],
  history: string[],
  index: number | null,
): MoveReviewTarget | null {
  if (index === null || index < 0 || index >= records.length) return null;

  const record = records[index];
  if (!record) return null;

  return {
    index,
    moveNumber: index + 1,
    sideLabel: index % 2 === 0 ? "红方" : "黑方",
    fenBefore: index === 0 ? createInitialFen() : records[index - 1]?.fenAfter ?? createInitialFen(),
    fenAfter: record.fenAfter,
    historyBefore: history.slice(0, index),
    record,
  };
}

function moveRecordToLastMove(record: MoveRecord): LastMove {
  return {
    from: record.uci.slice(0, 2),
    to: record.uci.slice(2, 4),
    by: record.by,
    display: record.display,
  };
}

function toReviewMoveRecords(records: MoveRecord[]): MoveRecord[] {
  return records.map((record) => ({
    ...record,
    enginePv: trimEnginePv(record.enginePv),
  }));
}

function trimEnginePv(pv: string[] | undefined): string[] | undefined {
  return pv?.slice(0, MAX_ENGINE_PV_MOVES);
}

function formatPvPreview(pv: string[], limit = 6): string {
  const preview = pv.slice(0, limit).join(" ");
  return pv.length > limit ? `${preview} ...` : preview;
}

function formatReviewText(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getApiErrorMessage(data: unknown, fallback: string): string {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    data.error &&
    typeof data.error === "object" &&
    "message" in data.error &&
    typeof data.error.message === "string"
  ) {
    return data.error.message;
  }

  return fallback;
}
