import { audienceLabels, reportTypeLabels } from "../src/shared/contracts.js";
export function buildSystemPrompt() {
    return [
        "你是一位服务于中国企业管理层的资深汇报顾问、PPT 信息架构师和演讲教练。",
        "你的任务不是堆砌材料，而是帮助汇报者推动一个明确决定。",
        "先判断听众关切，再设计结论先行、证据充分、可在限定时间内讲完的叙事。",
        "所有建议必须基于用户资料；材料没有提供的数据要明确标记为待补充，不得编造事实、数字、客户或结论。",
        "每页只表达一个核心观点，标题应尽量是结论句而不是名词。",
        "仅返回合法 JSON，不要 Markdown 代码围栏、解释或额外文本。"
    ].join("\n");
}
export function buildUserPrompt(request) {
    const { input } = request;
    const source = input.sourceText.trim()
        ? input.sourceText.slice(0, 70_000)
        : "（未上传资料，仅根据主题规划；涉及事实和数字时必须标记‘待补充’。）";
    return `请生成一套可直接编辑和导出为 PPTX 的中文汇报方案。

【汇报主题】
${input.topic}

【汇报场景】
- 类型：${reportTypeLabels[input.reportType]}
- 听众：${audienceLabels[input.audience]}
- 时长：${input.durationMinutes} 分钟
- 页数：严格输出 ${input.slideCount} 页
- 特别强调：${input.emphasis || "无"}
- 资料文件：${input.sourceName || "无"}

【资料正文】
${source}

【输出要求】
1. 用 objectiveAudience 分析汇报目标、听众画像、希望推动的决定、成功标准和沟通策略。
2. 用 structure 设计 3-6 个叙事章节，说明开场钩子和收尾行动。
3. slides 必须严格为 ${input.slideCount} 项，page 从 1 连续编号；每页标题是结论句。
4. 每页给出 keyMessage、1-5 条 bullets、证据、数据建议、图表建议、可直接照读再润色的 speakerNotes、预计秒数和 visualType。
5. leadershipQuestions 给出 5-8 个领导可能追问的问题、背后关切、回答策略和示范回答；材料不足时在示范回答中坦诚指出下一步补数动作。
6. 所有页面 timingSeconds 总和尽量接近 ${input.durationMinutes * 60} 秒。
7. visualType 只能使用 title / metrics / chart / comparison / timeline / process / content / closing。

严格返回以下 JSON 结构：
{
  "title": "汇报主标题",
  "subtitle": "一句话副标题",
  "objectiveAudience": {
    "objective": "本次汇报的核心目标",
    "audienceProfile": "听众最关心什么、担心什么",
    "decisionWanted": "希望听众现场做出的决定",
    "successCriteria": ["标准1", "标准2", "标准3"],
    "communicationStrategy": "沟通策略"
  },
  "structure": {
    "narrative": "整套汇报的故事线",
    "openingHook": "开场钩子",
    "sections": [{"name":"章节名","purpose":"本章作用","pageRange":"1-2"}],
    "closingAction": "收尾行动"
  },
  "slides": [{
    "page": 1,
    "title": "结论式标题",
    "role": "本页在叙事中的作用",
    "keyMessage": "听众必须记住的一句话",
    "bullets": ["要点1", "要点2"],
    "evidence": "支撑证据或待补充项",
    "dataSuggestion": "建议补充的数据及口径",
    "chartSuggestion": "建议图表类型、横纵轴和重点标注",
    "speakerNotes": "演讲备注",
    "timingSeconds": 60,
    "visualType": "content"
  }],
  "leadershipQuestions": [{
    "question": "可能追问",
    "concernBehindIt": "背后关切",
    "answerStrategy": "回答策略",
    "sampleAnswer": "示范回答"
  }],
  "coaching": {
    "openingScript": "30 秒开场话术",
    "transitions": ["过渡句1", "过渡句2"],
    "deliveryTips": ["技巧1", "技巧2", "技巧3"],
    "finalReminder": "上场前最后提醒"
  }
}`;
}
