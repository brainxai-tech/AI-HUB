import type { BranchPlan, ConflictPlan, GenerateRequest, LifeRepoPlan } from "../src/shared/contracts.js";

export function buildDemoPlan(request: GenerateRequest): LifeRepoPlan {
  const input = request.input;
  const now = new Date().toISOString();
  const decision = clean(input.decision, "要不要为一个新人生选择开分支");
  const repoName = clean(input.repoName, "life/main");
  const horizon = clean(input.timeHorizon, "未来 90 天");
  const values = clean(input.values, "成长、自由、稳定");

  const branches: BranchPlan[] = [
    {
      id: "main",
      name: "main",
      status: "current",
      description: "保持当前路线，但把焦虑从脑内搬到可执行队列。",
      hypothesis: "当前路径不是错，只是缺少节奏、验证点和明确的下一步。",
      tradeoffs: ["风险最低", "机会成本仍在累积", "适合先稳定现金流和精力"],
      risks: ["容易把拖延包装成稳妥", "半年后仍然停留在同一轮纠结"],
      signals: ["每周能稳定完成 2 个小行动", "压力下降而不是继续堆积"],
      rollbackPoint: "连续两周没有新增 commit 时，必须切到实验分支。",
      nextCommit: "写出本周唯一不可跳过的行动，并设定 45 分钟完成窗口。"
    },
    {
      id: "branch-validate",
      name: "feature/14-day-validation",
      status: "active",
      description: "把选择缩小成 14 天可验证实验，而不是一次性押注。",
      hypothesis: "如果这个方向值得继续，14 天内应该能得到真实反馈，而不是更多想象。",
      tradeoffs: ["信息增量最大", "短期节奏会更紧", "不会立刻改变人生基础设施"],
      risks: ["实验指标设计太宽松", "把研究资料当成执行成果"],
      signals: ["至少 5 个真实外部反馈", "产出一个能被别人理解的样品"],
      rollbackPoint: "第 14 天没有外部反馈或样品，就 revert 到 main 并重写问题。",
      nextCommit: "选一个最小验证对象，今天发出第一条邀请或交付一个 v0。"
    },
    {
      id: "branch-bold",
      name: "feature/bold-move",
      status: "active",
      description: "把大胆路线单独开分支，明确代价、保护线和触发条件。",
      hypothesis: "真正让你兴奋的不是逃离当下，而是更高密度地接近重要目标。",
      tradeoffs: ["成长速度更快", "现金流和关系成本更明显", "需要更强的风险边界"],
      risks: ["情绪高点时过度承诺", "忽略现实约束"],
      signals: ["关键资源能在 30 天内补齐", "最坏情况仍可承受"],
      rollbackPoint: "预算、健康或关系任一红线被触发时，停止扩张并进入 hotfix。",
      nextCommit: "列出 3 条不可突破的红线，再决定是否推进。"
    },
    {
      id: "branch-hotfix",
      name: "hotfix/energy-and-clarity",
      status: "active",
      description: "先修复精力、信息混乱和情绪噪音，再做大选择。",
      hypothesis: "问题可能不是选择本身，而是当前系统状态不足以做高质量判断。",
      tradeoffs: ["立刻降低误判率", "看起来不够刺激", "适合压力高时启动"],
      risks: ["无限期自我修复", "用整理替代行动"],
      signals: ["睡眠、任务、信息输入变清晰", "能连续三天做出小决定"],
      rollbackPoint: "7 天后没有清晰度提升，就切回验证分支获取外部信息。",
      nextCommit: "删掉一个噪音输入，保留一个决策记录入口。"
    }
  ];

  const conflicts: ConflictPlan[] = [
    {
      id: "conflict-stability-growth",
      title: "稳定现金流 vs 高成长试错",
      branches: ["main", "feature/bold-move"],
      dimensions: ["金钱", "时间", "身份"],
      severity: "high",
      resolutionStatus: "open",
      recommendation: "不要直接 merge 大胆路线。先用 14 天验证分支获得证据，再决定是否扩大投入。"
    },
    {
      id: "conflict-clarity-action",
      title: "想要确定答案 vs 只能通过行动获得答案",
      branches: ["main", "feature/14-day-validation"],
      dimensions: ["信息", "行动", "焦虑"],
      severity: "medium",
      resolutionStatus: "open",
      recommendation: "把问题改写成能被小实验回答的版本，避免在脑内无限 rebase。"
    }
  ];

  return {
    repoName,
    head: "main",
    statusSummary: `${decision} 已拆成 4 条分支；建议在 ${horizon} 内优先跑 feature/14-day-validation。`,
    branches,
    diff: [
      {
        dimension: "可逆性",
        current: "main 保持原路径，损失小但信息增量慢。",
        incoming: "feature/14-day-validation 有明确回滚点，适合先试。",
        impact: "high"
      },
      {
        dimension: "价值观匹配",
        current: `当前路线偏向 ${values} 中的稳定部分。`,
        incoming: "验证分支同时保留稳定和探索，不急着做身份级承诺。",
        impact: "medium"
      },
      {
        dimension: "下周行动密度",
        current: "主要靠意志力维持。",
        incoming: "每天一个小 commit，周末做一次 review。",
        impact: "high"
      }
    ],
    conflicts,
    commits: [
      {
        id: "commit-init",
        branchId: "main",
        message: "init: snapshot current life state",
        type: "reflection",
        why: clean(input.currentState, "当前状态需要被记录，而不是继续靠记忆管理。"),
        evidence: [clean(input.constraints, "时间、金钱、精力都有现实边界。")],
        nextAction: "把当前问题写成一个可以被验证的问题。",
        createdAt: now
      }
    ],
    nextCommit: {
      id: "commit-next",
      branchId: "branch-validate",
      message: "commit: run first 14-day validation step",
      type: "action",
      why: "下一步应该制造证据，而不是追求一次性想清楚。",
      evidence: [decision, `时间窗口：${horizon}`],
      nextAction: "今天完成一个 45 分钟的小验证，并记录结果。",
      createdAt: now
    },
    terminalLog: [
      {
        command: "life status",
        output: "2 conflicts, 4 branches, 1 next commit"
      },
      {
        command: "life diff main..feature/14-day-validation",
        output: "highest signal path: reversible experiment"
      },
      {
        command: "life commit -m \"run first validation step\"",
        output: "ready when you are"
      }
    ],
    safetyNote: "这是决策辅助和复盘工具，不替代医疗、法律、金融或心理健康专业建议。"
  };
}

function clean(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}
