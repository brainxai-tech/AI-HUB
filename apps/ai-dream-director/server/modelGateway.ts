import { type GenerateDreamRequest } from "../src/shared/contracts.js";
import {
  buildDirectorPrompt,
  extractJson,
  normalizeDirectorOutput,
  ProviderError
} from "./dreamDirector.js";
import { callHubChat, HubModelError, type HubChatRequest } from "./hubModels.js";

const MAX_OUTPUT_TOKENS = 5200;

export async function generateWithModel(
  request: GenerateDreamRequest,
  options: { callModel?: (request: HubChatRequest) => Promise<string> } = {}
) {
  const hubRequest = buildHubChatRequest(request);
  const callModel = options.callModel || callHubChat;
  const text = await callModel(hubRequest).catch((error) => {
    if (error instanceof HubModelError) {
      throw new ProviderError(error.code, error.message, error.status);
    }

    throw new ProviderError("HUB_MODEL_ERROR", "Hub 模型代理请求失败，请稍后再试。", 502, String(error));
  });

  if (!text) {
    throw new ProviderError("EMPTY_MODEL_OUTPUT", "模型没有返回可用内容。", 502);
  }

  return normalizeDirectorOutput(extractJson(text));
}

export function buildHubChatRequest(request: GenerateDreamRequest): HubChatRequest {
  if (request.provider !== "openai") {
    throw new ProviderError("INVALID_PROVIDER", "请选择 Hub 中已启用的模型服务。", 422);
  }

  if (!/^gpt-/i.test(request.model)) {
    throw new ProviderError("INVALID_MODEL", "本项目只允许调用 gpt-* 型号。", 422);
  }

  const prompt = buildDirectorPrompt(request);

  return {
    provider: request.provider,
    model: request.model,
    temperature: 0.82,
    maxTokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ]
  };
}
