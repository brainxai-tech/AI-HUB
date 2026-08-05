import type { AnalyzeRequest, ComposeRequest, OutlineRequest } from "../src/shared/contracts.js";

export function buildSystemPrompt() {
  return [
    "你是面向中学生的中文写作教练，不是作业代写器。",
    "你的任务是帮助用户审题、使用真实素材、形成结构、完成初稿并理解如何修改。",
    "语言必须符合用户年级，清楚自然，不堆砌名人名言、生僻词或模板化排比。",
    "不得擅自改变用户提供的人物、事件和关键事实；没有真实素材时要明确使用示例方向。",
    "不要承诺高分、原创率或绕过 AI 检测。",
    "只输出合法 JSON，不要输出 Markdown，也不要在 JSON 外解释。"
  ].join("\n");
}

export function buildAnalyzePrompt(request: AnalyzeRequest) {
  return `
请分析下面的作文任务，并输出 JSON：
${JSON.stringify(request.input, null, 2)}

结构：
{
  "theme": "不超过18字的主题",
  "task": "一句话说明真正要完成的写作任务",
  "requirements": ["三条具体要求"],
  "avoid": ["两个容易跑偏的方向"],
  "angles": ["三个不同切入角度"],
  "questions": ["三个帮助用户回忆真实素材的问题"]
}
`.trim();
}

export function buildOutlinePrompt(request: OutlineRequest) {
  return `
请基于题目、审题结果和用户真实素材生成三套明显不同的提纲。
题目：${JSON.stringify(request.input, null, 2)}
审题：${JSON.stringify(request.analysis, null, 2)}
素材：${JSON.stringify(request.materials, null, 2)}

只输出：
{
  "outlines": [
    {
      "id": "steady | personal | advanced",
      "style": "稳妥型 | 个性型 | 提分型",
      "title": "作文标题",
      "thesis": "中心思想",
      "highlight": "这套提纲的独特价值",
      "sections": [
        { "heading": "段落作用", "purpose": "本段写什么", "targetLength": 120 }
      ]
    }
  ]
}
要求每套 5 个 sections，建议字数之和接近 ${request.input.targetLength}。
`.trim();
}

export function buildComposePrompt(request: ComposeRequest) {
  return `
请根据用户选定的提纲写一篇可继续修改的中文作文初稿，并完成教师式讲评。
任务：${JSON.stringify(request.input, null, 2)}
真实素材：${JSON.stringify(request.materials, null, 2)}
选定提纲：${JSON.stringify(request.outline, null, 2)}

关键规则：
1. 正文必须控制在 ${Math.ceil(request.input.targetLength * 0.95)}—${Math.floor(request.input.targetLength * 1.05)} 字。
2. 优先使用用户真实素材，不得擅自编造姓名、学校、地址、奖项或重大经历。
3. 正文要分段，以纯文本字符串输出，不要在 essay 中加入 Markdown 标题。
4. 讲评必须引用正文中的具体证据，不宣称等同于真实考试分数。

只输出：
{
  "title": "标题",
  "essay": "分段正文",
  "characterCount": 800,
  "annotations": [
    { "quote": "正文短句", "note": "具体批注", "tone": "good | revise" }
  ],
  "feedback": {
    "totalScore": 86,
    "dimensions": [
      { "name": "审题 | 立意 | 结构 | 内容 | 语言", "score": 17, "max": 20, "comment": "评价", "evidence": "原文证据" }
    ],
    "strengths": ["两个优点"],
    "priority": "一个最重要的修改建议",
    "nextExercise": "一个5分钟练习"
  },
  "safetyNote": "提醒用户核对事实并继续修改"
}
`.trim();
}
