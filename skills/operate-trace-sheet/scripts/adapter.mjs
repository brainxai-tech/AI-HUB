const FORBIDDEN_INPUT_KEYS = new Set(["rows", "cells", "data"]);
const RISK_LEVELS = new Set(["LOW", "MEDIUM", "HIGH"]);
const PLAN_MODES = new Set(["AI", "LOCAL"]);
const MAX_ROW_COUNT = 10_000_000_000;

export const adapter = {
  async prepare(command) {
    rejectForbiddenKeys(command?.input);
    if (command?.type === "start") return validatePlanRequest(command.input);
    if (command?.type === "action" && command.actionId === "revise-plan") {
      return validateRevisionInput(command.input);
    }
    if (command?.type === "resume" && command.checkpointId === "review-plan") {
      return validateApprovalInput(command.input);
    }
    if (command?.type === "resume" && command.checkpointId === "execution-receipt") {
      return { receipt: validateReceipt(command.input?.receipt) };
    }
    throw validationError("未知的 TraceSheet 工作流命令。");
  },

  async start({ input, client, now }) {
    const request = validatePlanRequest(input);
    const revision = await generateRevision(client, request, now);
    return reviewPlanTransition({
      sources: request.context.sources,
      planRevisions: [revision],
      approval: null,
      receipt: null,
    });
  },

  async action({ run, actionId, input, client, now }) {
    if (actionId !== "revise-plan") throw validationError("未知的 TraceSheet 工作流动作。");
    if (run.status !== "waiting" || run.checkpoint?.id !== "review-plan") {
      throw validationError("只有在计划审核阶段才能修订计划。");
    }
    const { goal, notes } = validateRevisionInput(input);
    const activeSourceId = latestRevision(run.context).plan.sourceId;
    const request = validatePlanRequest({
      goal,
      context: { activeSourceId, sources: run.context.sources },
    });
    const generated = await generateRevision(client, request, now);
    const revision = {
      ...generated,
      notice: [generated.notice, notes ? `修订备注：${notes}` : ""].filter(Boolean).join("\n").slice(0, 2_000),
    };
    const context = {
      ...run.context,
      planRevisions: [...run.context.planRevisions, revision],
      approval: null,
      receipt: null,
    };
    return {
      ...reviewPlanTransition(context),
      actionResult: {
        action: "revise-plan",
        revision: context.planRevisions.length,
        createdAt: revision.createdAt,
      },
    };
  },

  async resume({ run, input, checkpointId, now }) {
    if (checkpointId === "review-plan") {
      const approvedInput = validateApprovalInput(input);
      const approval = {
        decision: "approved",
        at: now(),
        notes: approvedInput.notes,
      };
      const context = { ...run.context, approval, receipt: null };
      return {
        status: "waiting",
        step: "execution-receipt",
        checkpoint: {
          id: "execution-receipt",
          title: "提交浏览器执行回执",
          instructions: "在 TraceSheet 浏览器中执行已批准计划，只提交版本 ID、行数统计、警告和审计哈希。",
          requiredFields: ["receipt"],
          browserLocalExecution: true,
        },
        context,
        result: {
          approvedPlanRevision: latestRevision(context),
          approval,
        },
      };
    }

    if (checkpointId === "execution-receipt") {
      if (run.context?.approval?.decision !== "approved") {
        throw validationError("计划尚未获批，不能提交执行回执。");
      }
      const receipt = validateReceipt(input?.receipt);
      const context = { ...run.context, receipt };
      return {
        status: "completed",
        step: "complete-audit",
        context,
        result: {
          planRevision: latestRevision(context),
          approval: context.approval,
          receipt,
          audit: {
            metadataOnly: true,
            browserLocalExecution: true,
            rawSpreadsheetPersisted: false,
          },
        },
      };
    }

    throw validationError("未知的 TraceSheet 工作流检查点。");
  },
};

async function generateRevision(client, request, now) {
  const response = await client.requestJson("tracesheet", "/api/plan", {
    method: "POST",
    body: request,
  });
  const plan = sanitizePlan(response?.plan, request.context);
  const mode = PLAN_MODES.has(response?.mode) ? response.mode : plan.generatedBy;
  return {
    plan,
    mode,
    notice: optionalText(response?.notice, "计划提示", 2_000),
    createdAt: now(),
  };
}

function reviewPlanTransition(context) {
  const revision = latestRevision(context);
  return {
    status: "waiting",
    step: "review-plan",
    checkpoint: {
      id: "review-plan",
      title: "审核 TraceSheet 变换计划",
      instructions: "在浏览器中加载真实数据并核对差异预览；所有去重步骤必须按高风险确认。",
      requiredFields: ["approved"],
      actions: ["revise-plan"],
      revision: context.planRevisions.length,
      plan: revision.plan,
      mode: revision.mode,
      notice: revision.notice,
    },
    context,
    result: { planRevision: revision },
  };
}

function validatePlanRequest(value) {
  const input = requiredRecord(value, "TraceSheet 计划输入");
  const goal = requiredText(input.goal, "处理目标", 2_000);
  if (goal.length < 2) throw validationError("处理目标至少需要 2 个字符。");
  const contextInput = requiredRecord(input.context, "数据源上下文");
  if (!Array.isArray(contextInput.sources) || contextInput.sources.length < 1 || contextInput.sources.length > 20) {
    throw validationError("数据源元数据必须包含 1 到 20 个数据源。");
  }
  const sources = contextInput.sources.map(validateSource);
  const ids = new Set(sources.map(({ id }) => id));
  if (ids.size !== sources.length) throw validationError("数据源 ID 必须唯一。");
  const activeSourceId = requiredText(contextInput.activeSourceId, "主数据源 ID", 160);
  if (!ids.has(activeSourceId)) throw validationError("主数据源 ID 不在数据源元数据中。");
  return { goal, context: { activeSourceId, sources } };
}

function validateRevisionInput(value) {
  const input = requiredRecord(value, "TraceSheet 修订输入");
  return {
    goal: requiredText(input.goal, "修订目标", 2_000),
    notes: optionalText(input.notes, "修订原因", 2_000),
  };
}

function validateApprovalInput(value) {
  const input = requiredRecord(value, "TraceSheet 审核输入");
  if (input.approved !== true) throw validationError("必须明确批准计划后才能进入浏览器执行阶段。");
  return {
    approved: true,
    notes: optionalText(input.notes, "审核备注", 2_000),
  };
}

function validateSource(value, index) {
  const source = requiredRecord(value, `数据源 ${index + 1}`);
  const columns = stringList(source.columns, `数据源 ${index + 1} 的字段`, 200, 200);
  return {
    id: requiredText(source.id, `数据源 ${index + 1} 的 ID`, 160),
    name: requiredText(source.name, `数据源 ${index + 1} 的名称`, 240),
    fileName: requiredText(source.fileName, `数据源 ${index + 1} 的文件名`, 500),
    sheetName: requiredText(source.sheetName, `数据源 ${index + 1} 的工作表名`, 240),
    columns,
    rowCount: boundedInteger(source.rowCount, `数据源 ${index + 1} 的行数`, MAX_ROW_COUNT),
  };
}

function sanitizePlan(value, context) {
  const plan = requiredRecord(value, "TraceSheet 计划");
  if (plan.schemaVersion !== "1.0") throw validationError("TraceSheet 计划版本不受支持。");
  const sourceId = requiredText(plan.sourceId, "计划主数据源 ID", 160);
  if (sourceId !== context.activeSourceId) throw validationError("计划主数据源与请求不一致。");
  if (!Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > 12) {
    throw validationError("TraceSheet 计划必须包含 1 到 12 个步骤。");
  }
  const generatedBy = PLAN_MODES.has(plan.generatedBy) ? plan.generatedBy : "LOCAL";
  return {
    id: requiredText(plan.id, "计划 ID", 200),
    schemaVersion: "1.0",
    goal: requiredText(plan.goal, "计划目标", 2_000),
    sourceId,
    createdAt: requiredText(plan.createdAt, "计划创建时间", 100),
    generatedBy,
    steps: plan.steps.map(sanitizePlanStep),
  };
}

function sanitizePlanStep(value, index) {
  const step = requiredRecord(value, `计划步骤 ${index + 1}`);
  const operation = sanitizeOperation(step.operation, index);
  const suppliedRisk = typeof step.risk === "string" ? step.risk.toUpperCase() : "";
  if (!RISK_LEVELS.has(suppliedRisk)) throw validationError(`计划步骤 ${index + 1} 的风险等级无效。`);
  return {
    id: requiredText(step.id, `计划步骤 ${index + 1} 的 ID`, 200),
    title: requiredText(step.title, `计划步骤 ${index + 1} 的标题`, 500),
    reason: requiredText(step.reason, `计划步骤 ${index + 1} 的原因`, 2_000),
    risk: operation.op === "DEDUP" ? "HIGH" : suppliedRisk,
    operation,
  };
}

function sanitizeOperation(value, index) {
  const operation = requiredRecord(value, `计划步骤 ${index + 1} 的操作`);
  switch (operation.op) {
    case "JOIN":
      return {
        op: "JOIN",
        rightSourceId: requiredText(operation.rightSourceId, "关联数据源 ID", 160),
        leftKey: requiredText(operation.leftKey, "主表关联字段", 200),
        rightKey: requiredText(operation.rightKey, "关联表字段", 200),
        rightColumns: stringList(operation.rightColumns, "关联引入字段", 200, 200, true),
        joinType: oneOf(operation.joinType, ["LEFT", "INNER"], "关联类型"),
      };
    case "UNION":
      return { op: "UNION", sourceIds: stringList(operation.sourceIds, "追加数据源 ID", 20, 160, true) };
    case "TRIM":
      return { op: "TRIM", columns: stringList(operation.columns, "清理字段", 200, 200, true) };
    case "NORMALIZE_DATE":
      return { op: "NORMALIZE_DATE", columns: stringList(operation.columns, "日期字段", 200, 200, true) };
    case "REPLACE":
      return {
        op: "REPLACE",
        column: requiredText(operation.column, "替换字段", 200),
        find: requiredText(operation.find, "查找内容", 1_000),
        replaceWith: optionalText(operation.replaceWith, "替换内容", 1_000),
      };
    case "DEDUP":
      return {
        op: "DEDUP",
        keys: stringList(operation.keys, "去重字段", 200, 200, true),
        keep: oneOf(operation.keep, ["FIRST", "LAST"], "去重保留规则"),
      };
    case "ADD_FORMULA_COLUMN":
      return {
        op: "ADD_FORMULA_COLUMN",
        columnName: requiredText(operation.columnName, "公式字段名", 200),
        expression: requiredText(operation.expression, "公式表达式", 2_000),
        emptyOnError: operation.emptyOnError !== false,
      };
    default:
      throw validationError(`计划步骤 ${index + 1} 包含不支持的操作。`);
  }
}

function validateReceipt(value) {
  const receipt = requiredRecord(value, "执行回执");
  const inputRows = boundedInteger(receipt.inputRows, "输入行数", MAX_ROW_COUNT);
  const outputRows = boundedInteger(receipt.outputRows, "输出行数", MAX_ROW_COUNT);
  const changedRows = boundedInteger(receipt.changedRows, "变化行数", MAX_ROW_COUNT);
  if (changedRows > Math.max(inputRows, outputRows)) {
    throw validationError("变化行数不能超过输入和输出行数的较大值。");
  }
  const auditHash = requiredText(receipt.auditHash, "审计哈希", 256);
  if (!/^[A-Za-z0-9:_-]{16,256}$/.test(auditHash)) throw validationError("审计哈希格式无效。");
  return {
    finalVersionId: requiredText(receipt.finalVersionId, "最终版本 ID", 200),
    inputRows,
    outputRows,
    changedRows,
    warnings: stringList(receipt.warnings ?? [], "执行警告", 20, 500),
    auditHash,
  };
}

function latestRevision(context) {
  const revisions = context?.planRevisions;
  if (!Array.isArray(revisions) || !revisions.length) throw validationError("工作流缺少计划版本。");
  return revisions.at(-1);
}

function rejectForbiddenKeys(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_INPUT_KEYS.has(key.toLowerCase())) {
      throw validationError(`工作流输入不能包含 ${key} 字段；原始表格数据必须留在浏览器。`);
    }
    rejectForbiddenKeys(nested, seen);
  }
}

function requiredRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw validationError(`${label}必须是对象。`);
  return value;
}

function requiredText(value, label, maxLength) {
  const text = optionalText(value, label, maxLength);
  if (!text) throw validationError(`${label}不能为空。`);
  return text;
}

function optionalText(value, label, maxLength) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw validationError(`${label}必须是文本。`);
  const text = value.trim();
  if (text.length > maxLength) throw validationError(`${label}不能超过 ${maxLength} 个字符。`);
  return text;
}

function stringList(value, label, maxItems, maxLength, requireItems = false) {
  if (!Array.isArray(value) || value.length > maxItems || (requireItems && value.length < 1)) {
    throw validationError(`${label}必须是${requireItems ? "非空" : ""}数组，且最多包含 ${maxItems} 项。`);
  }
  return value.map((item, index) => requiredText(item, `${label}第 ${index + 1} 项`, maxLength));
}

function boundedInteger(value, label, maximum) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw validationError(`${label}必须是 0 到 ${maximum} 之间的整数。`);
  }
  return value;
}

function oneOf(value, options, label) {
  if (!options.includes(value)) throw validationError(`${label}无效。`);
  return value;
}

function validationError(message) {
  const error = new Error(message);
  error.code = "VALIDATION_ERROR";
  error.status = 422;
  return error;
}
