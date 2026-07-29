import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { analyzeRequestSchema, type ApiError } from "../src/shared/schema.js";
import { providerStatus, runAnalysis } from "./providers/index.js";
import { ProviderError } from "./providers/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = existsSync(resolve(__dirname, "..", "package.json"))
  ? resolve(__dirname, "..")
  : resolve(__dirname, "..", "..");
const app = express();
const port = Number(process.env.PORT || 8789);
const isProduction = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
const basePath = normalizeBasePath(process.env.BASE_PATH || process.env.VITE_BASE_PATH || "");
const apiRouter = express.Router();

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.use(express.json({ limit: "70mb" }));

apiRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    app: "ai-aesthetic-fingerprint",
    providers: providerStatus()
  });
});

apiRouter.get("/providers", (_req, res) => {
  const providers = providerStatus();
  res.json({
    providers,
    configured: providers.some((provider) => provider.provider !== "demo" && provider.configured),
    hubUrl: "/hub/#models",
    note: "图片先提取本地像素指标，再由 AI Hub 中本项目选择的 GPT 型号生成报告。"
  });
});

apiRouter.post("/analyze", async (req, res) => {
  const parsed = analyzeRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json(errorBody("VALIDATION_ERROR", "上传图片或目标描述不符合要求。", parsed.error.flatten()));
  }

  try {
    const response = await runAnalysis(parsed.data);
    return res.json(response);
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
  console.log(`AI Aesthetic Fingerprint running at http://127.0.0.1:${port}${basePath || ""}`);
});

function handleError(res: express.Response, error: unknown) {
  if (error instanceof ProviderError) {
    return res.status(error.status).json(errorBody(error.code, error.message, error.details));
  }

  console.error(error);
  return res.status(500).json(errorBody("INTERNAL_ERROR", "服务端处理失败，请稍后重试。"));
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

function normalizeBasePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}
