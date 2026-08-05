import { validateProfile } from "../domain/prompt-builder.mjs";
import { generatePlanWithDeepSeek } from "./deepseek-client.mjs";
import { buildDemoPlan } from "./demo-plan.mjs";
import { groundPlanWithMenuLibrary, retrieveMenuLibraryRecipes } from "./menu-library-index.mjs";

const DEFAULT_MODEL = "";

export async function createPlanResponse(body = {}, { fetchImpl = globalThis.fetch } = {}) {
  const validation = validateProfile(body.profile || {});

  if (!validation.valid) {
    throw createHttpError("规划参数无效。", 400, validation.errors);
  }

  try {
    const plan = await generatePlanWithDeepSeek({
      profile: validation.profile,
      model: body.model || DEFAULT_MODEL,
      provider: body.provider,
      apiBaseUrl: body.apiBaseUrl,
      fetchImpl
    });

    return { mode: "live", plan };
  } catch (error) {
    console.warn("AI plan generation failed; using fallback plan.", error?.message || error);
    const recipes = retrieveMenuLibraryRecipes(validation.profile);
    const plan = groundPlanWithMenuLibrary(buildDemoPlan(validation.profile), recipes);
    plan.summary = "智能规划暂时没有返回可解析的完整计划，已先生成一份本地可执行备餐计划；可以稍后再次生成获取实时 AI 版本。";
    return {
      mode: "fallback",
      plan,
      warning: "智能规划返回格式异常，已使用本地备餐计划兜底。"
    };
  }
}

export function createHttpError(message, status = 500, details = undefined) {
  const error = new Error(message);
  error.status = status;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

export function errorToPayload(error) {
  return {
    error: error?.message || "服务器错误。",
    details: error?.details
  };
}
