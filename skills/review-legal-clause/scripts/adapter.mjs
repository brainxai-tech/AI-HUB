const MAX_CLAUSE_CHARS = 20_000;

export const adapter = {
  async start({ input, client, now }) {
    const source = validateStartInput(input);
    const model = await client.resolveModel("legal", source.model);
    const analysis = await analyze(client, { ...source, model, clauseText: source.clauseText });
    const version = analysisVersion({
      sequence: 1,
      analysis,
      jurisdiction: source.jurisdiction,
      createdAt: now(),
      reviewerNotes: source.reviewerNotes,
      supplementalContext: "",
    });
    return analysisReviewTransition({
      source: { ...source, model },
      analysisVersions: [version],
      reviewDecisions: [],
    });
  },

  async action({ run, actionId, input, client, now }) {
    if (actionId !== "reanalyze") throw validationError("未知的法务审阅动作。");
    if (run.status !== "waiting" || run.checkpoint?.id !== "analysis-review") {
      throw validationError("只有在分析复核阶段才能重新分析。");
    }
    const additionalContext = requiredInputText(input?.additionalContext, "补充合同上下文", 6_000);
    const reviewerNotes = optionalInputText(input?.reviewerNotes, "版本备注", 4_000);
    const clauseText = [run.context.source.clauseText, "[补充合同上下文]", additionalContext].join("\n\n");
    if (clauseText.length > MAX_CLAUSE_CHARS) {
      throw validationError("原条款与补充上下文合计不能超过 20,000 个字符。");
    }
    const analysis = await analyze(client, { ...run.context.source, clauseText });
    const version = analysisVersion({
      sequence: run.context.analysisVersions.length + 1,
      analysis,
      jurisdiction: run.context.source.jurisdiction,
      createdAt: now(),
      reviewerNotes,
      supplementalContext: additionalContext,
    });
    const context = {
      ...run.context,
      analysisVersions: [...run.context.analysisVersions, version],
    };
    return {
      ...analysisReviewTransition(context),
      actionResult: { action: "reanalyze", versionId: version.id, createdAt: version.createdAt },
    };
  },

  async resume({ run, input, checkpointId, now }) {
    if (checkpointId === "analysis-review") {
      if (input?.decision !== "prepare-lawyer-review") {
        throw validationError("请选择准备律师审阅包，或使用 reanalyze 补充上下文。");
      }
      const reviewerNotes = optionalInputText(input?.reviewerNotes, "分析复核备注", 4_000);
      const latestVersion = run.context.analysisVersions.at(-1);
      const decision = {
        checkpoint: "analysis-review",
        versionId: latestVersion.id,
        decision: "prepare-lawyer-review",
        reviewerNotes,
        at: now(),
      };
      const context = {
        ...run.context,
        reviewDecisions: [...run.context.reviewDecisions, decision],
      };
      context.lawyerReviewPacket = lawyerReviewPacket(context, now());
      return {
        status: "waiting",
        step: "legal-review",
        checkpoint: {
          id: "legal-review",
          title: "人工法律复核",
          instructions: "律师或具备授权的人工复核者检查原文、证据、风险和质量警告，并记录阅读结论。",
          requiredFields: ["decision", "reviewerNotes"],
          decisions: ["approved-for-reading", "needs-lawyer"],
        },
        context,
        result: { lawyerReviewPacket: context.lawyerReviewPacket },
      };
    }

    if (checkpointId === "legal-review") {
      const decision = new Set(["approved-for-reading", "needs-lawyer"]).has(input?.decision)
        ? input.decision
        : "";
      if (!decision) throw validationError("人工法律复核决定无效。");
      const reviewerNotes = requiredInputText(input?.reviewerNotes, "人工复核备注", 4_000);
      const completedAt = now();
      const finalDecision = {
        checkpoint: "legal-review",
        versionId: run.context.analysisVersions.at(-1).id,
        decision,
        reviewerNotes,
        at: completedAt,
      };
      const context = {
        ...run.context,
        reviewDecisions: [...run.context.reviewDecisions, finalDecision],
      };
      return {
        status: "completed",
        step: decision,
        context,
        result: {
          decision,
          completedAt,
          analysisVersions: context.analysisVersions,
          lawyerReviewPacket: context.lawyerReviewPacket,
          reviewDecisions: context.reviewDecisions,
          audit: {
            humanReviewRecorded: true,
            reviewerNotes,
            disclaimer: context.analysisVersions.at(-1).disclaimer,
          },
        },
      };
    }

    throw validationError("未知的法务审阅检查点。");
  },
};

async function analyze(client, source) {
  const response = await client.requestJson("legal", "/api/analyze", {
    method: "POST",
    body: {
      provider: "openai",
      model: source.model,
      clauseText: source.clauseText,
      userRole: source.userRole,
      contractType: source.contractType,
      jurisdiction: source.jurisdiction,
      outputLanguage: source.outputLanguage,
    },
  });
  const result = response?.result;
  if (!result || typeof result !== "object" || typeof result.disclaimer !== "string" || !result.disclaimer.trim()) {
    throw validationError("法务项目没有返回包含免责声明的有效分析。");
  }
  return structuredClone(result);
}

function analysisReviewTransition(context) {
  const latest = context.analysisVersions.at(-1);
  return {
    status: "waiting",
    step: "analysis-review",
    checkpoint: {
      id: "analysis-review",
      title: "复核条款分析",
      instructions: "逐条对照原文证据、风险和质量警告；可补充上下文重新分析，或准备律师审阅包。",
      requiredFields: ["decision"],
      actions: ["reanalyze"],
      versionId: latest.id,
      evidenceSnippets: latest.evidenceSnippets,
      qualityWarnings: latest.qualityWarnings,
      disclaimer: latest.disclaimer,
    },
    context,
    result: { analysisVersion: latest },
  };
}

function analysisVersion({ sequence, analysis, jurisdiction, createdAt, reviewerNotes, supplementalContext }) {
  return {
    id: `analysis-${sequence}`,
    createdAt,
    jurisdiction,
    reviewerNotes,
    supplementalContext,
    disclaimer: analysis.disclaimer,
    qualityWarnings: Array.isArray(analysis.qualityWarnings) ? structuredClone(analysis.qualityWarnings) : [],
    evidenceSnippets: collectEvidenceSnippets(analysis),
    analysis: structuredClone(analysis),
  };
}

function lawyerReviewPacket(context, preparedAt) {
  return {
    preparedAt,
    purpose: "human-lawyer-review",
    modelOnly: true,
    jurisdiction: context.source.jurisdiction,
    contractType: context.source.contractType,
    userRole: context.source.userRole,
    reviewGoal: context.source.reviewGoal,
    clauseText: context.source.clauseText,
    analysisVersions: context.analysisVersions.map((version) => ({
      id: version.id,
      createdAt: version.createdAt,
      jurisdiction: version.jurisdiction,
      reviewerNotes: version.reviewerNotes,
      supplementalContext: version.supplementalContext,
      plainLanguage: version.analysis.plainLanguage,
      userObligations: version.analysis.userObligations,
      counterpartyRights: version.analysis.counterpartyRights,
      risks: version.analysis.risks,
      ambiguousTerms: version.analysis.ambiguousTerms,
      lawyerQuestions: version.analysis.lawyerQuestions,
      negotiationSuggestions: version.analysis.negotiationSuggestions,
      qualityWarnings: version.qualityWarnings,
      evidenceSnippets: version.evidenceSnippets,
      disclaimer: version.disclaimer,
    })),
    reviewDecisions: structuredClone(context.reviewDecisions),
    boundary: "模型输出不构成法律意见；重大事项应由相关法域的合格律师复核。",
  };
}

function collectEvidenceSnippets(analysis) {
  const snippets = [];
  const seen = new Set();
  for (const collection of [analysis.userObligations, analysis.counterpartyRights, analysis.risks]) {
    for (const item of Array.isArray(collection) ? collection : []) {
      for (const value of [item?.evidenceText, item?.originalSignal]) {
        const snippet = optionalText(value, 500);
        if (!snippet || seen.has(snippet)) continue;
        seen.add(snippet);
        snippets.push(snippet);
        if (snippets.length >= 60) return snippets;
      }
    }
  }
  return snippets;
}

function validateStartInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validationError("缺少合同条款审阅输入。");
  }
  const clauseText = requiredInputText(value.clauseText, "合同条款", MAX_CLAUSE_CHARS);
  if (clauseText.length < 20) throw validationError("合同条款至少需要 20 个字符。");
  const outputLanguage = new Set(["zh-CN", "en"]).has(value.outputLanguage) ? value.outputLanguage : "zh-CN";
  return {
    clauseText,
    userRole: optionalInputText(value.userRole, "合同身份", 80) || "合同审阅方",
    contractType: optionalInputText(value.contractType, "合同类型", 80) || "未指定",
    jurisdiction: optionalInputText(value.jurisdiction, "法域", 80) || "未指定",
    outputLanguage,
    reviewGoal: optionalInputText(value.reviewGoal, "审阅目标", 2_000),
    reviewerNotes: optionalInputText(value.reviewerNotes, "初始复核备注", 4_000),
    model: optionalInputText(value.model, "模型", 160),
  };
}

function requiredInputText(value, label, maxLength) {
  const text = optionalInputText(value, label, maxLength);
  if (!text) throw validationError(`${label}不能为空。`);
  return text;
}

function optionalInputText(value, label, maxLength) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw validationError(`${label}必须是文本。`);
  const text = value.trim();
  if (text.length > maxLength) throw validationError(`${label}不能超过 ${maxLength} 个字符。`);
  return text;
}

function optionalText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validationError(message) {
  const error = new Error(message);
  error.code = "VALIDATION_ERROR";
  error.status = 422;
  return error;
}
