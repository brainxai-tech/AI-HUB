import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import {
  defaultModels,
  generateRequestSchema,
  modelSuggestions,
  providerLabels,
  type ApiError
} from "../src/shared/contracts.js";
import { getProviderCatalog, HubModelError } from "./hubModels.js";
import { demoCounterfactualResult } from "./localDemo.js";
import { generateWithProvider, ProviderError } from "./providerGateway.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = existsSync(resolve(__dirname, "..", "package.json"))
  ? resolve(__dirname, "..")
  : resolve(__dirname, "..", "..");
const app = express();
const port = Number(process.env.PORT || 5184);
const isProduction = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
const basePath = normalizeBasePath(process.env.BASE_PATH || process.env.VITE_BASE_PATH || "");
const apiRouter = express.Router();

app.use(express.json({ limit: "1mb" }));

apiRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    app: "ai-counterfactual-life-simulator",
    defaults: defaultModels,
    providers: providerLabels,
    modelSuggestions
  });
});

apiRouter.get("/providers", async (_req, res) => {
  try {
    const providers = await getProviderCatalog();
    return res.json({
      providers,
      configured: providers.some((provider) => provider.enabled && provider.configured),
      hubUrl: "/hub/#models"
    });
  } catch (error) {
    return handleError(res, error);
  }
});

apiRouter.post("/generate", async (req, res) => {
  const parsed = generateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json(errorBody("VALIDATION_ERROR", "输入信息不完整或格式不正确。", parsed.error.flatten()));
  }

  try {
    const isLocalPreview = parsed.data.provider === "demo";
    const data = isLocalPreview ? demoCounterfactualResult(parsed.data) : await generateWithProvider(parsed.data);
    return res.json({
      data,
      meta: {
        provider: parsed.data.provider,
        model: parsed.data.model,
        mode: isLocalPreview ? "local_preview" : "model",
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
  const vite = await createViteServer({
    root: projectRoot,
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

app.listen(port, "127.0.0.1", () => {
  console.log(`AI Counterfactual Life Simulator running at http://127.0.0.1:${port}${basePath || ""}`);
});

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
  return res.status(500).json(errorBody("INTERNAL_ERROR", "生成分支时发生未知错误。"));
}

function normalizeBasePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}
