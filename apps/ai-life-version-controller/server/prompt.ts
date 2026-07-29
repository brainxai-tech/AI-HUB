import type { GenerateRequest } from "../src/shared/contracts.js";

export function buildSystemPrompt() {
  return [
    "你是一个严谨的 AI 产品原型引擎，任务是把人生选择转成 Git 风格的版本控制结构。",
    "你必须输出简体中文 JSON，不能输出 Markdown，不能解释 JSON 外的内容。",
    "产品定位是决策辅助和复盘，不替用户做最终人生决定。",
    "避免医疗、法律、金融、心理诊断等高风险确定性建议；遇到高风险内容时加入人工确认和专业求助边界。",
    "所有建议都要落到可执行 next commit，偏向小实验、证据、回滚点和冲突消解。",
    "",
    "【输入增强协议】",
    "用户输入可能很随意、情绪化、碎片化或缺少背景。你要先在内部把它重写成一个更适合分析的决策上下文，但不要把重写过程输出到 JSON 外。",
    "内部重写时必须识别：1) 用户真正想解决的选择；2) 当前分支的默认路径；3) 至少 2 个候选分支；4) 明确约束；5) 可用资源；6) 价值观张力；7) 最大不可逆风险；8) 最小可验证问题。",
    "如果用户没写清楚某项，不要编造具体事实；用保守假设表达为 hypothesis、risk、signal 或 rollbackPoint，并让 nextCommit 去补证据。",
    "把模糊表达翻译成可观察信号。例如“很迷茫”要转成信息不足、选择过多、反馈缺失或精力不足；“想换方向”要转成可逆实验和回滚点。",
    "必须保留用户输入里的具体对象、产品名、方向名和人名。如果用户明确写了一个产品或选择对象，所有主要 branch、diff、conflict 和 nextCommit 都要围绕这个对象展开。",
    "不要擅自替换用户的项目方向；除非用户明确要求探索新方向，否则不能把“AI 人生版本控制器”改写成“AI 写作助手”等无关产品。",
    "如果用户的 decision 句子形如“要不要把 X 做成/继续做成/发布为/投入到 Y”，则 X 或 Y 是最高优先级决策对象；statusSummary、推荐分支和 nextCommit 必须显式围绕它。",
    "禁止把明确项目降级成泛泛的“AI 产品点子”“工具站”“Bot”“换方向”等说法；这些只能作为实现形式，不能替代用户原项目。",
    "优先输出能帮助用户继续行动的问题框架，而不是漂亮但空泛的人生建议。",
    "",
    "【回答质量标准】",
    "每个 branch 必须有清晰假设、真实 tradeoff、失败信号、回滚点和下一步 commit。",
    "conflict 必须体现真实冲突，不能只写同义反复；优先发现价值观、时间、金钱、精力、关系、身份和机会成本之间的冲突。",
    "diff 必须像版本差异一样对比 main 与推荐分支的具体变化，不能泛泛说好坏。",
    "nextCommit 必须是用户今天或明天能完成的 30-90 分钟行动，并产生新证据。",
    "nextCommit.nextAction 必须描述下一步立刻要做什么，不能只写“根据结果再决定”。",
    "语气要像冷静的技术合伙人：清晰、克制、具体、有边界感。"
  ].join("\n");
}

export function buildUserPrompt(request: GenerateRequest) {
  const input = request.input;
  const decisionAnchor = inferDecisionAnchor(input.decision);
  return `
请根据以下用户上下文生成一个 LifeRepoPlan JSON。

用户输入：
- repoName: ${input.repoName}
- currentState: ${input.currentState}
- decision: ${input.decision}
- values: ${input.values}
- constraints: ${input.constraints}
- resources: ${input.resources}
- timeHorizon: ${input.timeHorizon}

最高优先级决策锚点：
- decision 原文必须被视为真实任务边界：${input.decision}
- 程序提取的决策对象锚点：${decisionAnchor}
- 如果这个锚点不是整句问题，而是一个产品/项目/方向名，statusSummary、推荐分支、diff、conflict 和 nextCommit 必须逐字保留并围绕它展开。
- 如果 decision 中出现具体产品、项目或方向，statusSummary 必须提到它，至少 3 条 branch 的 description 或 nextCommit 必须围绕它，不能改成别的产品。
- 可以建议定位、验证、发布、缩小范围、回滚和用户访谈，但不能替换决策对象。
- 禁止说“具体产品未定”，除非 decision 原文本身没有任何具体项目或方向。

请先在内部把上面的原始输入整理成：
- 决策对象：用户到底在选择什么
- 命名实体：用户明确提到的产品、项目、人、机构或方向，必须原样保留
- 当前默认路径：不改变时会继续发生什么
- 可逆实验：可以低成本验证什么
- 不可逆风险：哪些动作需要先设置保护线
- 证据缺口：哪些信息不能靠猜，需要 nextCommit 获取
- 价值观张力：哪些好东西之间正在冲突

整理后再生成 JSON。不要输出“内部整理”字段，只把整理结果融入 branches、diff、conflicts、commits 和 nextCommit。
若用户已经给出明确产品或方向，禁止替换成另一个无关产品；只能围绕该产品/方向做验证、定位、分支和回滚设计。

严格输出这个 JSON 结构：
{
  "repoName": "string",
  "head": "main",
  "statusSummary": "string",
  "branches": [
    {
      "id": "string",
      "name": "main | feature/... | hotfix/...",
      "status": "current | active | abandoned | merged",
      "description": "string",
      "hypothesis": "string",
      "tradeoffs": ["string"],
      "risks": ["string"],
      "signals": ["string"],
      "rollbackPoint": "string",
      "nextCommit": "string"
    }
  ],
  "diff": [
    {
      "dimension": "string",
      "current": "string",
      "incoming": "string",
      "impact": "low | medium | high"
    }
  ],
  "conflicts": [
    {
      "id": "string",
      "title": "string",
      "branches": ["string"],
      "dimensions": ["string"],
      "severity": "low | medium | high",
      "resolutionStatus": "open",
      "recommendation": "string"
    }
  ],
  "commits": [
    {
      "id": "string",
      "branchId": "string",
      "message": "string",
      "type": "decision | action | reflection | rollback",
      "why": "string",
      "evidence": ["string"],
      "nextAction": "string",
      "createdAt": "ISO date string"
    }
  ],
  "nextCommit": {
    "id": "string",
    "branchId": "string",
    "message": "string",
    "type": "action",
    "why": "string",
    "evidence": ["string"],
    "nextAction": "string",
    "createdAt": "ISO date string"
  },
  "terminalLog": [
    {
      "command": "string",
      "output": "string"
    }
  ],
  "safetyNote": "string"
}

要求：
1. branches 至少 4 条，其中必须包含 main、feature/14-day-validation、hotfix/energy-and-clarity。
2. conflicts 至少 2 条，必须体现价值观、资源或时间冲突。
3. diff 至少 3 条，像 Git diff 一样对比 main 与最推荐分支。
4. nextCommit 必须是 30-90 分钟能完成的下一步行动。
5. statusSummary 必须直接回应 decision 原文里的具体选择对象；如果存在程序提取的决策对象锚点，必须包含：${decisionAnchor}。
6. createdAt 使用当前时间：${new Date().toISOString()}。
`.trim();
}

export function inferDecisionAnchor(decision: string) {
  const normalized = decision.trim().replace(/\s+/g, " ");
  const patterns = [
    /把\s*(.+?)\s*(?:继续)?做成/u,
    /把\s*(.+?)\s*发布/u,
    /投入(?:到)?\s*(.+?)(?:上|方向|领域|里|中|[？?。.]|$)/u,
    /是否\s*(.+?)(?:[？?。.]|$)/u
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const anchor = match?.[1]?.trim();
    if (anchor && anchor.length >= 2) return trimDecisionAnchor(anchor);
  }

  return normalized || "当前人生选择";
}

function trimDecisionAnchor(value: string) {
  return value
    .replace(/^(一个|这个|那个|这条|该)\s*/u, "")
    .replace(/\s*(继续|做成|发布|投入|方向|领域)$/u, "")
    .trim();
}
