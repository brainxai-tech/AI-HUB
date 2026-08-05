export const MODEL_PROVIDERS = {
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    protocol: "openai",
    baseUrl: "https://api.deepseek.com",
    chatPath: "/chat/completions",
    apiKeyLabel: "Hub 托管密钥",
    apiKeyPlaceholder: "AI Project Hub",
    defaultModel: "deepseek-v4-flash",
    disableThinking: true,
    models: [
      { id: "deepseek-v4-flash", label: "deepseek-v4-flash" },
      { id: "deepseek-v4-pro", label: "deepseek-v4-pro" }
    ]
  },
  openai: {
    id: "openai",
    label: "GPT",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    chatPath: "/chat/completions",
    apiKeyLabel: "Hub 托管密钥",
    apiKeyPlaceholder: "AI Project Hub",
    defaultModel: "gpt-5-mini",
    models: [
      { id: "gpt-5-mini", label: "gpt-5-mini" },
      { id: "gpt-5", label: "gpt-5" },
      { id: "gpt-4.1-mini", label: "gpt-4.1-mini" }
    ]
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    protocol: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    chatPath: "/chat/completions",
    apiKeyLabel: "Hub 托管密钥",
    apiKeyPlaceholder: "AI Project Hub",
    defaultModel: "gemini-3.5-flash",
    models: [
      { id: "gemini-3.5-flash", label: "gemini-3.5-flash" },
      { id: "gemini-3.5-pro", label: "gemini-3.5-pro" },
      { id: "gemini-2.5-flash", label: "gemini-2.5-flash" }
    ]
  },
  anthropic: {
    id: "anthropic",
    label: "Claude",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com",
    messagesPath: "/v1/messages",
    apiKeyLabel: "Hub 托管密钥",
    apiKeyPlaceholder: "AI Project Hub",
    anthropicVersion: "2023-06-01",
    defaultModel: "claude-sonnet-4-5",
    maxTokens: 1024,
    models: [
      { id: "claude-sonnet-4-5", label: "claude-sonnet-4-5" },
      { id: "claude-opus-4-8", label: "claude-opus-4-8" },
      { id: "claude-haiku-4-5", label: "claude-haiku-4-5" }
    ]
  }
};

export const DEFAULT_PROVIDER_ID = "deepseek";

export function providerOptions() {
  return Object.values(MODEL_PROVIDERS).map((provider) => ({
    id: provider.id,
    label: provider.label,
    protocol: provider.protocol
  }));
}

export function providerForId(value) {
  return MODEL_PROVIDERS[normalizeProviderId(value)];
}

export function modelOptionsForProvider(providerId) {
  return providerForId(providerId).models.map((model) => ({ ...model }));
}

export function normalizeProviderId(value) {
  return MODEL_PROVIDERS[value] ? value : DEFAULT_PROVIDER_ID;
}

export function normalizeModelId(providerId, modelId) {
  const provider = providerForId(providerId);
  return provider.models.some((model) => model.id === modelId) ? modelId : provider.defaultModel;
}
