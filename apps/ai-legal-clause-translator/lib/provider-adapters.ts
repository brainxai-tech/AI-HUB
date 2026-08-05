import { callHubChat, HubModelError } from "./hub-models.ts";
import {
  buildClauseAnalysisRepairPrompt,
  buildClauseAnalysisPrompt,
  defaultModels,
  extractJsonText,
  LEGAL_CLAUSE_SYSTEM_PROMPT,
  normalizeClauseAnalysisResult,
  parseClauseAnalysisResult,
} from "./legal-analysis.ts";
import type { AnalyzeClauseRequest, ClauseAnalysisResult } from "./types.ts";

export type ProviderPayload = AnalyzeClauseRequest & {
  prompt: string;
  model: string;
};

type ProviderCall = (payload: ProviderPayload) => Promise<string>;

export async function analyzeWithProvider(
  input: AnalyzeClauseRequest,
  options: { callProvider?: ProviderCall } = {},
): Promise<ClauseAnalysisResult> {
  const prompt = buildClauseAnalysisPrompt(input);
  const payload: ProviderPayload = {
    ...input,
    prompt,
    model: input.model || defaultModels[input.provider],
  };
  const callProvider = options.callProvider ?? callHubProvider;

  const text = await callProvider(payload);
  try {
    return parseAndNormalizeProviderText(input, text);
  } catch (firstError) {
    const firstMessage = firstError instanceof Error ? firstError.message : "模型输出不符合要求。";
    const repairPrompt = buildClauseAnalysisRepairPrompt(input, firstMessage, text);
    const repairedText = await callProvider({ ...payload, prompt: repairPrompt });

    try {
      return parseAndNormalizeProviderText(input, repairedText);
    } catch (secondError) {
      const secondMessage = secondError instanceof Error ? secondError.message : "模型输出不符合要求。";
      throw new Error(`${secondMessage} 已自动重试一次但仍未得到合格结果，请换用更强模型或补充条款上下文。`);
    }
  }
}

function parseAndNormalizeProviderText(input: AnalyzeClauseRequest, text: string): ClauseAnalysisResult {
  return normalizeClauseAnalysisResult(input, parseClauseAnalysisResult(JSON.parse(extractJsonText(text))));
}

async function callHubProvider(payload: ProviderPayload): Promise<string> {
  if (payload.provider !== "openai") {
    throw new HubModelError("INVALID_PROVIDER", "本项目只接受 Hub 的 GPT 路由。", 422);
  }
  if (!/^gpt-/i.test(payload.model)) {
    throw new HubModelError("INVALID_MODEL", "本项目只允许调用 gpt-* 型号。", 422);
  }

  return callHubChat({
    provider: payload.provider,
    model: payload.model,
    messages: [
      {
        role: "system",
        content: LEGAL_CLAUSE_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: payload.prompt,
      },
    ],
    temperature: 0.2,
    maxTokens: 2800,
  });
}
