import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { listScenarioSummaries } from "./src/scenarios.mjs";
import {
  buildEvaluationPrompt,
  buildHintPrompt,
  buildRoleplayPrompt,
  extractJsonObject,
  normalizeEvaluation
} from "./src/prompts.mjs";
import { callProvider, getProviderCatalog, ProviderError, resolveModel } from "./src/providers.mjs";
import {
  ApiProblem,
  createErrorBody,
  parseEvaluationRequest,
  parsePracticeRequest
} from "./src/validation.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 3177);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg"
};

const server = createServer(async (req, res) => {
  try {
    setBaseHeaders(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(res, url.pathname);
  } catch (error) {
    handleError(res, error);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`AI English Theater listening on http://127.0.0.1:${port}`);
});

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/scenarios") {
    sendJson(res, 200, { scenarios: listScenarioSummaries() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/providers") {
    const providers = await getProviderCatalog();
    sendJson(res, 200, {
      providers,
      configured: providers.some((provider) => provider.enabled && provider.configured),
      hubUrl: "/hub/#models"
    });
    return;
  }

  if (req.method !== "POST") {
    throw new ApiProblem(405, "METHOD_NOT_ALLOWED", "Use GET or POST for this endpoint");
  }

  const body = await readJsonBody(req);
  if (url.pathname === "/api/roleplay") {
    const input = parsePracticeRequest(body);
    const prompt = buildRoleplayPrompt(input);
    const result = await callProvider({
      ...prompt,
      provider: input.provider,
      model: resolveModel(input.provider, input.model),
      purpose: "roleplay",
      scenario: input.scenario
    });
    sendJson(res, 200, {
      reply: result.text || input.scenario.opening,
      provider: result.provider,
      model: result.model,
      usage: result.usage
    });
    return;
  }

  if (url.pathname === "/api/hint") {
    const input = parsePracticeRequest(body);
    const prompt = buildHintPrompt(input);
    const result = await callProvider({
      ...prompt,
      provider: input.provider,
      model: resolveModel(input.provider, input.model),
      purpose: "hint",
      scenario: input.scenario
    });
    sendJson(res, 200, {
      hint: result.text,
      provider: result.provider,
      model: result.model
    });
    return;
  }

  if (url.pathname === "/api/evaluate") {
    const input = parseEvaluationRequest(body);
    const prompt = buildEvaluationPrompt(input);
    const result = await callProvider({
      ...prompt,
      provider: input.provider,
      model: resolveModel(input.provider, input.model),
      purpose: "evaluate",
      scenario: input.scenario,
      jsonMode: true
    });
    const report = normalizeEvaluation(extractJsonObject(result.text));
    sendJson(res, 200, {
      report,
      provider: result.provider,
      model: result.model,
      usage: result.usage
    });
    return;
  }

  throw new ApiProblem(404, "NOT_FOUND", "API endpoint not found");
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) {
      throw new ApiProblem(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiProblem(400, "INVALID_JSON", "Request body must be valid JSON");
  }
}

async function serveStatic(res, pathname) {
  const requestedPath = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^[/\\]+/, "");
  const absolutePath = resolve(publicDir, requestedPath);
  const publicRoot = resolve(publicDir);
  if (!absolutePath.startsWith(publicRoot)) {
    throw new ApiProblem(403, "FORBIDDEN", "Static path is not allowed");
  }
  try {
    const data = await readFile(absolutePath);
    const type = mimeTypes[extname(absolutePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  } catch {
    throw new ApiProblem(404, "NOT_FOUND", "Page not found");
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function setBaseHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
  );
}

function handleError(res, error) {
  if (res.headersSent) {
    res.end();
    return;
  }
  if (error instanceof ApiProblem) {
    sendJson(res, error.status, createErrorBody(error.code, error.message, error.details));
    return;
  }
  if (error instanceof ProviderError) {
    sendJson(
      res,
      error.status >= 400 && error.status < 600 ? error.status : 502,
      createErrorBody("PROVIDER_ERROR", `${error.provider}: ${error.message}`)
    );
    return;
  }
  sendJson(res, 500, createErrorBody("INTERNAL_ERROR", "Unexpected server error"));
}
