import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultModels,
  isGptModel,
  isProvider,
  modelSuggestions,
  providerLabels,
  type ApiError,
  type GenerateRequest,
  type LifeRepoInput
} from "../src/shared/contracts.js";
import { getHubProviderCatalog, HubModelError } from "./hubModels.js";
import { generateLifePlan, ProviderError } from "./providerGateway.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = existsSync(resolve(__dirname, "..", "package.json"))
  ? resolve(__dirname, "..")
  : resolve(__dirname, "..", "..");
const app = express();
const port = Number(process.env.PORT || 5207);
const isProduction = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
const basePath = normalizeBasePath(process.env.BASE_PATH || process.env.VITE_BASE_PATH || "");
const apiRouter = express.Router();

app.use(express.json({ limit: "1mb" }));

apiRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    app: "ai-life-version-controller",
    providers: providerLabels,
    defaultModels,
    modelSuggestions
  });
});

apiRouter.get("/providers", async (_req, res) => {
  try {
    const providers = await getHubProviderCatalog();
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

apiRouter.post("/generate", async (req, res) => {
  const parsed = parseGenerateRequest(req.body);
  if (!parsed.ok) {
    return res.status(422).json(errorBody("VALIDATION_ERROR", parsed.message));
  }

  try {
    const data = await generateLifePlan(parsed.value);
    return res.json({
      data,
      meta: {
        provider: parsed.value.provider,
        model: parsed.value.model,
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
    console.log(`AI Life Version Controller running at http://127.0.0.1:${port}${basePath || ""}`);
  });
}

export default app;

export function parseGenerateRequest(body: unknown): { ok: true; value: GenerateRequest } | { ok: false; message: string } {
  if (!body || typeof body !== "object") return { ok: false, message: "请求体不能为空。" };
  const value = body as Partial<GenerateRequest>;
  if (!isProvider(value.provider)) return { ok: false, message: "本项目只接受 Hub 的 GPT 路由。" };
  const model = value.model?.trim() || defaultModels.openai;
  if (!isGptModel(model)) return { ok: false, message: "本项目只允许调用 gpt-* 型号。" };
  if (!value.input || typeof value.input !== "object") return { ok: false, message: "请输入人生仓库上下文。" };
  const input = value.input as Partial<LifeRepoInput>;
  if (!input.decision?.trim()) return { ok: false, message: "请写下这次要管理的人生选择。" };

  return {
    ok: true,
    value: {
      provider: value.provider,
      model,
      input: {
        repoName: text(input.repoName, "life/main"),
        currentState: text(input.currentState, "当前状态还没有记录。"),
        decision: text(input.decision, ""),
        values: text(input.values, "成长、自由、稳定"),
        constraints: text(input.constraints, "时间、精力、金钱都有限。"),
        resources: text(input.resources, "已有经验、人脉和可投入时间。"),
        timeHorizon: text(input.timeHorizon, "未来 90 天")
      }
    }
  };
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function errorBody(code: string, message: string, details?: unknown): ApiError {
  return {
    error: { code, message, details }
  };
}

function handleError(res: express.Response, error: unknown) {
  if (error instanceof HubModelError) {
    return res.status(error.status).json(errorBody(error.code, error.message, error.details));
  }
  if (error instanceof ProviderError) {
    return res.status(error.status).json(errorBody(error.code, error.message, error.details));
  }

  console.error(error);
  return res.status(500).json(errorBody("INTERNAL_ERROR", "生成人生版本库时发生未知错误。"));
}

function normalizeBasePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function isMainModule() {
  return Boolean(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url));
}
