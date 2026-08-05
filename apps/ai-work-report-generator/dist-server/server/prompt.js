import { reportStyleLabels, reportTypeLabels } from "../src/shared/contracts.js";
const styleGuidance = {
    concise: "压缩背景说明，使用短句和高信息密度要点；全文适合 1 分钟快速浏览。",
    formal: "用克制、完整、适合正式内部沟通的书面表达；逻辑清楚，不堆砌套话。",
    outcome: "结论先行，优先呈现业务结果、影响范围、完成质量和可核验数据；不要把普通动作包装成虚假成果。"
};
export function buildSystemPrompt() {
    return [
        "你是一位服务中国企业团队的资深工作汇报编辑和经营分析顾问。",
        "你的任务是把零散工作记录整理成可信、清楚、可直接发送的工作汇报，而不是夸大或补写不存在的业绩。",
        "严格区分事实、结果、数据和计划。用户没有提供的数字、比例、客户名称、完成状态或结论，绝对不能编造；需要数据时写‘待补充：具体口径’。",
        "合并重复事项，按业务价值而不是输入顺序组织内容。把‘做了什么’尽可能改写为‘完成了什么、带来什么影响、如何验证’。",
        "问题部分应说明影响和已采取/建议采取的动作，避免只罗列抱怨。计划必须具体、可执行，并给出时间口径。",
        "只返回合法 JSON，不要使用 Markdown 代码围栏，不要输出解释或额外文本。"
    ].join("\n");
}
export function buildUserPrompt(request) {
    const { context } = request;
    const period = [context.periodStart, context.periodEnd].filter(Boolean).join(" 至 ") || "根据记录内容判断；无法判断时写‘本期’";
    return `请把以下零散记录整理成一份中文${reportTypeLabels[request.reportType]}。

【汇报口径】
- 版本：${reportStyleLabels[request.style]}
- 表达要求：${styleGuidance[request.style]}
- 汇报人：${context.name || "未提供，不要自行补写"}
- 部门/项目：${context.department || "未提供，不要自行补写"}
- 阅读对象：${context.audience || "直属领导 / 管理层"}
- 汇报周期：${period}
- 补充要求：${context.extraInstruction || "无"}

【零散工作记录】
${request.rawNotes.slice(0, 45_000)}

【整理要求】
1. managementSummary 用 2-4 句话先讲结论：整体进展、最重要成果、主要风险和下一步重点。
2. achievements 按价值从高到低排列。每项包含结论式标题、具体说明和 evidence 数据/事实数组；没有真实数据时 evidence 可以为空，不得编造。
3. issues 只写真实出现或能从记录中明确判断的问题。每项说明影响和动作；若没有明确问题，返回空数组。
4. nextPlans 要与当前进展和问题对应。日报写明日/近期计划，周报写下周计划，月报写下月计划。
5. closingNote 只在确有需要管理层关注、协调或决策时填写，否则返回空字符串。
6. 保留关键专有名词和数据，删除口头禅、流水账、重复描述与无信息量套话。

严格返回以下 JSON 结构：
{
  "reportTitle": "清楚具体的汇报标题",
  "period": "汇报周期",
  "managementSummary": "管理层摘要",
  "achievements": [
    {
      "title": "结论式成果标题",
      "detail": "完成内容、业务影响和当前状态",
      "evidence": ["可核验数据或事实"]
    }
  ],
  "issues": [
    {
      "title": "当前问题",
      "impact": "影响范围或风险",
      "action": "已采取动作或建议动作"
    }
  ],
  "nextPlans": [
    {
      "item": "计划事项",
      "goal": "预期交付或目标",
      "timing": "明确时间"
    }
  ],
  "closingNote": "需要管理层关注、协调或决策的事项"
}`;
}
