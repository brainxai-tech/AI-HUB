import { describe, expect, it } from "vitest";
import { evaluateCoachResult } from "../server/quality.js";
import type { CoachResult, GenerateRequest } from "../src/shared/contracts.js";

const request: GenerateRequest = {
  provider: "openai",
  model: "gpt-5.4",
  style: "sharp",
  userText: "我总是拖延，但我真的想改变。"
};

const strongResult: CoachResult = {
  originalInput: request.userText,
  headline: "你的“想改变”比拖延更会拖。",
  verdict: "说白了，你现在拿“想改变”当缓冲垫，真正缺的是第一个不舒服的动作。",
  emptyPhrases: [
    {
      phrase: "想改变",
      whyItIsEmpty: "它没有对象、时间和完成证据。",
      replaceWith: "今天 14:00 打开周报文件，删掉空白页，写出第一句。"
    }
  ],
  realityCheck: "你可能不是不知道该做什么，而是在回避打开那个具体任务。",
  actions: [
    {
      title: "打开被拖延的文件",
      minutes: 8,
      firstStep: "打开你一直回避的文档，删掉占位空行，写一个难看的标题。",
      proof: "文件里出现一个标题，并保存了新的修改时间。"
    },
    {
      title: "移走一个阻碍",
      minutes: 3,
      firstStep: "把最容易分心的应用退出，手机放到够不到的位置。",
      proof: "桌面只剩任务窗口，手机离开手边。"
    }
  ],
  reviewQuestion: "今天你到底打开了哪个被拖延的东西？别回答“想了”。",
  boundary: "这是行动建议，不替代心理咨询或医疗诊断。",
  safetyMode: false
};

describe("quality evaluator", () => {
  it("passes a specific sharp result with visible proof", () => {
    const report = evaluateCoachResult(request, strongResult);
    expect(report.passed).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("flags repetitive generic action templates", () => {
    const weakResult: CoachResult = {
      ...strongResult,
      actions: [
        {
          title: "写下来",
          minutes: 5,
          firstStep: "写下来，然后设定计时器做 5 分钟。",
          proof: "纸上打个勾。"
        },
        {
          title: "继续写下来",
          minutes: 5,
          firstStep: "再写下一个 5 分钟目标，打开计时器。",
          proof: "备忘录里有记录。"
        }
      ]
    };

    const report = evaluateCoachResult(request, weakResult);
    expect(report.passed).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("GENERIC_ACTION_OVERUSE");
  });

  it("flags friend style that lacks emotional handoff", () => {
    const report = evaluateCoachResult(
      { ...request, style: "friend", userText: "我最近总觉得自己很废。" },
      {
        ...strongResult,
        originalInput: "我最近总觉得自己很废。",
        headline: "自责不是事实",
        verdict: "这是一种认知泛化，需要证据修正。",
        emptyPhrases: [
          {
            phrase: "很废",
            whyItIsEmpty: "它是评价，不是事实。",
            replaceWith: "我今天有一件事没有达到预期。"
          }
        ]
      }
    );

    expect(report.passed).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("FRIEND_STYLE_TOO_COLD");
  });
});
