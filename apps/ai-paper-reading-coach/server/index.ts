import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import {
  GeneratePaperCoachRequestSchema,
  ImportLinkRequestSchema,
  defaultModels,
  type ApiError
} from "../src/shared/contracts.js";
import { importPaperFromLink, ImportError, parsePdfBuffer } from "./linkImporter.js";
import { getProviderCatalog, HubModelError } from "./hubModels.js";
import { generatePaperCoachOutput, ProviderError } from "./modelGateway.js";
import { parsePaperText } from "./paperParser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = existsSync(resolve(__dirname, "..", "package.json"))
  ? resolve(__dirname, "..")
  : resolve(__dirname, "..", "..");
const app = express();
const port = Number(process.env.PORT || 5186);
const isProduction = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
const basePath = normalizeBasePath(process.env.BASE_PATH || process.env.VITE_BASE_PATH || "");
const apiRouter = express.Router();

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

apiRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    app: "ai-paper-reading-coach",
    defaults: defaultModels
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

apiRouter.post("/parse-text", (req, res) => {
  const text = String(req.body?.text || "");
  if (text.trim().length < 80) {
    return res.status(422).json(errorBody("TEXT_TOO_SHORT", "请粘贴至少一段摘要或正文。"));
  }

  const paper = parsePaperText(text, {
    sourceName: String(req.body?.sourceName || "pasted-text")
  });
  return res.json({ paper });
});

apiRouter.post("/parse-pdf", express.raw({ type: ["application/pdf", "application/octet-stream"], limit: "28mb" }), async (req, res) => {
  const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
  if (buffer.byteLength < 100) {
    return res.status(422).json(errorBody("PDF_EMPTY", "没有收到可解析的 PDF 文件。"));
  }

  try {
    const paper = await parsePdfBuffer(buffer, {
      sourceName: safeHeader(req.header("x-file-name")) || "uploaded.pdf"
    });
    return res.json({ paper });
  } catch (error) {
    return handleError(res, error);
  }
});

apiRouter.post("/import-link", async (req, res) => {
  const parsed = ImportLinkRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json(errorBody("VALIDATION_ERROR", "请输入 DOI、arXiv 或 PDF 链接。", parsed.error.flatten()));
  }

  try {
    const paper = await importPaperFromLink(parsed.data.url);
    return res.json({ paper });
  } catch (error) {
    return handleError(res, error);
  }
});

apiRouter.post("/generate", async (req, res) => {
  const parsed = GeneratePaperCoachRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json(errorBody("VALIDATION_ERROR", "模型或论文上下文不完整。", parsed.error.flatten()));
  }

  try {
    const data = await generatePaperCoachOutput(parsed.data);
    return res.json({
      data,
      meta: {
        provider: parsed.data.provider,
        model: parsed.data.model,
        task: parsed.data.task,
        generatedAt: new Date().toISOString(),
        mode: "model"
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

if (isMainModule()) {
  app.listen(port, "127.0.0.1", () => {
    console.log(`AI Paper Reading Coach running at http://127.0.0.1:${port}${basePath || ""}`);
  });
}

export default app;

function handleError(res: express.Response, error: unknown) {
  if (error instanceof HubModelError) {
    return res.status(error.status).json(errorBody(error.code, error.message));
  }

  if (error instanceof ProviderError || error instanceof ImportError) {
    return res.status(error.status).json(errorBody(error.code, error.message, error instanceof ProviderError ? error.details : undefined));
  }

  console.error(error);
  return res.status(500).json(errorBody("INTERNAL_ERROR", "服务端处理失败。"));
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

function safeHeader(value: string | undefined) {
  return value ? decodeURIComponent(value).replace(/[^\w .()[\]-]+/g, "").slice(0, 180) : "";
}

function normalizeBasePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function isMainModule() {
  return Boolean(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url));
}
