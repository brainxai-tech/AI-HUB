import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeMessage } from "./public/fraudAnalyzer.mjs";
import { callModelProvider } from "./src/modelAnalyzer.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicRoot = join(root, "public");
const port = Number(process.env.PORT || 4182);
const maxBodySize = 220_000;
const publicBasePaths = ["/elder"];
const HUB_MODEL_CONFIG_URL = process.env.HUB_MODEL_CONFIG_URL || "http://127.0.0.1:4194/hub/api/model-config";
const HUB_PROJECT_TOKEN = process.env.HUB_PROJECT_TOKEN || "";

const modelProviders = [
  { id: "openai", label: "GPT · AI Routing", model: "", models: [] }
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function resolvePath(urlPath) {
  const requested = decodeURIComponent(urlPath.split("?")[0]);
  const cleanPath = requested === "/" ? "index.html" : requested.replace(/^[/\\]+/, "");
  const normalized = normalize(cleanPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicRoot, normalized);

  if (!filePath.startsWith(publicRoot)) {
    return join(publicRoot, "index.html");
  }

  return filePath;
}

function stripMountPath(pathname) {
  for (const basePath of publicBasePaths) {
    if (pathname === basePath) return "/";
    if (pathname.startsWith(`${basePath}/`)) {
      return pathname.slice(basePath.length) || "/";
    }
  }
  return pathname;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodySize) {
      throw new Error("请求内容过大");
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

createServer(async (request, response) => {
  const routePath = stripMountPath(request.url?.split("?")[0] || "/");

  if (request.method === "GET" && routePath === "/api/providers") {
    sendJson(response, 200, await createProvidersPayload());
    return;
  }

  if (request.method === "POST" && routePath === "/api/model-analyze") {
    try {
      const body = await readJsonBody(request);
      const message = String(body.message || "").trim();
      if (!message) {
        sendJson(response, 400, { error: "请先放入一段消息文字" });
        return;
      }

      const localResult = analyzeMessage(message);
      const modelResult = await callModelProvider({
        message,
        localResult
      });

      sendJson(response, 200, {
        provider: "hub",
        model: "hub-default",
        result: {
          ...modelResult,
          modelMeta: {
            provider: "hub",
            model: "hub-default",
            analyzedAt: new Date().toISOString()
          }
        },
        localResult
      });
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : "大模型分析失败"
      });
    }
    return;
  }

  try {
    const filePath = resolvePath(routePath);
    const content = await readFile(filePath);
    const contentType = mimeTypes[extname(filePath)] || "application/octet-stream";

    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, () => {
  console.log(`老人防骗助手 running at http://localhost:${port}`);
});

async function createProvidersPayload() {
  try {
    const response = await fetch(HUB_MODEL_CONFIG_URL, {
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

  return modelProviders.map((localProvider) => {
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
  return modelProviders.map((provider) => ({
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
  return modelProviders.some((provider) => provider.id === providerId) ? providerId : "openai";
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
