import { extractJsonObject } from "../domain/plan-schema.mjs";
import { createHttpError } from "./plan-response.mjs";
import { summarizeWeeklyReview } from "../../public/weekly-memory.mjs";
import {
  defaultModelForProvider,
  defaultProvider,
  requestCompatibleChatCompletion
} from "./llm-compatible-client.mjs";

const DEFAULT_MODEL = "";

export async function createWeekReviewResponse(body = {}, { fetchImpl = globalThis.fetch } = {}) {
  const plan = normalizePlanInput(body.plan);
  const executionState = normalizeExecutionState(body.executionState);
  const feedback = cleanText(body.feedback, "用户没有填写额外反馈。");
  const reviewSummary = summarizeWeeklyReview(plan, executionState);

  try {
    const review = await requestCompatibleWeekReview({
      model: body.model || DEFAULT_MODEL,
      provider: body.provider,
      apiBaseUrl: body.apiBaseUrl,
      plan,
      executionState,
      feedback,
      reviewSummary,
      fetchImpl
    });

    return {
      mode: "live",
      review
    };
  } catch (error) {
    console.warn("AI weekly review failed; using local fallback.", error?.message || error);
    return {
      mode: "fallback",
      review: buildFallbackReview(reviewSummary, feedback),
      warning: "AI Hub 暂时不可用，已根据本地执行记录生成复盘。"
    };
  }
}

function normalizePlanInput(plan) {
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.days)) {
    throw createHttpError("周复盘需要传入当前计划。", 400);
  }
  return plan;
}

function normalizeExecutionState(executionState) {
  if (!executionState || typeof executionState !== "object") {
    throw createHttpError("周复盘需要传入执行状态。", 400);
  }
  return executionState;
}

async function requestCompatibleWeekReview({ model, provider = defaultProvider(), apiBaseUrl = "", plan, executionState, feedback, reviewSummary, fetchImpl }) {
  const payload = buildDeepSeekReviewPayload({ model, plan, executionState, feedback, reviewSummary });
  const content = await requestCompatibleChatCompletion({
    provider,
    apiBaseUrl,
    model: model || defaultModelForProvider(provider),
    messages: payload.messages,
    temperature: 0.35,
    maxTokens: 2400,
    fetchImpl
  });
  const parsed = extractJsonObject(content);
  return normalizeReview(parsed.review || parsed);
}

function buildDeepSeekReviewPayload({ model, plan, executionState, feedback, reviewSummary }) {
  return {
    model: model || DEFAULT_MODEL,
    messages: [
      {
        role: "system",
        content: [
          "你是中式家庭轻食备餐复盘教练。",
          "用户已经执行完或部分执行一周计划。你要根据计划、执行状态、替换记录和用户反馈，给出下周可执行的改进建议。",
          "只输出严格 JSON，不要输出 Markdown，不要改写整周计划。",
          "建议要面向下一次 prompt 和备餐执行，不要给医疗处方。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          plan: {
            title: plan.title,
            summary: plan.summary,
            days: plan.days,
            shoppingList: plan.shoppingList,
            batchPrep: plan.batchPrep,
            guardrails: plan.guardrails
          },
          executionState,
          reviewSummary,
          feedback,
          requiredShape: {
            review: {
              summary: "string",
              wins: ["string"],
              frictions: ["string"],
              nextWeekAdjustments: ["string"],
              promptHints: ["string"]
            }
          }
        })
      }
    ],
    response_format: { type: "json_object" },
    thinking: { type: "disabled" },
    temperature: 0.35,
    max_tokens: 2400
  };
}

function buildFallbackReview(summary, feedback) {
  const wins = [];
  const frictions = [];
  const nextWeekAdjustments = [];
  const promptHints = [];

  if (summary.shoppingCompletionRate >= 80) {
    wins.push("采购执行较稳定，可以继续保留当前采购分组方式。");
  } else {
    frictions.push(`采购完成率 ${summary.shoppingCompletionRate}%，下周需要减少冷门食材或合并采购项。`);
    nextWeekAdjustments.push("减少一次性采购品类，把主蛋白、主食和高频蔬菜控制在更少组合内。");
  }

  if (summary.prepCompletionRate >= 80) {
    wins.push("周日备餐完成度较好，下周可以继续沿用批量处理节奏。");
  } else {
    frictions.push(`备餐完成率 ${summary.prepCompletionRate}%，说明周日任务可能偏多或步骤偏散。`);
    nextWeekAdjustments.push("把周日备餐压缩到 3 个核心任务：处理蛋白、洗切蔬菜、分装主食。");
  }

  if (summary.mealsSkipped > 0) {
    frictions.push(`本周跳过 ${summary.mealsSkipped} 餐，下周要降低单餐烹饪门槛。`);
    nextWeekAdjustments.push("为工作日晚餐增加 15 分钟内可完成的复热餐或快手替代餐。");
  }

  if (summary.replacementsTotal > 0) {
    frictions.push(`本周发生 ${summary.replacementsTotal} 次替换，说明库存或口味有临时变化。`);
    nextWeekAdjustments.push("把替换记录中的常用替代食材加入下周采购偏好。");
  }

  if (summary.mealCompletionRate >= 85 && summary.mealsSkipped === 0) {
    wins.push("餐食执行很完整，当前热量和备餐复杂度大体可维持。");
  }

  if (feedback && feedback !== "用户没有填写额外反馈。") {
    promptHints.push(`用户反馈：${feedback}`);
  }

  promptHints.push(`下周生成计划时参考完成率 ${summary.completionRate}%、替换 ${summary.replacementsTotal} 次、跳过 ${summary.mealsSkipped} 餐。`);
  if (!wins.length) wins.push("已经积累了一周执行数据，下周可以基于真实完成情况微调。");
  if (!frictions.length) frictions.push("没有明显卡点，继续观察口味重复和采购复杂度。");
  if (!nextWeekAdjustments.length) nextWeekAdjustments.push("保持当前计划结构，小幅增加菜品轮换，避免连续重复同一主蛋白。");

  return normalizeReview({
    summary: `${summary.title} 本周完成率 ${summary.completionRate}%，餐食处理 ${summary.mealsDone}/${summary.mealsTotal}，替换 ${summary.replacementsTotal} 次。`,
    wins,
    frictions,
    nextWeekAdjustments,
    promptHints
  });
}

function normalizeReview(input = {}) {
  return {
    summary: cleanText(input.summary, "已生成本周复盘。"),
    wins: normalizeStringList(input.wins, ["完成了一轮真实执行记录。"]),
    frictions: normalizeStringList(input.frictions, ["暂无明确卡点。"]),
    nextWeekAdjustments: normalizeStringList(input.nextWeekAdjustments, ["下周保持当前结构并微调口味重复。"]),
    promptHints: normalizeStringList(input.promptHints, ["下周计划继续参考本周执行状态。"])
  };
}

function normalizeStringList(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const normalized = value.map((item) => String(item || "").trim()).filter(Boolean);
  return normalized.length ? normalized : fallback;
}

function cleanText(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}
