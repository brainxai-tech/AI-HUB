import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultModels,
  generateBrandPackRequestSchema,
  modelSuggestions,
  providerLabels,
  type ApiError
} from "../src/shared/contracts.js";
import { buildDemoBrandPack } from "./demoBrandPack.js";
import { generateWithProvider, ProviderError } from "./providerGateway.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = existsSync(resolve(__dirname, "..", "package.json"))
  ? resolve(__dirname, "..")
  : resolve(__dirname, "..", "..");
const app = express();
const port = Number(process.env.PORT || 5247);
const isProduction = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
const basePath = normalizeBasePath(process.env.BASE_PATH || process.env.VITE_BASE_PATH || "");
const apiRouter = express.Router();
const rateLimitState = new Map<string, { count: number; resetAt: number }>();

app.use(express.json({ limit: "1mb" }));
app.use(securityHeaders);

apiRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    app: "ai-cold-start-brand-lab",
    providers: providerLabels,
    defaultModels,
    modelSuggestions
  });
});

apiRouter.get("/providers", (_req, res) => {
  res.json({
    providers: providerLabels,
    defaultModels,
    modelSuggestions,
    configured: { openai: false },
    defaultProvider: "openai",
    hubUrl: "/hub/#models"
  });
});

apiRouter.post("/generate-brand-pack", generationRateLimit, async (req, res) => {
  const parsed = generateBrandPackRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json(errorBody("VALIDATION_ERROR", "输入信息不完整或格式不正确。", parsed.error.flatten()));
  }

  try {
    const input = parsed.data;
    const isDemo = input.provider === "demo";
    const data = isDemo ? buildDemoBrandPack(input) : await generateWithProvider(input);

    return res.json({
      data,
      meta: {
        provider: input.provider,
        model: input.model,
        mode: isDemo ? "demo" : "model",
        focus: input.focus,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return handleError(res, error);
  }
});

app.use("/api", apiRouter);
if (basePath) {
  app.use(`${basePath}/api`, apiRouter);
}

if (isProduction) {
  const distPath = resolve(projectRoot, "dist");
  if (!existsSync(distPath)) {
    console.warn("dist directory not found. Run npm run build before npm start.");
  }

  const sendIndex = (_req: express.Request, res: express.Response) => {
    res.sendFile(resolve(distPath, "index.html"));
  };

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
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

app.listen(port, "127.0.0.1", () => {
  console.log(`AI Cold Start Brand Lab running at http://127.0.0.1:${port}${basePath || ""}`);
});

function generationRateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxRequests = 20;
  const key = req.ip || "local";
  const current = rateLimitState.get(key);

  if (!current || current.resetAt < now) {
    rateLimitState.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  if (current.count >= maxRequests) {
    return res.status(429).json(errorBody("RATE_LIMITED", "请求过于频繁，请稍后再试。"));
  }

  current.count += 1;
  return next();
}

function securityHeaders(req: express.Request, res: express.Response, next: express.NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (isProduction) {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    );
  }

  return next();
}

function errorBody(code: string, message: string, details?: unknown): ApiError {
  return {
    error: {
      code,
      message,
      details
    }
  };
}

function handleError(res: express.Response, error: unknown) {
  if (error instanceof ProviderError) {
    return res.status(error.status).json(errorBody(error.code, error.message, error.details));
  }

  console.error(error);
  return res.status(500).json(errorBody("INTERNAL_ERROR", "生成品牌包时发生未知错误。"));
}

function normalizeBasePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}
