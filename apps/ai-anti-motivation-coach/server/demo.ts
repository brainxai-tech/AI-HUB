import type { CoachResult, GenerateRequest } from "../src/shared/contracts.js";

export function buildDemoResult(input: GenerateRequest): CoachResult {
  const sharp = input.style === "sharp";
  const friend = input.style === "friend";

  return {
    originalInput: input.userText,
    headline: sharp ? "先别给人生写片头曲" : "把雾切成一块地板砖",
    verdict: sharp
      ? "这句话听起来很燃，但执行价值接近零，因为它没有对象、时间和证据。"
      : friend
        ? "你不是没有想变好，你是把目标说得太大，大到今天没法开始。"
        : "当前表达的主要问题是目标抽象，缺少可观测行为和验证标准。",
    emptyPhrases: [
      {
        phrase: "更好的自己",
        whyItIsEmpty: "它没有说明哪一件事要变好，也没有说明今天怎么证明它发生了。",
        replaceWith: "今天 20 分钟内完成一个能被看见的小动作。"
      },
      {
        phrase: "我要自律",
        whyItIsEmpty: "自律是结果，不是动作。你需要的是开始条件和阻力处理。",
        replaceWith: "到点打开任务文件，只做第一段，不评价状态。"
      }
    ],
    realityCheck: sharp
      ? "你可能不是缺热血，而是在用大词逃避一个具体任务。大脑很会被口号哄睡。"
      : "真正的问题不是你有没有决心，而是你还没有把愿望翻译成低阻力动作。",
    actions: [
      {
        title: "把目标改成一个可见动作",
        minutes: 10,
        firstStep: "写下你今天最想逃避的一件事，并把它切成一个动词开头的第一步。",
        proof: "纸上或备忘录里出现一个以动词开头的任务。"
      },
      {
        title: "做一轮不评价的开始",
        minutes: 15,
        firstStep: "打开相关文件、页面或工具，只做第一小段，不整理仪式感。",
        proof: "留下一个新增段落、一个提交、一个截图或一个发送记录。"
      }
    ],
    reviewQuestion: "今晚复盘时别问自己有没有变好，只问：我今天留下了哪个能被别人看见的证据？",
    boundary: "这是行动教练建议，不替代心理咨询、医疗诊断或专业服务。",
    safetyMode: false
  };
}
