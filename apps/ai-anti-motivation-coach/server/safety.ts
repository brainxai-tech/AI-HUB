import type { CoachResult, GenerateRequest } from "../src/shared/contracts.js";

const crisisPatterns = [
  /自杀|轻生|不想活|结束生命|活不下去|想死|去死/i,
  /suicide|kill myself|end my life|want to die/i,
  /伤害自己|自残|割腕|吞药/i
];

export function needsSafetyMode(text: string) {
  return crisisPatterns.some((pattern) => pattern.test(text));
}

export function buildSafetyResult(input: GenerateRequest): CoachResult {
  return {
    originalInput: input.userText,
    headline: "这不是适合毒舌的时刻",
    verdict: "这句话里有明显的危机信号，我不会用反鸡汤或毒舌方式处理它。",
    emptyPhrases: [
      {
        phrase: "我撑不下去了",
        whyItIsEmpty: "它不是空话，而是需要被认真对待的求助信号。",
        replaceWith: "我现在需要联系一个真实的人，并让自己远离立即危险。"
      }
    ],
    realityCheck:
      "如果你可能马上伤害自己，请立刻联系当地紧急服务、危机热线或身边可信任的人。先把危险物品移远，别一个人硬扛。",
    actions: [
      {
        title: "联系一个真人",
        minutes: 5,
        firstStep: "给一个你信得过的人发消息：我现在状态很危险，能不能马上陪我一下。",
        proof: "消息已经发出，或电话已经拨通。"
      },
      {
        title: "降低立即风险",
        minutes: 5,
        firstStep: "离开让你更危险的地点，把可能伤害自己的东西放远，去有人的地方。",
        proof: "你已经换到更安全的位置。"
      }
    ],
    reviewQuestion: "现在谁能在现实里陪你 10 分钟，而不是让你继续一个人扛？",
    boundary: "我可以帮你整理语言和下一步，但不能替代紧急救助、医生、心理咨询师或身边的人。",
    safetyMode: true
  };
}
