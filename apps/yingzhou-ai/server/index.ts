import express from "express";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ApiError } from "../src/shared/contracts.js";
import {
  hubProviderPayload,
  HubRuntimeError,
  readHubModelSelection,
  resolveHubRuntime,
  writeHubModelSelection,
} from "./hubRuntime.js";
import { generatePoems, ProviderError } from "./providerGateway.js";
import { parseGenerateRequest } from "./validation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = existsSync(resolve(__dirname, "..", "package.json"))
  ? resolve(__dirname, "..")
  : resolve(__dirname, "..", "..");
const app = express();
const httpServer = createServer(app);
const port = Number(process.env.PORT || 5228);
const isProduction = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
const basePath = normalizeBasePath(process.env.BASE_PATH || process.env.VITE_BASE_PATH || "");
const api = express.Router();

app.disable("x-powered-by");
app.set("trust proxy", "loopback");
app.use(express.json({ limit: "1mb" }));
app.use(securityHeaders);

api.get("/health", async (_request, response) => {
  try {
    const runtime = await resolveHubRuntime();
    return response.json({
      ok: true,
      app: "yingzhou-ai",
      modelSource: "hub",
      defaultModel: runtime.model,
      configured: true,
      genres: ["five-quatrain", "seven-quatrain", "acrostic"],
      validation: "basic-rhyme-v1",
    });
  } catch (error) {
    if (error instanceof HubRuntimeError) {
      return response.json({
        ok: true,
        app: "yingzhou-ai",
        modelSource: "hub",
        configured: false,
        genres: ["five-quatrain", "seven-quatrain", "acrostic"],
        validation: "basic-rhyme-v1",
      });
    }
    return handleError(response, error);
  }
});

api.get("/providers", async (_request, response) => {
  try {
    return response.json(hubProviderPayload(await resolveHubRuntime()));
  } catch (error) {
    if (error instanceof HubRuntimeError) {
      return response.json({ ...hubProviderPayload(null), message: error.message });
    }
    return handleError(response, error);
  }
});

api.get("/model-selection", async (_request, response) => {
  try { return response.json(await readHubModelSelection()); } catch (error) { return handleError(response, error); }
});

api.put("/model-selection", async (request, response) => {
  try { return response.json(await writeHubModelSelection(request.body?.model)); } catch (error) { return handleError(response, error); }
});

api.post("/poems/generate", async (request, response) => {
  const parsed = parseGenerateRequest(request.body);
  if (!parsed.ok) {
    return response.status(parsed.status).json(errorBody(parsed.code, parsed.message));
  }
  try {
    const runtime = await resolveHubRuntime();
    const data = await generatePoems(parsed.value, runtime);
    return response.json({
      data,
      meta: {
        provider: runtime.provider,
        model: runtime.model,
        mode: "model",
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleError(response, error);
  }
});

app.use("/api", api);
if (basePath) app.use(`${basePath}/api`, api);

if (isProduction) {
  const distPath = resolve(projectRoot, "dist");
  const sendIndex = (_request: express.Request, response: express.Response) =>
    response.sendFile(resolve(distPath, "index.html"));
  if (basePath) {
    app.use(basePath, express.static(distPath));
    app.get(basePath, sendIndex);
    app.get(`${basePath}/*`, sendIndex);
  }
  app.use(express.static(distPath));
  app.get("*", sendIndex);
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root: projectRoot,
    server: { middlewareMode: true, hmr: { server: httpServer } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

httpServer.listen(port, "127.0.0.1", () => {
  console.log(`吟舟 AI running at http://127.0.0.1:${port}${basePath || ""}`);
});

function securityHeaders(_request: express.Request, response: express.Response, next: express.NextFunction) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isProduction) {
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    );
  }
  return next();
}

function handleError(response: express.Response, error: unknown) {
  if (error instanceof ProviderError || error instanceof HubRuntimeError) {
    return response.status(error.status).json(errorBody(error.code, error.message, error.details));
  }
  console.error(error instanceof Error ? error.message : error);
  return response.status(500).json(errorBody("INTERNAL_ERROR", "生成时发生未知错误，请稍后重试。"));
}

function errorBody(code: string, message: string, details?: unknown): ApiError {
  return { error: { code, message, details } };
}

function normalizeBasePath(value: string) {
  const clean = value.trim();
  if (!clean || clean === "/") return "";
  return `/${clean.replace(/^\/+|\/+$/g, "")}`;
}
