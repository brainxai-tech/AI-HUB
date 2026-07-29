import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeRequestSchema,
  defaultModels,
  modelSuggestions,
  providerLabels,
  type ApiError
} from "../src/shared/contracts.js";
import { getProviderCatalog, HubModelError } from "./hubModels.js";
import { generateWithProvider, ProviderError } from "./providerGateway.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = existsSync(resolve(__dirname, "..", "package.json"))
  ? resolve(__dirname, "..")
  : resolve(__dirname, "..", "..");
const app = express();
const port = Number(process.env.PORT || 5198);
const isProduction = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
const basePath = normalizeBasePath(process.env.BASE_PATH || process.env.VITE_BASE_PATH || "");
const apiRouter = express.Router();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

apiRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    app: "ai-misunderstanding-simulator",
    providers: providerLabels,
    defaultModels,
    modelSuggestions
  });
});

apiRouter.get("/providers", async (_req, res) => {
  try {
    const providers = await getProviderCatalog();
    return res.json({
      providers,
      configured: providers.some((provider) => provider.enabled && provider.configured),
      defaultProvider: "openai",
      hubUrl: "/hub/#models"
    });
  } catch (error) {
    return handleError(res, error);
  }
});

apiRouter.post(["/analyze", "/generate"], async (req, res) => {
  const parsed = analyzeRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json(errorBody("VALIDATION_ERROR", "输入信息不完整或格式不正确。", parsed.error.flatten()));
  }

  try {
    const input = parsed.data;
    const data = await generateWithProvider(input);

    return res.json({
      data,
      meta: {
        provider: input.provider,
        model: input.model,
        mode: "model",
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

if (isMainModule()) {
  app.listen(port, "127.0.0.1", () => {
    console.log(`AI Misunderstanding Simulator running at http://127.0.0.1:${port}${basePath || ""}`);
  });
}

export default app;

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
  if (error instanceof HubModelError) {
    return res.status(error.status).json(errorBody(error.code, error.message));
  }

  if (error instanceof ProviderError) {
    return res.status(error.status).json(errorBody(error.code, error.message, error.details));
  }

  console.error(error);
  return res.status(500).json(errorBody("INTERNAL_ERROR", "分析误解风险时发生未知错误。"));
}

function normalizeBasePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function isMainModule() {
  return Boolean(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url));
}
