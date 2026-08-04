import { WorkflowError } from "./errors.mjs";

const DEFAULT_TIMEOUT_MS = 95_000;
const DEFAULT_COURSE_TIMEOUT_MS = 200_000;

export class ProjectClient {
  constructor({
    services = defaultServices(),
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    serviceTimeouts = defaultServiceTimeouts(),
    timeoutSignal = (milliseconds) => AbortSignal.timeout(milliseconds),
  } = {}) {
    this.services = services;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.serviceTimeouts = { ...serviceTimeouts };
    this.timeoutSignal = timeoutSignal;
  }

  async requestJson(serviceId, requestPath, { method = "GET", body, headers = {} } = {}) {
    const baseUrl = this.services[serviceId];
    if (!baseUrl) throw new WorkflowError("UNKNOWN_SERVICE", `未知项目服务：${serviceId}`, 500);
    const url = new URL(normalizeRequestPath(requestPath), ensureTrailingSlash(baseUrl));
    let response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: this.timeoutSignal(Math.max(this.timeoutMs, this.serviceTimeouts[serviceId] || 0)),
        cache: "no-store",
      });
    } catch {
      throw new WorkflowError("UPSTREAM_UNAVAILABLE", `${serviceId} 服务暂时不可用。`, 502);
    }
    const payload = await readPayload(response);
    if (!response.ok) {
      throw new WorkflowError(
        "UPSTREAM_ERROR",
        upstreamMessage(payload, `${serviceId} 请求失败。`),
        response.status >= 500 ? 502 : response.status,
        { serviceId, upstreamStatus: response.status },
      );
    }
    return payload;
  }

  async resolveModel(serviceId, preferredModel) {
    if (isGptModel(preferredModel)) return preferredModel.trim();
    const payload = await this.requestJson(serviceId, "/api/providers");
    const providers = Array.isArray(payload?.providers) ? payload.providers : [];
    const provider = providers.find((item) => item?.id === "openai");
    const enabledModels = uniqueStrings(provider?.enabledModels);
    const models = uniqueStrings(provider?.models);
    const candidate = provider?.defaultModel || provider?.model || enabledModels[0] || models[0];
    if (!provider?.enabled || !provider?.configured || !isGptModel(candidate)) {
      throw new WorkflowError(
        "MODEL_NOT_CONFIGURED",
        `请先在 AI HUB 为 ${serviceId} 配置并启用 GPT 型号。`,
        503,
      );
    }
    return candidate.trim();
  }
}

export function defaultServices(env = process.env) {
  const shared = env.AIHUB_SHARED_PROJECT_ORIGIN || "http://127.0.0.1:4195";
  return {
    essay: env.AIHUB_ESSAY_ORIGIN || "http://127.0.0.1:4204/essay/",
    cooking: env.AIHUB_COOKING_ORIGIN || `${shared}/cooking/`,
    paper: env.AIHUB_PAPER_ORIGIN || `${shared}/paper/`,
    course: env.AIHUB_COURSE_ORIGIN || `${shared}/course/`,
    legal: env.AIHUB_LEGAL_ORIGIN || `${shared}/legal/`,
  };
}

export function defaultServiceTimeouts(env = process.env) {
  return {
    course: boundedTimeout(env.AIHUB_COURSE_TIMEOUT_MS, DEFAULT_COURSE_TIMEOUT_MS),
  };
}

function boundedTimeout(value, fallback) {
  const parsed = Number.parseInt(value || String(fallback), 10) || fallback;
  return Math.min(Math.max(parsed, 1_000), 300_000);
}

function normalizeRequestPath(requestPath) {
  return String(requestPath || "").replace(/^\/+/, "");
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

async function readPayload(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new WorkflowError("UPSTREAM_BAD_RESPONSE", "项目服务返回了无法解析的响应。", 502);
  }
}

function upstreamMessage(payload, fallback) {
  if (typeof payload?.error?.message === "string") return payload.error.message;
  if (typeof payload?.message === "string") return payload.message;
  if (typeof payload?.error === "string") return payload.error;
  return fallback;
}

function uniqueStrings(values) {
  return Array.isArray(values)
    ? [...new Set(values.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean))]
    : [];
}

function isGptModel(value) {
  return typeof value === "string" && /^gpt-/i.test(value.trim());
}
