export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HUB_MODEL_CONFIG_URL = process.env.HUB_MODEL_CONFIG_URL || "http://127.0.0.1:4194/hub/api/model-config";
const HUB_PROJECT_TOKEN = process.env.HUB_PROJECT_TOKEN || "";

const MODEL_PROVIDERS = [
  { id: "deepseek", label: "DeepSeek", model: "deepseek-v4-flash", models: ["deepseek-v4-flash", "deepseek-v4-pro"] },
  { id: "openai", label: "GPT", model: "gpt-5-mini", models: ["gpt-5-mini", "gpt-5", "gpt-4.1-mini"] },
  { id: "gemini", label: "Gemini", model: "gemini-3.5-flash", models: ["gemini-3.5-flash", "gemini-3.5-pro", "gemini-2.5-flash"] },
  { id: "anthropic", label: "Claude", model: "claude-sonnet-4-5", models: ["claude-sonnet-4-5", "claude-opus-4-8", "claude-haiku-4-5"] }
];

type ProviderStatus = {
  id: string;
  provider: string;
  label: string;
  model: string;
  models: string[];
  enabledModels: string[];
  enabled: boolean;
  configured: boolean;
};

export async function GET() {
  const payload = await createProvidersPayload();
  return Response.json(payload, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

async function createProvidersPayload() {
  try {
    const response = await fetch(HUB_MODEL_CONFIG_URL, {
      headers: hubHeaders(),
      cache: "no-store"
    });
    const config = await response.json().catch(() => null);
    if (!response.ok || !config) {
      return providerPayload(localProviderStatuses(), "deepseek", false);
    }

    const providers = normalizeHubProviderStatuses(config.providers);
    return providerPayload(
      providers,
      normalizeProviderId(config.defaultProvider),
      providers.some((provider) => provider.configured)
    );
  } catch {
    return providerPayload(localProviderStatuses(), "deepseek", false);
  }
}

function hubHeaders() {
  const headers: Record<string, string> = { accept: "application/json" };
  if (HUB_PROJECT_TOKEN) headers["x-hub-project-token"] = HUB_PROJECT_TOKEN;
  return headers;
}

function normalizeHubProviderStatuses(value: unknown) {
  const hubProviders = new Map<string, Record<string, unknown>>();
  for (const provider of Array.isArray(value) ? value : []) {
    if (!provider || typeof provider !== "object") continue;
    const record = provider as Record<string, unknown>;
    hubProviders.set(normalizeProviderId(record.id ?? record.provider), record);
  }

  return MODEL_PROVIDERS.map((localProvider) => {
    const hubProvider = hubProviders.get(localProvider.id) ?? {};
    const model = sanitizeString(hubProvider.model);
    const models = uniqueStrings(asStringArray(hubProvider.models), localProvider.models);
    const enabledModels = uniqueStrings(asStringArray(hubProvider.enabledModels), model ? [model] : []);
    return {
      id: localProvider.id,
      provider: localProvider.id,
      label: sanitizeString(hubProvider.label) || localProvider.label,
      model: model || enabledModels[0] || localProvider.model,
      models,
      enabledModels,
      enabled: Boolean(hubProvider.enabled),
      configured: Boolean(hubProvider.enabled && hubProvider.configured)
    };
  });
}

function localProviderStatuses(): ProviderStatus[] {
  return MODEL_PROVIDERS.map((provider) => ({
    id: provider.id,
    provider: provider.id,
    label: provider.label,
    model: provider.model,
    models: [...provider.models],
    enabledModels: [],
    enabled: false,
    configured: false
  }));
}

function providerPayload(providers: ProviderStatus[], defaultProvider: string, configured: boolean) {
  return { providers, configured, defaultProvider, hubUrl: "/hub/#models" };
}

function normalizeProviderId(value: unknown) {
  const providerId = sanitizeString(value);
  return MODEL_PROVIDERS.some((provider) => provider.id === providerId) ? providerId : "deepseek";
}

function sanitizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => sanitizeString(item)).filter(Boolean)
    : [];
}

function uniqueStrings(primary: string[], fallback: string[]) {
  const merged = [...primary, ...fallback].filter(Boolean);
  return Array.from(new Set(merged));
}
