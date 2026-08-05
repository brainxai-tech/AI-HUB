import { isGptModel, type GenerateRealityRequest } from "../src/shared/contracts.js";
import { callHubChat, HubModelError, type HubChatRequest } from "./hubModels.js";
import {
  buildRealityPrompt,
  extractJson,
  normalizeRealityOutput,
  ProviderError
} from "./realityTranslator.js";

const MAX_TOKENS = 2400;

export async function generateWithProvider(
  request: GenerateRealityRequest,
  options: { callModel?: (request: HubChatRequest) => Promise<string> } = {}
) {
  const hubRequest = buildHubChatRequest(request);
  const callModel = options.callModel || callHubChat;
  const text = await callModel(hubRequest).catch((error) => {
    if (error instanceof HubModelError) {
      throw new ProviderError(error.code, error.message, error.status, error.details);
    }
    throw new ProviderError("HUB_MODEL_ERROR", "Hub 模型代理请求失败，请稍后再试。", 502, String(error));
  });

  if (!text) {
    throw new ProviderError("EMPTY_MODEL_OUTPUT", "Hub 项目级代理没有返回可用内容。", 502);
  }

  return normalizeRealityOutput(extractJson(text), request);
}

export function buildHubChatRequest(request: GenerateRealityRequest): HubChatRequest {
  if (request.provider !== "openai") {
    throw new ProviderError("INVALID_PROVIDER", "本项目只接受 Hub 的 GPT 路由。", 422);
  }
  if (!isGptModel(request.model)) {
    throw new ProviderError("INVALID_MODEL", "本项目只允许调用 gpt-* 型号。", 422);
  }

  const prompt = buildRealityPrompt(request);
  return {
    provider: "openai",
    model: request.model,
    temperature: 0.62,
    maxTokens: MAX_TOKENS,
    messages: [
      { role: "system", content: prompt.system },
      {
        role: "user",
        content: [
          { type: "text", text: prompt.user },
          { type: "image_url", image_url: { url: request.photo.dataUrl } }
        ]
      }
    ]
  };
}
