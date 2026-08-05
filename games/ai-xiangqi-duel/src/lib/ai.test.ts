import { describe, expect, it } from "vitest";
import {
  AiMoveRequestSchema,
  buildGameReviewMessages,
  buildPostGameMoveAnalysisMessages,
  buildXiangqiExplanationMessages,
  GameReviewRequestSchema,
  MoveSourceSchema,
  parseGameReviewContent,
  parseXiangqiExplanationContent,
  PlayerColorSchema,
  PostGameMoveAnalysisRequestSchema,
  ProviderSchema,
  ProviderTestRequestSchema,
  XiangqiExplanationRequestSchema,
  XiangqiHintRequestSchema,
} from "./ai";
import { createInitialFen } from "./xiangqi";

describe("AI Xiangqi contract", () => {
  it("accepts only Hub GPT provider and model settings", () => {
    expect(ProviderSchema.safeParse("openai").success).toBe(true);
    expect(ProviderSchema.safeParse("deepseek").success).toBe(false);
    expect(ProviderSchema.safeParse("anthropic").success).toBe(false);
    expect(ProviderSchema.safeParse("gemini").success).toBe(false);
    expect(
      ProviderTestRequestSchema.safeParse({ provider: "openai", model: "gpt-5.4-mini" })
        .success,
    ).toBe(true);
    expect(
      ProviderTestRequestSchema.safeParse({ provider: "openai", model: "claude-opus-4-8" })
        .success,
    ).toBe(false);
  });

  it("builds grounded Xiangqi explanation prompts", () => {
    const messages = buildXiangqiExplanationMessages({
      fenBefore: createInitialFen(),
      moveHistoryBefore: ["红车 a9-a8"],
      aiColor: "b",
      moveUci: "b0c2",
      displayMove: "黑马 b0-c2",
      score: 45,
      depth: 3,
      pv: ["b0c2", "h9g7"],
      engineReason: "Local Xiangqi Heuristic Engine 搜索 3 层。",
    });

    expect(messages[0].content).toContain("中文中国象棋教练");
    expect(messages[0].content).toContain("不要选择、改变或替换走法");
    expect(messages.at(-1)?.content).toContain("Engine move display: 黑马 b0-c2");
    expect(messages.at(-1)?.content).toContain("Position before move FEN");
    expect(messages.at(-1)?.content).toContain("将帅安全");
    expect(messages.at(-1)?.content).toContain("Principal variation UCI");
  });

  it("parses a Hub GPT Xiangqi explanation from JSON", () => {
    const explanation = parseXiangqiExplanationContent(
      '{"explanation":"黑马跳出，打开线路，并争夺中心空间。"}',
    );

    expect(explanation).toContain("黑马");
  });

  it("does not auto-request model explanations for AI moves", () => {
    const request = AiMoveRequestSchema.parse({
      fen: createInitialFen(),
      playerColor: "r",
    });

    expect(request.explainWithModel).toBe(false);
    expect(request.engineDifficulty).toBe("casual");
  });

  it("accepts Xiangqi hint requests without a model key", () => {
    const request = XiangqiHintRequestSchema.parse({
      fen: createInitialFen(),
      moveHistory: ["红车 a9-a8"],
      playerColor: "r",
    });

    expect(request.playerColor).toBe("r");
    expect(request.engineDifficulty).toBe("master");
  });

  it("accepts on-demand Xiangqi explanation requests", () => {
    const request = XiangqiExplanationRequestSchema.parse({
      fenBefore: createInitialFen(),
      moveHistoryBefore: ["红车 a9-a8"],
      aiColor: "b",
      moveUci: "b0c2",
      displayMove: "黑马 b0-c2",
      engineReason: "引擎认为这步稳健。",
    });

    expect(request.provider).toBe("openai");
    expect(request.moveUci).toBe("b0c2");
  });

  it("accepts post-game move analysis requests without a model key", () => {
    const request = PostGameMoveAnalysisRequestSchema.parse({
      fenBefore: createInitialFen(),
      selectedMoveUci: "a9a8",
      selectedMoveDisplay: "红车 a9-a8",
      selectedMoveBy: "player",
    });

    expect(request.engineDifficulty).toBe("master");
  });

  it("builds post-game better-line prompts grounded in engine analysis", () => {
    const messages = buildPostGameMoveAnalysisMessages({
      fenBefore: createInitialFen(),
      moveHistoryBefore: ["红车 a9-a8"],
      sideToMove: "r",
      selectedMoveUci: "a9a8",
      selectedMoveDisplay: "红车 a9-a8",
      selectedMoveBy: "player",
      bestMoveUci: "h9g7",
      bestMoveDisplay: "黑马 h9-g7",
      score: 120,
      depth: 4,
      pv: ["h9g7", "b0c2"],
      engineReason: "引擎认为先活马更积极。",
    });

    expect(messages[0].content).toContain("不要继续真实棋局");
    expect(messages.at(-1)?.content).toContain("Original played move display: 红车 a9-a8");
    expect(messages.at(-1)?.content).toContain("Engine better move display: 黑马 h9-g7");
    expect(messages.at(-1)?.content).toContain("为什么引擎路线更好");
  });

  it("builds completed game review prompts without asking the model to continue", () => {
    const messages = buildGameReviewMessages({
      playerColor: "r",
      result: "BLACK_WINS",
      reason: "CHECKMATE",
      finalFen: createInitialFen(),
      moveHistory: ["红车 a9-a8", "黑炮 b2-b9"],
      moveRecords: [
        {
          by: "engine",
          display: "黑炮 b2-b9",
          uci: "b2b9",
          fenAfter: createInitialFen(),
          engineScore: -900,
          engineDepth: 3,
          enginePv: ["b2b9"],
        },
      ],
    });

    expect(messages[0].content).toContain("已结束中国象棋棋局");
    expect(messages[0].content).toContain("不要继续对局");
    expect(messages.at(-1)?.content).toContain("关键转折");
    expect(messages.at(-1)?.content).toContain("Detailed move records");
  });

  it("parses a completed game review from JSON", () => {
    const review = parseGameReviewContent(
      '{"review":"黑方抓住中路反击获胜，关键转折是红方车路失位。"}',
    );

    expect(review).toContain("黑方");
  });

  it("keeps game review principal variations bounded", () => {
    const baseRequest = {
      playerColor: "r" as const,
      result: "BLACK_WINS",
      reason: "CHECKMATE",
      finalFen: createInitialFen(),
      moveHistory: ["红车 a9-a8"],
      moveRecords: [
        {
          by: "engine" as const,
          display: "黑炮 b2-b9",
          uci: "b2b9",
          fenAfter: createInitialFen(),
        },
      ],
    };

    expect(
      GameReviewRequestSchema.safeParse({
        ...baseRequest,
        moveRecords: [
          {
            ...baseRequest.moveRecords[0],
            enginePv: Array.from({ length: 20 }, () => "b2b9"),
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      GameReviewRequestSchema.safeParse({
        ...baseRequest,
        moveRecords: [
          {
            ...baseRequest.moveRecords[0],
            enginePv: Array.from({ length: 21 }, () => "b2b9"),
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts only red or black user color choices", () => {
    expect(PlayerColorSchema.safeParse("r").success).toBe(true);
    expect(PlayerColorSchema.safeParse("b").success).toBe(true);
    expect(PlayerColorSchema.safeParse("red").success).toBe(false);
  });

  it("only exposes the Xiangqi engine as the move source", () => {
    expect(MoveSourceSchema.safeParse("xiangqi-engine").success).toBe(true);
    expect(MoveSourceSchema.safeParse("random").success).toBe(false);
  });

  it("maps old move source labels to the Xiangqi engine", () => {
    expect(MoveSourceSchema.parse("engine")).toBe("xiangqi-engine");
    expect(MoveSourceSchema.parse("pikafish")).toBe("xiangqi-engine");
    expect(MoveSourceSchema.safeParse("deepseek").success).toBe(false);
  });
});
