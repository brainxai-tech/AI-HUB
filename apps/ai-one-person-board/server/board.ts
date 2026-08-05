import {
  boardReportSchema,
  roleLabels,
  type BoardReport,
  type GenerateRequest,
  type Vote
} from "../src/shared/contracts.js";

const roleOrder = ["ceo", "cfo", "user", "engineer", "designer"] as const;

export function buildLocalBoardReport(input: GenerateRequest): BoardReport {
  const idea = input.input.idea.trim();
  const targetUser = input.input.targetUser.trim() || "有这个痛点但还没有清晰替代方案的早期用户";
  const problem = input.input.problem.trim() || inferProblem(idea);
  const solution = inferSolution(idea);
  const businessModel = input.input.businessModel.trim() || "暂未明确收费方式";

  const directors = [
    {
      role: "ceo" as const,
      stance: "方向有探索价值，但必须先证明需求足够尖锐。",
      questions: [
        "这个想法解决的是高频刚需，还是一个有趣但低频的工具？",
        "用户现在不用你时，会用什么替代方案完成这件事？",
        "如果只能保留一个差异化能力，它是什么？"
      ],
      strongestRisk: "定位过宽会让产品同时像咨询、模板和聊天工具，用户不知道为什么非用它不可。",
      suggestedExperiment: "做 10 个目标用户访谈，要求每个人拿一个真实项目现场试用，再记录他们愿意继续用的场景。",
      vote: "VALIDATE" as Vote,
      rationale: "战略上可以押小注，但还不值得直接投入完整开发。"
    },
    {
      role: "cfo" as const,
      stance: "成本可控，商业闭环尚未证明。",
      questions: [
        "一次完整生成需要多少 token 和多少轮模型调用？",
        "用户愿意为单次报告付费，还是只会把它当免费玩具？",
        `当前商业模式是「${businessModel}」，它能覆盖模型成本和获客成本吗？`
      ],
      strongestRisk: "多角色生成天然推高模型成本，如果报告不能直接节省决策时间，毛利会很快被消耗。",
      suggestedExperiment: "先做一次付费假门页，测试 19-49 元单次报告或月度订阅的点击与支付意愿。",
      vote: "VALIDATE" as Vote,
      rationale: "先验证付费意愿和生成成本，再决定是否扩展。"
    },
    {
      role: "user" as const,
      stance: "我会被尖锐问题吸引，但不想读一堆泛泛建议。",
      questions: [
        "它能不能指出我自己没看到的致命假设？",
        "结论是否具体到我今天能做什么，而不是告诉我继续调研？",
        "如果它判断不建议做，我会相信原因吗？"
      ],
      strongestRisk: "如果每个角色都说正确废话，用户第一次用完就不会再回来。",
      suggestedExperiment: "让 5 个真实创作者把报告和朋友/导师反馈并排打分，比较哪一个更能改变下一步行动。",
      vote: "PIVOT" as Vote,
      rationale: "体验核心不是角色数量，而是质询是否锋利。"
    },
    {
      role: "engineer" as const,
      stance: "MVP 技术可行，重点是结构化输出、失败兜底和 Hub 项目级代理边界。",
      questions: [
        "模型必须一次性返回完整董事会，还是角色逐个流式生成？",
        "当模型没有返回合法 JSON 时，用户看到什么？",
        "模型请求是否只通过 Hub 项目级代理发送，不在项目内接收或保存访问凭据？"
      ],
      strongestRisk: "模型 JSON 输出的稳定性会波动，前端直接渲染未验证内容会产生坏结果。",
      suggestedExperiment: "先用统一 schema 校验 20 个样例想法，记录当前 GPT 型号的成功率、延迟和失败原因。",
      vote: "GO" as Vote,
      rationale: "一版单次评审闭环很小，可以快速做出。"
    },
    {
      role: "designer" as const,
      stance: "界面要像决策工具，而不是聊天页。",
      questions: [
        "用户能否一眼看懂五票分布和最终建议？",
        "角色质询是否按决策顺序排布，而不是堆文本？",
        "报告能否导出给 Obsidian、Notion 或团队讨论？"
      ],
      strongestRisk: "如果结果页像长文章，用户会跳过关键风险和下一步实验。",
      suggestedExperiment: "做一个单屏报告原型，让用户在 30 秒内说出最终结论、最大风险和下一步动作。",
      vote: "GO" as Vote,
      rationale: "把报告设计成可扫描的董事会纪要，MVP 就有辨识度。"
    }
  ];

  const report = {
    ideaSummary: {
      title: truncateTitle(idea),
      targetUser,
      problem,
      solution,
      riskiestAssumption: "用户愿意把早期想法交给 AI 做严肃压力测试，而不是只把它当成娱乐问答。",
      aiValue: "AI 价值在于模拟多角色反对意见、压缩早期讨论时间，并把下一步验证动作结构化。"
    },
    directors,
    voteTally: tallyVotes(directors.map((director) => director.vote)),
    finalDecision: {
      recommendation: "VALIDATE" as const,
      confidence: 74,
      summary: "建议继续做极小 MVP，但先把它定位成项目想法压力测试器，而不是泛创业顾问。",
      reason:
        "工程范围可控，体验概念清晰；真正未证明的是用户是否信任这份报告，以及是否愿意为节省决策时间付费。",
      sevenDayPlan: [
        "第 1 天：做单次董事会评审原型，只支持输入想法和生成报告。",
        "第 2-3 天：找 5 个真实项目想法试跑，记录哪些质询真的改变了用户判断。",
        "第 4 天：调整角色 prompt，让每个角色的反对点更不重叠。",
        "第 5-6 天：做付费假门页或导出功能，测试用户是否愿意保存/分享报告。",
        "第 7 天：按完成率、分享率、愿付费率决定是否进入下一轮开发。"
      ],
      killCriteria: [
        "连续 10 个用户都认为报告没有提供新视角。",
        "用户只愿意试玩，不愿意保存、分享或为结果付费。",
        "多模型调用成本无法被单次付费或订阅覆盖。"
      ],
      nextQuestion: `对「${roleLabels.ceo}」来说，下一步最该证明的是：目标用户是否真的愿意用它决定一个项目要不要继续。`
    }
  };

  return boardReportSchema.parse(report);
}

export function tallyVotes(votes: Vote[]) {
  return votes.reduce(
    (tally, vote) => {
      tally[vote] += 1;
      return tally;
    },
    { GO: 0, PIVOT: 0, VALIDATE: 0, KILL: 0 }
  );
}

export function ensureRoleCoverage(report: BoardReport) {
  const roles = new Set(report.directors.map((director) => director.role));
  return roleOrder.every((role) => roles.has(role));
}

function inferProblem(idea: string) {
  if (idea.includes("AI") || idea.includes("ai")) {
    return "用户有一个需要判断、生成或整理的信息任务，但当前流程耗时且缺少高质量反馈。";
  }
  return "用户有一个尚未被足够具体化的需求，需要验证痛点、替代方案和付费意愿。";
}

function inferSolution(idea: string) {
  return idea.length > 80 ? idea.slice(0, 80) : idea;
}

function truncateTitle(idea: string) {
  const clean = idea.replace(/\s+/g, " ").trim();
  if (clean.length <= 28) return clean;
  return `${clean.slice(0, 28)}...`;
}
