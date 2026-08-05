import { NextResponse } from "next/server";

export const runtime = "nodejs";

type HubProvider = {
  id?: unknown;
  provider?: unknown;
  label?: unknown;
  model?: unknown;
  models?: unknown;
  enabledModels?: unknown;
  enabled?: unknown;
  configured?: unknown;
};

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

const LOCAL_PROVIDERS = [
  {
    id: "openai",
    label: "GPT · AI Routing",
    model: "",
    models: [],
  },
] as const;

export async function GET() {
  const url = getHubModelConfigUrl();

  if (!url) {
    return NextResponse.json(providerPayload(localProviderStatuses(), "openai", false));
  }

  try {
    const response = await fetch(url, {
      headers: getHubHeaders(),
      cache: "no-store",
    });
    const config = await response.json().catch(() => null);

    if (!response.ok || !config) {
      return NextResponse.json(providerPayload(localProviderStatuses(), "openai", false));
    }

    const providers = normalizeHubProviderStatuses(config.providers);
    const configured = providers.some((provider) => provider.configured);
    const defaultProvider = normalizeProviderId(config.defaultProvider);

    return NextResponse.json(providerPayload(providers, defaultProvider, configured));
  } catch {
    return NextResponse.json(providerPayload(localProviderStatuses(), "openai", false));
  }
}

function getHubModelConfigUrl() {
  const explicitUrl = (
    process.env.AI_HUB_MODEL_CONFIG_URL ||
    process.env.HUB_MODEL_CONFIG_URL ||
    ""
  ).trim();

  if (explicitUrl) {
    return explicitUrl;
  }

  const baseUrl = (process.env.AI_HUB_BASE_URL || process.env.HUB_BASE_URL || "").trim();

  if (!baseUrl) {
    return "";
  }

  return withHubApiPath(baseUrl, "/api/model-config");
}

function withHubApiPath(baseUrl: string, pathname: string) {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const hubBase = normalizedBase.endsWith("/hub")
    ? normalizedBase
    : `${normalizedBase}/hub`;

  return `${hubBase}/${pathname.replace(/^\/+/, "")}`;
}

function getHubHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const projectToken = (
    process.env.AI_HUB_PROJECT_TOKEN ||
    process.env.HUB_PROJECT_TOKEN ||
    ""
  ).trim();

  if (projectToken) {
    headers["x-hub-project-token"] = projectToken;
  }

  return headers;
}

function normalizeHubProviderStatuses(value: unknown): ProviderStatus[] {
  const hubProviders = new Map<string, HubProvider>();
  for (const provider of Array.isArray(value) ? value : []) {
    if (!provider || typeof provider !== "object") continue;
    const status = provider as HubProvider;
    hubProviders.set(normalizeProviderId(status.id ?? status.provider), status);
  }

  return LOCAL_PROVIDERS.map((localProvider) => {
    const hubProvider = hubProviders.get(localProvider.id) ?? {};
    const candidateModel = sanitizeString(hubProvider.model);
    const models = uniqueStrings(
      asStringArray(hubProvider.models),
      asStringArray(hubProvider.enabledModels),
      candidateModel ? [candidateModel] : [],
    ).filter(isGptModel);
    const enabledModels = uniqueStrings(
      asStringArray(hubProvider.enabledModels),
      candidateModel ? [candidateModel] : [],
    ).filter(isGptModel);
    const model = isGptModel(candidateModel) ? candidateModel : enabledModels[0] || models[0] || "";

    return {
      id: localProvider.id,
      provider: localProvider.id,
      label: localProvider.label,
      model,
      models,
      enabledModels,
      enabled: Boolean(hubProvider.enabled),
      configured: Boolean(hubProvider.enabled && hubProvider.configured),
    };
  });
}

function localProviderStatuses(): ProviderStatus[] {
  return LOCAL_PROVIDERS.map((provider) => ({
    id: provider.id,
    provider: provider.id,
    label: provider.label,
    model: provider.model,
    models: [...provider.models],
    enabledModels: [],
    enabled: false,
    configured: false,
  }));
}

function providerPayload(
  providers: ProviderStatus[],
  defaultProvider: string,
  configured: boolean,
) {
  return {
    providers,
    configured,
    defaultProvider,
    hubUrl: "/hub/#models",
  };
}

function normalizeProviderId(value: unknown) {
  const providerId = sanitizeString(value);
  return LOCAL_PROVIDERS.some((provider) => provider.id === providerId)
    ? providerId
    : "openai";
}

function isGptModel(value: string) {
  return /^gpt-/i.test(value);
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(sanitizeString).filter(Boolean);
}

function uniqueStrings(...lists: string[][]) {
  return [...new Set(lists.flat().map(sanitizeString).filter(Boolean))];
}

function sanitizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
