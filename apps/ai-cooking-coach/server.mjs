import http from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPlanResponse, errorToPayload } from "./src/server/plan-response.mjs";
import { createAgentResponse } from "./src/server/agent-response.mjs";
import { createMealAdjustmentResponse } from "./src/server/meal-adjustment-response.mjs";
import { createWeekReviewResponse } from "./src/server/week-review-response.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const DEFAULT_PORT = Number.parseInt(process.env.PORT || "4317", 10);
const PUBLIC_BASE_PATHS = ["/cooking"];
const HUB_MODEL_CONFIG_URL = process.env.HUB_MODEL_CONFIG_URL || "http://127.0.0.1:4194/hub/api/model-config";
const HUB_PROJECT_TOKEN = process.env.HUB_PROJECT_TOKEN || "";

const MODEL_PROVIDERS = [
  { id: "openai", label: "GPT · AI Routing", model: "", models: [] }
];

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".json", "application/json; charset=utf-8"]
]);

const CORS_ALLOW_HEADERS = "Content-Type, Authorization";
const CORS_ALLOW_METHODS = "GET, POST, OPTIONS";
const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

export function createCookingCoachServer({ fetchImpl = globalThis.fetch } = {}) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      const routePath = stripMountPath(url.pathname);

      if (request.method === "OPTIONS") {
        return sendCorsPreflight(request, response);
      }

      if (request.method === "GET" && routePath === "/api/health") {
        return sendJson(response, 200, { ok: true, name: "ai-cooking-coach" }, request);
      }

      if (request.method === "GET" && routePath === "/api/providers") {
        return sendJson(response, 200, await createProvidersPayload(fetchImpl), request);
      }

      if (request.method === "GET" && routePath === "/api/agent") {
        return sendJson(response, 200, createAgentResponse(), request);
      }

      if (request.method === "POST" && routePath === "/api/plan") {
        await handlePlanRequest(request, response, fetchImpl);
        return;
      }

      if (request.method === "POST" && routePath === "/api/adjust-meal") {
        await handleMealAdjustmentRequest(request, response, fetchImpl);
        return;
      }

      if (request.method === "POST" && routePath === "/api/review-week") {
        await handleWeekReviewRequest(request, response, fetchImpl);
        return;
      }

      if (request.method === "GET") {
        await serveStatic(routePath, response, request);
        return;
      }

      sendJson(response, 405, { error: "Method not allowed" }, request);
    } catch (error) {
      sendJson(response, error.status || 500, errorToPayload(error), request);
    }
  });
}

function stripMountPath(pathname) {
  for (const basePath of PUBLIC_BASE_PATHS) {
    if (pathname === basePath) return "/";
    if (pathname.startsWith(`${basePath}/`)) {
      return pathname.slice(basePath.length) || "/";
    }
  }
  return pathname;
}

async function handlePlanRequest(request, response, fetchImpl) {
  const body = await readJson(request);
  const payload = await createPlanResponse(body, { fetchImpl });
  sendJson(response, 200, payload, request);
}

async function handleMealAdjustmentRequest(request, response, fetchImpl) {
  const body = await readJson(request);
  const payload = await createMealAdjustmentResponse(body, { fetchImpl });
  sendJson(response, 200, payload, request);
}

async function handleWeekReviewRequest(request, response, fetchImpl) {
  const body = await readJson(request);
  const payload = await createWeekReviewResponse(body, { fetchImpl });
  sendJson(response, 200, payload, request);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 128_000) {
        reject(Object.assign(new Error("Request body is too large."), { status: 413 }));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!data.trim()) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(Object.assign(new Error("Request JSON could not be parsed."), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

async function serveStatic(pathname, response, request) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(safePath);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, normalized);
  const relative = path.relative(PUBLIC_DIR, filePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return sendJson(response, 403, { error: "Forbidden" }, request);
  }

  try {
    await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES.get(path.extname(filePath)) || "application/octet-stream",
      "Cache-Control": "no-store",
      ...corsHeaders(request)
    });
    createReadStream(filePath).pipe(response);
  } catch {
    sendJson(response, 404, { error: "Not found" }, request);
  }
}

function sendCorsPreflight(request, response) {
  response.writeHead(204, {
    ...corsHeaders(request),
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Access-Control-Allow-Methods": CORS_ALLOW_METHODS,
    "Access-Control-Max-Age": "600"
  });
  response.end();
}

function corsHeaders(request) {
  const origin = request?.headers?.origin;
  if (origin !== "null" && !LOCAL_ORIGIN_PATTERN.test(origin || "")) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin"
  };
}

function sendJson(response, status, payload, request) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...corsHeaders(request)
  });
  response.end(JSON.stringify(payload));
}

async function createProvidersPayload(fetchImpl) {
  try {
    const response = await fetchImpl(HUB_MODEL_CONFIG_URL, {
      headers: hubHeaders()
    });
    const config = await response.json().catch(() => null);
    if (!response.ok || !config) {
      return providerPayload(localProviderStatuses(), "openai", false);
    }

    const providers = normalizeHubProviderStatuses(config.providers);
    return providerPayload(
      providers,
      normalizeProviderId(config.defaultProvider),
      providers.some((provider) => provider.configured)
    );
  } catch {
    return providerPayload(localProviderStatuses(), "openai", false);
  }
}

function hubHeaders() {
  const headers = { accept: "application/json" };
  if (HUB_PROJECT_TOKEN) headers["x-hub-project-token"] = HUB_PROJECT_TOKEN;
  return headers;
}

function normalizeHubProviderStatuses(value) {
  const hubProviders = new Map();
  for (const provider of Array.isArray(value) ? value : []) {
    if (!provider || typeof provider !== "object") continue;
    hubProviders.set(normalizeProviderId(provider.id ?? provider.provider), provider);
  }

  return MODEL_PROVIDERS.map((localProvider) => {
    const hubProvider = hubProviders.get(localProvider.id) ?? {};
    const candidateModel = sanitizeString(hubProvider.model);
    const models = uniqueStrings(
      asStringArray(hubProvider.models),
      asStringArray(hubProvider.enabledModels),
      candidateModel ? [candidateModel] : []
    ).filter(isGptModel);
    const enabledModels = uniqueStrings(
      asStringArray(hubProvider.enabledModels),
      candidateModel ? [candidateModel] : []
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
      configured: Boolean(hubProvider.enabled && hubProvider.configured)
    };
  });
}

function localProviderStatuses() {
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

function providerPayload(providers, defaultProvider, configured) {
  return { providers, configured, defaultProvider, hubUrl: "/hub/#models" };
}

function normalizeProviderId(value) {
  const providerId = sanitizeString(value);
  return MODEL_PROVIDERS.some((provider) => provider.id === providerId) ? providerId : "openai";
}

function isGptModel(value) {
  return /^gpt-/i.test(value);
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(sanitizeString).filter(Boolean);
}

function uniqueStrings(...lists) {
  return [...new Set(lists.flat().map(sanitizeString).filter(Boolean))];
}

function sanitizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  const server = createCookingCoachServer();
  server.listen(DEFAULT_PORT, "127.0.0.1", () => {
    const address = server.address();
    console.log(`AI Cooking Coach running at http://127.0.0.1:${address.port}`);
  });
}
