import type { CoachResult, GenerateRequest } from "../src/shared/contracts.js";

export type QualityIssueCode =
  | "GENERIC_ACTION_OVERUSE"
  | "MISSING_VISIBLE_PROOF"
  | "CHICKEN_SOUP_PHRASE"
  | "SHARP_STYLE_TOO_SOFT"
  | "FRIEND_STYLE_TOO_COLD"
  | "ACTION_TOO_LARGE"
  | "INPUT_ECHO_MISSING";

export type QualityIssue = {
  code: QualityIssueCode;
  message: string;
};

export type QualityReport = {
  passed: boolean;
  score: number;
  issues: QualityIssue[];
};

const chickenSoupPhrases = ["相信自己", "你一定可以", "一切都会好起来", "加油", "做最好的自己"];
const genericActionPatterns = [/写下来/g, /写下/g, /纸上/g, /备忘录/g, /计时器/g, /倒计时/g, /打个勾/g, /5\s*分钟/g];
const visibleProofPatterns = [
  /截图/,
  /发送/,
  /已发送/,
  /草稿/,
  /文件/,
  /记录/,
  /清单/,
  /删除/,
  /完成/,
  /提交/,
  /打开/,
  /桌面/,
  /手机/,
  /修改时间/,
  /消息/,
  /勾/,
  /证据/
];

export function evaluateCoachResult(input: GenerateRequest, result: CoachResult): QualityReport {
  if (result.safetyMode) {
    return { passed: true, score: 100, issues: [] };
  }

  const issues: QualityIssue[] = [];
  const outputText = flattenResultText(result);
  const actionText = result.actions.map((action) => `${action.title} ${action.firstStep} ${action.proof}`).join("\n");

  const genericHits = countGenericActionHits(actionText);
  if (genericHits > 2) {
    issues.push({
      code: "GENERIC_ACTION_OVERUSE",
      message: "行动建议过度依赖写下来、计时器、5分钟等模板动作。"
    });
  }

  if (result.actions.some((action) => !hasVisibleProof(action.proof))) {
    issues.push({
      code: "MISSING_VISIBLE_PROOF",
      message: "至少一个行动缺少可见、可检查的完成证据。"
    });
  }

  const soupPhrase = chickenSoupPhrases.find((phrase) => outputText.includes(phrase));
  if (soupPhrase) {
    issues.push({
      code: "CHICKEN_SOUP_PHRASE",
      message: `出现鸡汤词：${soupPhrase}。`
    });
  }

  if (input.style === "sharp" && !/(别|少来|空话|口号|逃避|说白了|听起来|省省|表演|拖)/.test(outputText)) {
    issues.push({
      code: "SHARP_STYLE_TOO_SOFT",
      message: "毒舌版不够锋利，像普通建议。"
    });
  }

  if (input.style === "friend" && !/(我懂|先|我们|别急|你不是|可以先|没关系)/.test(outputText)) {
    issues.push({
      code: "FRIEND_STYLE_TOO_COLD",
      message: "朋友版缺少承接感，像冷静版。"
    });
  }

  if (result.actions.some((action) => action.minutes > 45)) {
    issues.push({
      code: "ACTION_TOO_LARGE",
      message: "行动时间过长，不像今天马上能启动的小动作。"
    });
  }

  if (!mentionsInputSignal(input.userText, outputText)) {
    issues.push({
      code: "INPUT_ECHO_MISSING",
      message: "回答没有贴住用户原句的关键词。"
    });
  }

  const score = Math.max(0, 100 - issues.length * 18 - Math.max(0, genericHits - 1) * 8);

  return {
    passed: issues.length === 0,
    score,
    issues
  };
}

export function formatQualityIssues(issues: QualityIssue[]) {
  return issues.map((issue, index) => `${index + 1}. ${issue.message}`).join("\n");
}

function flattenResultText(result: CoachResult) {
  return [
    result.originalInput,
    result.headline,
    result.verdict,
    result.realityCheck,
    result.reviewQuestion,
    result.boundary,
    ...result.emptyPhrases.flatMap((item) => [item.phrase, item.whyItIsEmpty, item.replaceWith]),
    ...result.actions.flatMap((item) => [item.title, item.firstStep, item.proof])
  ].join("\n");
}

function countGenericActionHits(text: string) {
  return genericActionPatterns.reduce((sum, pattern) => sum + (text.match(pattern)?.length || 0), 0);
}

function hasVisibleProof(proof: string) {
  return visibleProofPatterns.some((pattern) => pattern.test(proof));
}

function mentionsInputSignal(inputText: string, outputText: string) {
  const signals = Array.from(
    new Set(
      inputText
        .replace(/[，。！？、,.!?]/g, " ")
        .split(/\s+/)
        .flatMap((token) => splitChineseSignals(token))
        .filter((token) => token.length >= 2)
    )
  );

  if (!signals.length) return true;
  return signals.some((signal) => outputText.includes(signal));
}

function splitChineseSignals(token: string) {
  const knownSignals = [
    "努力",
    "坚持",
    "拖延",
    "改变",
    "迷茫",
    "自律",
    "更好",
    "自己",
    "很废",
    "做不好",
    "困惑",
    "焦虑"
  ];
  const matches = knownSignals.filter((signal) => token.includes(signal));
  return matches.length ? matches : [token];
}
