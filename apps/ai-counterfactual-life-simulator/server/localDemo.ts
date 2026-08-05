import type { CounterfactualResult, GenerateRequest } from "../src/shared/contracts.js";

export function demoCounterfactualResult(input: GenerateRequest): CounterfactualResult {
  const question = input.question.trim();
  const contextHint = input.context.trim()
    ? "结合你补充的背景，这次推演更关注真实生活中的机会成本，而不是把另一条路想得过分完美。"
    : "由于背景信息较少，这次推演会保持保守，用更高的不确定性提醒你不要把结果当作预言。";

  return {
    question,
    reframe: `${contextHint} 核心问题不是另一条路是否绝对更好，而是它会交换掉哪些东西。`,
    disclaimer: "以下是基于输入信息的反事实推演，不是命运预测，也不能替代专业建议。",
    branches: [
      {
        id: "branch_1",
        title: "更快抵达的收益线",
        summary: "这条分支放大了你当初没选那条路中最吸引人的成长速度和外部反馈。",
        branchType: "upside",
        timeline: [
          {
            period: "0-6 个月",
            label: "短期结果",
            content: "新鲜感和行动密度会明显上升，你更容易感到自己终于把某个遗憾补上了。"
          },
          {
            period: "1-2 年",
            label: "转折期",
            content: "成长会变快，但节奏也会更紧，你需要更早处理压力、比较和自我怀疑。"
          },
          {
            period: "3-5 年",
            label: "长期走向",
            content: "你可能积累更亮眼的履历或故事，但也未必更清楚自己真正想要怎样的生活。"
          }
        ],
        shortTermResult: "更强刺激、更快反馈、更像是在主动改写人生。",
        longTermCost: "稳定关系、身体状态和内在节奏可能被压缩，甚至被你误以为是不够努力。",
        hiddenOpportunity: "你会更早练习在高变化环境里定义边界，而这项能力现在也可以补练。",
        realityAdvice: "把这条路拆成一个 30 天小实验：见一个相关的人、做一个作品、投一次机会，而不是直接否定过去选择。",
        riskReward: {
          rewardScore: 4,
          riskScore: 4,
          uncertainty: "high",
          emotion: "激励与拉扯并存"
        }
      },
      {
        id: "branch_2",
        title: "被忽略的代价线",
        summary: "这条分支提醒你，没选的路也有它的账单，只是账单没有真实发生，所以容易被美化。",
        branchType: "cost",
        timeline: [
          {
            period: "0-6 个月",
            label: "短期结果",
            content: "你会获得一种解脱感，但也会失去现实路径上已经建立的熟悉感和支持系统。"
          },
          {
            period: "1-2 年",
            label: "转折期",
            content: "当新选择不再新鲜，具体问题会出现：钱、时间、关系、能力缺口和日常消耗。"
          },
          {
            period: "3-5 年",
            label: "长期走向",
            content: "你可能不再后悔原来的选择，却开始后悔另一种牺牲。人生会换题，不会免考。"
          }
        ],
        shortTermResult: "情绪上像是松了一口气，但现实上会进入新的适应期。",
        longTermCost: "你可能需要为自由、浪漫或成长支付更高的不确定性成本。",
        hiddenOpportunity: "这条分支的价值在于帮你看清：你真正想要的也许不是重来，而是减少当前生活里的钝感。",
        realityAdvice: "列出你羡慕那条路的 3 个具体元素，只把其中一个迁移到现在的生活里。",
        riskReward: {
          rewardScore: 3,
          riskScore: 5,
          uncertainty: "medium",
          emotion: "清醒、失落、释然交织"
        }
      },
      {
        id: "branch_3",
        title: "意外打开的机会线",
        summary: "这条分支不是更好或更差，而是展示另一种你可能被迫发展出的能力。",
        branchType: "opportunity",
        timeline: [
          {
            period: "0-6 个月",
            label: "短期结果",
            content: "你会接触新的圈层和语言系统，短期未必顺利，但视野会被迫打开。"
          },
          {
            period: "1-2 年",
            label: "转折期",
            content: "你可能发现自己并不适合想象中的生活，却因此更早识别自己的偏好。"
          },
          {
            period: "3-5 年",
            label: "长期走向",
            content: "真正留下来的不是那条路本身，而是一次重新选择和重新命名自己的能力。"
          }
        ],
        shortTermResult: "不确定性增加，但你会更快获得新的参照系。",
        longTermCost: "原有身份感会被打散，你需要承受一段时间的漂浮感。",
        hiddenOpportunity: "你可能学会把人生看成可迭代的系统，而不是一次考试。",
        realityAdvice: "与其追问当年是否错过，不如设计一次低成本重启：一个周末、一个项目、一次真实对话。",
        riskReward: {
          rewardScore: 4,
          riskScore: 3,
          uncertainty: "medium",
          emotion: "好奇、松动、重新开始"
        }
      }
    ],
    overallAdvice: "不要只问另一条路会不会更好，也要问现在能不能拿回其中一小部分价值。你不需要重开人生，先重开一个可控的小实验。"
  };
}
