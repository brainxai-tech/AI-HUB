import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProjectAuthorizer, loadProjectTokenRegistry } from "./auth.mjs";
import { createConfigStore } from "./config-store.mjs";
import {
  CozeIntegrationError,
  runCozeWorkflow,
  validateCozeRunPayload,
} from "./integrations/coze.mjs";
import { RequestGovernor, requestedTokenLimit, validateChatPayload } from "./request-policy.mjs";
import {
  buildObservabilitySummary,
  createAnonymousEventLimiter,
  readObservabilityEvents,
  recordObservabilityEvent,
} from "./observability.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const configPath = process.env.HUB_CONFIG_PATH || "/var/lib/ai-project-hub/model-config.json";
const observabilityLogPath =
  process.env.HUB_OBSERVABILITY_LOG_PATH || "/var/log/ai-project-hub/observability-events.jsonl";
const port = Number.parseInt(process.env.PORT || "4194", 10);
const adminToken = process.env.HUB_ADMIN_TOKEN || "";
const projectToken = process.env.HUB_PROJECT_TOKEN || "";
const projectTokensPath =
  process.env.HUB_PROJECT_TOKENS_PATH || path.join(dataDir, "project-tokens.json");
const allowLegacyProjectToken = process.env.HUB_ALLOW_LEGACY_PROJECT_TOKEN === "true";
const allowLegacyCozeConfig = process.env.HUB_ALLOW_LEGACY_COZE_CONFIG === "true";
const upstreamTimeoutMs = Math.min(
  Math.max(Number.parseInt(process.env.HUB_UPSTREAM_TIMEOUT_MS || "60000", 10) || 60000, 1000),
  300000,
);
const maxOutputTokens = Math.min(
  Math.max(Number.parseInt(process.env.HUB_MAX_OUTPUT_TOKENS || "32768", 10) || 32768, 128),
  1000000,
);
const cozeEnvToken = process.env.COZE_API_TOKEN || "";

let projectTokenRegistry;
try {
  projectTokenRegistry = await loadProjectTokenRegistry(projectTokensPath);
} catch (error) {
  console.error("Failed to load the project credential registry:", error.message);
  projectTokenRegistry = { version: 1, projects: {} };
}

const authorizeProject = createProjectAuthorizer({
  registry: projectTokenRegistry,
  allowLegacy: allowLegacyProjectToken,
  legacyToken: projectToken,
});
const scopedProjectCount = Object.keys(projectTokenRegistry.projects).length;
const projectAuthRequired = scopedProjectCount > 0 || Boolean(projectToken && allowLegacyProjectToken);
const requestGovernor = new RequestGovernor();
const trackRateLimitPerMinute = Math.min(
  Math.max(Number.parseInt(process.env.HUB_TRACK_RATE_LIMIT_PER_MINUTE || "30", 10) || 30, 1),
  1000,
);
const anonymousTrackLimiter = createAnonymousEventLimiter({ limit: trackRateLimitPerMinute });
const configStore = createConfigStore({
  configPath,
  defaultConfig: createDefaultConfig,
  normalize: mergeWithCatalog,
});

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".json", "application/json; charset=utf-8"],
]);

const securityHeaders = {
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

const providerCatalog = {
  routing: {
    label: "AI Routing",
    adapter: "openai-compatible",
    baseUrl: "https://drhknode.airouting.com/v1",
  },
};

function normalizeModelName(value) {
  if (typeof value !== "string") {
    return "";
  }

  const model = value.trim();
  if (!model || model.length > 200 || /[\u0000-\u001f\u007f]/.test(model)) {
    return "";
  }

  return model;
}

function normalizeModelList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map(normalizeModelName).filter(Boolean))).slice(0, 500);
}

function createDefaultConfig() {
  return {
    defaultProvider: "routing",
    providers: Object.fromEntries(
      Object.entries(providerCatalog).map(([id, provider]) => [
        id,
        {
          enabled: false,
          apiKey: "",
          baseUrl: provider.baseUrl,
          model: "",
          models: [],
          enabledModels: [],
        },
      ]),
    ),
    integrations: {
      coze: {
        enabled: false,
        apiToken: "",
        baseUrl: "https://api.coze.cn",
        userId: "@user9871359900",
        workflowName: "Internship_Jianlixiugai",
        workflowId: "7647377427798605859",
        fileParameterShape: "file_id_object",
      },
    },
  };
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    ...securityHeaders,
    "content-type": "text/plain; charset=utf-8",
  });
  response.end(message);
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    ...securityHeaders,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function sendNoContent(response, headers = {}) {
  response.writeHead(204, {
    ...securityHeaders,
    ...headers,
  });
  response.end();
}

function toSafeErrorBody(error, statusCode) {
  if (error.body) {
    return error.body;
  }

  if (statusCode >= 500) {
    return { error: "Internal server error" };
  }

  return { error: error.message || "Request failed" };
}

function isMissingFileError(error) {
  return error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function getProviderApiKey(config, providerId) {
  return config.providers[providerId]?.apiKey || "";
}

function isProviderConfigured(config, providerId) {
  return Boolean(getProviderApiKey(config, providerId) && config.providers[providerId]?.model);
}

function countConfiguredProviders(config) {
  return Object.keys(providerCatalog).filter(
    (providerId) => config.providers[providerId]?.enabled && isProviderConfigured(config, providerId),
  ).length;
}

function getBearerToken(request) {
  const authorization = request.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function hasAdminAccess(request) {
  const token = request.headers["x-hub-admin-token"] || getBearerToken(request);
  if (!adminToken || typeof token !== "string") {
    return false;
  }

  return safeEqual(token, adminToken);
}

function normalizePath(requestUrl, host) {
  const url = new URL(requestUrl, `http://${host || "127.0.0.1"}`);
  let pathname = decodeURIComponent(url.pathname || "/");

  if (pathname === "/hub") {
    pathname = "/";
  } else if (pathname.startsWith("/hub/")) {
    pathname = pathname.slice(4);
  }

  return { url, pathname };
}

function resolvePublicPath(pathname) {
  const safePathname = pathname === "/" ? "/index.html" : pathname;
  const requestedPath = path.normalize(path.join(publicDir, safePathname));
  const relativePath = path.relative(publicDir, requestedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return requestedPath;
}

async function readJsonBody(request, maxBytes = 1024 * 1024) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      const error = new Error("Request body is too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function mergeWithCatalog(rawConfig) {
  const defaultConfig = createDefaultConfig();
  const merged = {
    defaultProvider: providerCatalog[rawConfig?.defaultProvider]
      ? rawConfig.defaultProvider
      : defaultConfig.defaultProvider,
    providers: {},
    integrations: {
      coze: {
        ...defaultConfig.integrations.coze,
      },
    },
  };

  for (const [id, provider] of Object.entries(providerCatalog)) {
    const rawProvider = rawConfig?.providers?.[id] || {};
    const rawApiKey = typeof rawProvider.apiKey === "string" ? rawProvider.apiKey : "";
    const models = rawApiKey ? normalizeModelList(rawProvider.models) : [];
    const rawModel = rawApiKey ? normalizeModelName(rawProvider.model) : "";
    if (rawModel && !models.includes(rawModel)) {
      models.unshift(rawModel);
    }
    const model = rawModel || models[0] || "";
    const enabledModels = rawApiKey
      ? normalizeModelList(rawProvider.enabledModels).filter((modelName) => models.includes(modelName))
      : [];

    merged.providers[id] = {
      enabled: Boolean(rawProvider.enabled),
      apiKey: rawApiKey,
      baseUrl: provider.baseUrl,
      model,
      models,
      enabledModels: enabledModels.length > 0 ? enabledModels : model ? [model] : [],
    };
  }

  const rawCoze = rawConfig?.integrations?.coze || {};
  merged.integrations.coze = {
    enabled: Boolean(rawCoze.enabled),
    apiToken: typeof rawCoze.apiToken === "string" ? rawCoze.apiToken : "",
    baseUrl:
      typeof rawCoze.baseUrl === "string" && rawCoze.baseUrl.trim()
        ? rawCoze.baseUrl.trim().replace(/\/+$/, "")
        : defaultConfig.integrations.coze.baseUrl,
    userId:
      typeof rawCoze.userId === "string" && rawCoze.userId.trim()
        ? rawCoze.userId.trim()
        : defaultConfig.integrations.coze.userId,
    workflowName:
      typeof rawCoze.workflowName === "string" && rawCoze.workflowName.trim()
        ? rawCoze.workflowName.trim()
        : defaultConfig.integrations.coze.workflowName,
    workflowId:
      typeof rawCoze.workflowId === "string" && rawCoze.workflowId.trim()
        ? rawCoze.workflowId.trim()
        : defaultConfig.integrations.coze.workflowId,
    fileParameterShape:
      typeof rawCoze.fileParameterShape === "string" && rawCoze.fileParameterShape.trim()
        ? rawCoze.fileParameterShape.trim()
        : defaultConfig.integrations.coze.fileParameterShape,
  };

  return merged;
}

async function readConfig() {
  return configStore.read();
}

async function writeConfig(config) {
  return configStore.write(config);
}

function publicConfig(config) {
  const cozeConfig = config.integrations.coze;
  return {
    defaultProvider: config.defaultProvider,
    adminAuthConfigured: Boolean(adminToken),
    projectAuthRequired,
    scopedProjectCount,
    legacyProjectAuthEnabled: Boolean(projectToken && allowLegacyProjectToken),
    endpoints: {
      chat: "/hub/api/chat",
      openAiCompatible: "/hub/api/v1/chat/completions",
    },
    providers: Object.entries(providerCatalog).map(([id, provider]) => ({
      id,
      label: provider.label,
      adapter: provider.adapter,
      baseUrl: config.providers[id].baseUrl,
      model: config.providers[id].model,
      models: config.providers[id].models,
      enabledModels: config.providers[id].enabledModels,
      enabled: config.providers[id].enabled,
      configured: isProviderConfigured(config, id),
      usesEnvironmentKey: false,
    })),
    integrations: {
      coze: {
        enabled: cozeConfig.enabled,
        configured: Boolean(cozeConfig.apiToken || cozeEnvToken),
        usesEnvironmentToken: Boolean(!cozeConfig.apiToken && cozeEnvToken),
        baseUrl: cozeConfig.baseUrl,
        userId: cozeConfig.userId,
        workflowName: cozeConfig.workflowName,
        workflowId: cozeConfig.workflowId,
        fileParameterShape: cozeConfig.fileParameterShape,
      },
    },
  };
}

function applyConfigUpdate(currentConfig, payload) {
  const nextConfig = mergeWithCatalog(currentConfig);

  if (providerCatalog[payload?.defaultProvider]) {
    nextConfig.defaultProvider = payload.defaultProvider;
  }

  for (const id of Object.keys(providerCatalog)) {
    const patch = payload?.providers?.[id];
    if (!patch || typeof patch !== "object") {
      continue;
    }

    const nextProvider = nextConfig.providers[id];

    if (typeof patch.enabled === "boolean") {
      nextProvider.enabled = patch.enabled;
    }

    if (patch.clearKey === true) {
      nextProvider.apiKey = "";
      nextProvider.enabled = false;
      nextProvider.model = "";
      nextProvider.models = [];
      nextProvider.enabledModels = [];
    } else if (typeof patch.apiKey === "string" && patch.apiKey.trim()) {
      nextProvider.apiKey = patch.apiKey.trim();
    }

    if (Array.isArray(patch.models)) {
      nextProvider.models = normalizeModelList(patch.models);
    }

    const requestedModel = normalizeModelName(patch.model);
    if (requestedModel && nextProvider.models.includes(requestedModel)) {
      nextProvider.model = requestedModel;
    } else if (!nextProvider.models.includes(nextProvider.model)) {
      nextProvider.model = nextProvider.models[0] || "";
    }

    if (Array.isArray(patch.enabledModels)) {
      nextProvider.enabledModels = normalizeModelList(patch.enabledModels).filter((modelName) =>
        nextProvider.models.includes(modelName),
      );
    }

    if (nextProvider.model && !nextProvider.enabledModels.includes(nextProvider.model)) {
      nextProvider.enabledModels.unshift(nextProvider.model);
    }
  }

  const cozePatch = payload?.integrations?.coze;
  if (cozePatch && typeof cozePatch === "object") {
    const nextCoze = nextConfig.integrations.coze;

    if (typeof cozePatch.enabled === "boolean") {
      nextCoze.enabled = cozePatch.enabled;
    }

    if (typeof cozePatch.baseUrl === "string" && cozePatch.baseUrl.trim()) {
      nextCoze.baseUrl = cozePatch.baseUrl.trim().replace(/\/+$/, "");
    }

    for (const field of ["userId", "workflowName", "workflowId", "fileParameterShape"]) {
      if (typeof cozePatch[field] === "string" && cozePatch[field].trim()) {
        nextCoze[field] = cozePatch[field].trim();
      }
    }

    if (cozePatch.clearToken === true) {
      nextCoze.apiToken = "";
      nextCoze.enabled = false;
    } else if (typeof cozePatch.apiToken === "string" && cozePatch.apiToken.trim()) {
      nextCoze.apiToken = cozePatch.apiToken.trim();
    }
  }

  return nextConfig;
}

function cozeRuntimeConfig(config) {
  const cozeConfig = config.integrations.coze;
  const apiToken = cozeConfig.apiToken || cozeEnvToken;

  if (!cozeConfig.enabled || !apiToken || !cozeConfig.workflowId) {
    throw new CozeIntegrationError(
      "COZE_CONFIG_INVALID",
      "The Coze workflow is not fully configured in AI Project Hub.",
    );
  }

  return {
    enabled: cozeConfig.enabled,
    apiToken,
    baseUrl: cozeConfig.baseUrl,
    userId: cozeConfig.userId,
    workflowName: cozeConfig.workflowName,
    workflowId: cozeConfig.workflowId,
    fileParameterShape: cozeConfig.fileParameterShape,
  };
}

function getProviderSelection(config, payload) {
  const providerId = providerCatalog[payload.provider] ? payload.provider : config.defaultProvider;
  const providerConfig = config.providers[providerId];
  const providerMeta = providerCatalog[providerId];
  const apiKey = getProviderApiKey(config, providerId);

  if (!providerConfig?.enabled || !apiKey) {
    const error = new Error(`${providerMeta.label} has not been configured in AI Project Hub.`);
    error.statusCode = 400;
    throw error;
  }

  const requestedModel =
    typeof payload.model === "string" && payload.model.trim()
      ? payload.model.trim()
      : providerConfig.model;
  const enabledModels = Array.isArray(providerConfig.enabledModels) ? providerConfig.enabledModels : [];

  if (enabledModels.length > 0 && !enabledModels.includes(requestedModel)) {
    const error = new Error(`${requestedModel} has not been enabled for ${providerMeta.label} in AI Project Hub.`);
    error.statusCode = 400;
    throw error;
  }

  return {
    id: providerId,
    meta: providerMeta,
    config: {
      ...providerConfig,
      apiKey,
    },
    model: requestedModel,
  };
}

function getTokenLimit(payload) {
  if (typeof payload.max_completion_tokens === "number") {
    return payload.max_completion_tokens;
  }
  if (typeof payload.max_tokens === "number") {
    return payload.max_tokens;
  }
  if (typeof payload.maxTokens === "number") {
    return payload.maxTokens;
  }
  return undefined;
}

function normalizeReasoningEffort(value) {
  if (typeof value !== "string") {
    return "";
  }

  const effort = value.trim().toLowerCase();
  if (["none", "off", "disabled"].includes(effort)) return "none";
  if (["minimal", "min"].includes(effort)) return "minimal";
  if (["low", "medium", "high"].includes(effort)) return effort;
  return "";
}

function getReasoningIntent(payload) {
  const reasoning =
    payload.reasoning && typeof payload.reasoning === "object" && !Array.isArray(payload.reasoning)
      ? payload.reasoning
      : {};
  const thinking =
    payload.thinking && typeof payload.thinking === "object" && !Array.isArray(payload.thinking)
      ? payload.thinking
      : {};
  const effort =
    normalizeReasoningEffort(reasoning.effort) ||
    normalizeReasoningEffort(payload.reasoning_effort) ||
    normalizeReasoningEffort(thinking.effort);

  if (effort === "none" || reasoning.enabled === false || thinking.type === "disabled") {
    return { enabled: false, effort: "none" };
  }

  const enabled =
    reasoning.enabled === true ||
    Boolean(effort) ||
    thinking.type === "enabled" ||
    thinking.type === "adaptive";

  return { enabled, effort: effort || "high" };
}

function buildOpenAiPayload(selection, payload) {
  const maxTokens = getTokenLimit(payload);
  const requestBody = {
    model: selection.model,
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    temperature: typeof payload.temperature === "number" ? payload.temperature : undefined,
    response_format: payload.response_format,
    stream: false,
  };

  requestBody.max_tokens = maxTokens;

  const reasoning = getReasoningIntent(payload);
  if (reasoning.enabled) {
    requestBody.reasoning_effort = reasoning.effort;
  }

  return requestBody;
}

async function parseUpstreamResponse(upstreamResponse) {
  const text = await upstreamResponse.text();

  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

async function fetchUpstream(url, init) {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(upstreamTimeoutMs),
    });
  } catch (cause) {
    const timedOut = cause?.name === "TimeoutError" || cause?.name === "AbortError";
    const error = new Error(timedOut ? "Upstream request timed out" : "Upstream request failed");
    error.statusCode = timedOut ? 504 : 502;
    error.body = {
      error: {
        code: timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
        message: timedOut
          ? "The model provider did not respond before the gateway timeout."
          : "The model provider could not be reached.",
      },
    };
    throw error;
  }
}

async function discoverRoutingModels(apiKey) {
  const upstreamResponse = await fetchUpstream(`${providerCatalog.routing.baseUrl}/models`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
    },
  });
  const body = await parseUpstreamResponse(upstreamResponse);

  if (!upstreamResponse.ok) {
    const rejected = upstreamResponse.status === 401 || upstreamResponse.status === 403;
    const error = new Error(rejected ? "AI Routing rejected this API Key." : "AI Routing model discovery failed.");
    error.statusCode = rejected ? 401 : 502;
    error.body = {
      error: {
        code: rejected ? "UPSTREAM_API_KEY_REJECTED" : "UPSTREAM_MODEL_DISCOVERY_FAILED",
        message: rejected
          ? "AI Routing 拒绝了这个 API Key，请检查后重试。"
          : "暂时无法从 AI Routing 获取模型列表，请稍后重试。",
      },
    };
    throw error;
  }

  const models = normalizeModelList(Array.isArray(body?.data) ? body.data.map((item) => item?.id) : []);
  if (models.length === 0) {
    const error = new Error("AI Routing returned no usable models.");
    error.statusCode = 502;
    error.body = {
      error: {
        code: "UPSTREAM_MODEL_LIST_EMPTY",
        message: "AI Routing 没有返回可用模型。",
      },
    };
    throw error;
  }

  return models.sort((left, right) => left.localeCompare(right));
}

function normalizeUpstreamError(providerId, upstreamStatus, body) {
  const message =
    body?.error?.message ||
    body?.message ||
    body?.text ||
    `Upstream provider returned HTTP ${upstreamStatus}`;

  return {
    error: {
      type: "upstream_error",
      provider: providerId,
      status: upstreamStatus,
      message: String(message).slice(0, 500),
    },
  };
}

async function callOpenAiCompatible(selection, payload) {
  const upstreamResponse = await fetchUpstream(`${selection.config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${selection.config.apiKey}`,
    },
    body: JSON.stringify(buildOpenAiPayload(selection, payload)),
  });
  const body = await parseUpstreamResponse(upstreamResponse);

  if (!upstreamResponse.ok) {
    const error = new Error("Upstream request failed");
    error.statusCode = 502;
    error.body = normalizeUpstreamError(selection.id, upstreamResponse.status, body);
    throw error;
  }

  return body;
}

async function callModel(selection, payload) {
  return callOpenAiCompatible(selection, payload);
}

async function recordHubEvent(payload, defaults = {}) {
  try {
    return await recordObservabilityEvent(observabilityLogPath, payload, defaults);
  } catch (error) {
    console.error("Failed to record Hub observability event:", error.message);
    return null;
  }
}

function projectPathFromRequest(request, payload, fallback) {
  return (
    request.headers["x-hub-project-path"] ||
    payload?.projectPath ||
    payload?.path ||
    payload?.url ||
    fallback
  );
}

function trackingClientKey(request) {
  const realIp = request.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim();
  return request.socket?.remoteAddress || "anonymous";
}

async function handleApi(request, response, pathname) {
  if (request.method === "OPTIONS") {
    sendNoContent(response, {
      "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
      "access-control-allow-headers":
        "content-type,authorization,x-hub-admin-token,x-hub-project-id,x-hub-project-token",
    });
    return;
  }

  if (pathname === "/api/health" && request.method === "GET") {
    const config = await readConfig();
    const configuration = configStore.status();
    sendJson(response, 200, {
      ok: true,
      healthy: configuration.state === "healthy",
      status: configuration.state,
      configuration,
      defaultProvider: config.defaultProvider,
      configuredProviders: countConfiguredProviders(config),
      adminAuthConfigured: Boolean(adminToken),
      projectAuthRequired,
      scopedProjectCount,
      legacyProjectAuthEnabled: Boolean(projectToken && allowLegacyProjectToken),
    });
    return;
  }

  if (pathname === "/api/track" && request.method === "POST") {
    if (!anonymousTrackLimiter.allow(trackingClientKey(request))) {
      sendJson(response, 429, {
        error: { code: "TRACK_RATE_LIMITED", message: "Too many tracking events." },
      });
      return;
    }
    const payload = await readJsonBody(request, 2 * 1024);
    await recordHubEvent(payload, {
      source: payload.source || "hub",
      method: request.method,
      statusCode: payload.statusCode || 202,
      projectPath: projectPathFromRequest(request, payload, "/hub/"),
    });
    sendJson(response, 202, { ok: true });
    return;
  }

  if (pathname === "/api/observability/summary" && request.method === "GET") {
    if (adminToken && !hasAdminAccess(request)) {
      sendJson(response, 401, { error: "Admin token is required." });
      return;
    }

    const events = await readObservabilityEvents(observabilityLogPath);
    sendJson(response, 200, buildObservabilitySummary(events));
    return;
  }

  if (pathname === "/api/admin/verify" && request.method === "POST") {
    if (!hasAdminAccess(request)) {
      sendJson(response, 401, { error: "Admin token is required." });
      return;
    }

    sendJson(response, 200, { ok: true });
    return;
  }

  if (pathname === "/api/provider-models" && request.method === "POST") {
    if (!hasAdminAccess(request)) {
      sendJson(response, 401, { error: "Admin token is required." });
      return;
    }

    const payload = await readJsonBody(request, 64 * 1024);
    const config = await readConfig();
    const suppliedApiKey = typeof payload.apiKey === "string" ? payload.apiKey.trim() : "";
    const apiKey = suppliedApiKey || getProviderApiKey(config, "routing");
    if (!apiKey) {
      sendJson(response, 400, {
        error: {
          code: "API_KEY_REQUIRED",
          message: "请先输入 AI Routing API Key。",
        },
      });
      return;
    }

    const models = await discoverRoutingModels(apiKey);
    sendJson(response, 200, { provider: "routing", models });
    return;
  }

  if (pathname === "/api/model-config" && request.method === "GET") {
    sendJson(response, 200, publicConfig(await readConfig()));
    return;
  }

  if (pathname === "/api/model-config" && request.method === "PUT") {
    if (!hasAdminAccess(request)) {
      sendJson(response, 401, { error: "Admin token is required." });
      return;
    }

    const payload = await readJsonBody(request);
    const nextConfig = applyConfigUpdate(await readConfig(), payload);
    await writeConfig(nextConfig);
    sendJson(response, 200, publicConfig(nextConfig));
    return;
  }

  if (pathname === "/api/integrations/coze" && request.method === "GET") {
    if (!allowLegacyCozeConfig) {
      sendJson(response, 410, {
        error: {
          code: "COZE_CONFIG_ENDPOINT_RETIRED",
          message: "Use the server-side Coze workflow proxy.",
        },
      });
      return;
    }

    const access = authorizeProject(request, "coze:invoke");
    if (!access.ok) {
      sendJson(response, access.statusCode, access.error);
      return;
    }

    const config = await readConfig();
    sendJson(response, 200, cozeRuntimeConfig(config));
    return;
  }

  if (pathname === "/api/integrations/coze/run" && request.method === "POST") {
    const access = authorizeProject(request, "coze:invoke");
    if (!access.ok) {
      sendJson(response, access.statusCode, access.error);
      return;
    }

    const payload = await readJsonBody(request, 7 * 1024 * 1024);
    validateCozeRunPayload(payload);
    const config = await readConfig();
    const result = await runCozeWorkflow(cozeRuntimeConfig(config), payload, {
      timeoutMs: upstreamTimeoutMs,
    });
    await recordHubEvent(
      {
        eventType: "generate",
        projectPath: projectPathFromRequest(request, payload, pathname),
        projectId: access.projectId,
        statusCode: 200,
      },
      { source: "api", method: request.method },
    );
    sendJson(response, 200, result);
    return;
  }

  if (
    (pathname === "/api/chat" || pathname === "/api/v1/chat/completions") &&
    request.method === "POST"
  ) {
    const startedAt = Date.now();
    const access = authorizeProject(request, "model:chat");

    if (!access.ok) {
      await recordHubEvent(
        {
          eventType: "generate",
          projectPath: request.headers["x-hub-project-path"] || pathname,
          projectId: access.projectId,
          statusCode: access.statusCode,
          durationMs: Date.now() - startedAt,
        },
        { source: "api", method: request.method },
      );
      sendJson(response, access.statusCode, access.error);
      return;
    }

    let payload = {};
    let requestLease = null;

    try {
      payload = await readJsonBody(request);
      validateChatPayload(payload, { maxOutputTokens });
      requestLease = requestGovernor.acquire(
        access.projectId,
        access,
        requestedTokenLimit(payload) || 1024,
      );
      if (!requestLease.ok) {
        const policyError = new Error(requestLease.code);
        policyError.statusCode = requestLease.statusCode;
        policyError.body = requestLease.body;
        throw policyError;
      }
      const config = await readConfig();
      const selection = getProviderSelection(config, payload);
      const body = await callModel(selection, payload);
      await recordHubEvent(
        {
          eventType: "generate",
          projectPath: projectPathFromRequest(request, payload, pathname),
          projectId: access.projectId || payload.projectId,
          statusCode: 200,
          durationMs: Date.now() - startedAt,
        },
        { source: "api", method: request.method },
      );
      sendJson(response, 200, body);
    } catch (error) {
      await recordHubEvent(
        {
          eventType: "generate",
          projectPath: projectPathFromRequest(request, payload, pathname),
          projectId: access.projectId || payload.projectId,
          statusCode: error.statusCode || 500,
          durationMs: Date.now() - startedAt,
        },
        { source: "api", method: request.method },
      );
      throw error;
    } finally {
      requestLease?.release?.();
    }
    return;
  }

  sendJson(response, 404, { error: "API route not found." });
}

const server = createServer(async (request, response) => {
  try {
    const { pathname } = normalizePath(request.url || "/", request.headers.host);

    if (pathname.startsWith("/api/")) {
      await handleApi(request, response, pathname);
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendText(response, 405, "Method not allowed");
      return;
    }

    const filePath = resolvePublicPath(pathname);

    if (!filePath) {
      sendText(response, 403, "Forbidden");
      return;
    }

    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch (error) {
      if (isMissingFileError(error)) {
        sendText(response, 404, "Not found");
        return;
      }
      throw error;
    }

    if (!fileStat.isFile()) {
      sendText(response, 404, "Not found");
      return;
    }

    const contentType = contentTypes.get(path.extname(filePath)) || "application/octet-stream";
    response.writeHead(200, {
      ...securityHeaders,
      "content-type": contentType,
      "cache-control": "no-store",
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendJson(response, statusCode, toSafeErrorBody(error, statusCode));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`AI Project Hub is running at http://127.0.0.1:${port}/`);
});
