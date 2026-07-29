import express from "/home/admin/apps/ai-paper-reading-coach/node_modules/express/index.js";
import {
  GeneratePaperCoachRequestSchema,
  ImportLinkRequestSchema,
  defaultModels,
} from "/home/admin/apps/ai-paper-reading-coach/dist-server/src/shared/contracts.js";
import {
  importPaperFromLink,
  ImportError,
  parsePdfBuffer,
} from "/home/admin/apps/ai-paper-reading-coach/dist-server/server/linkImporter.js";
import {
  getProviderCatalog,
  HubModelError,
} from "/home/admin/apps/ai-paper-reading-coach/dist-server/server/hubModels.js";
import {
  generatePaperCoachOutput,
  ProviderError,
} from "/home/admin/apps/ai-paper-reading-coach/dist-server/server/modelGateway.js";
import { parsePaperText } from "/home/admin/apps/ai-paper-reading-coach/dist-server/server/paperParser.js";

const app = express();
const apiRouter = express.Router();

app.use(express.json({ limit: "2mb" }));

apiRouter.get("/health", (_request, response) => {
  response.json({ ok: true, app: "ai-paper-reading-coach", defaults: defaultModels });
});

apiRouter.get("/providers", async (_request, response) => {
  try {
    const providers = await getProviderCatalog();
    return response.json({
      providers,
      configured: providers.some((provider) => provider.enabled && provider.configured),
      hubUrl: "/hub/#models",
    });
  } catch (error) {
    return handleError(response, error);
  }
});

apiRouter.post("/parse-text", (request, response) => {
  const text = String(request.body?.text || "");
  if (text.trim().length < 80) {
    return response.status(422).json(errorBody("TEXT_TOO_SHORT", "请粘贴至少一段摘要或正文。"));
  }
  const paper = parsePaperText(text, { sourceName: String(request.body?.sourceName || "pasted-text") });
  return response.json({ paper });
});

apiRouter.post(
  "/parse-pdf",
  express.raw({ type: ["application/pdf", "application/octet-stream"], limit: "28mb" }),
  async (request, response) => {
    const buffer = Buffer.isBuffer(request.body) ? request.body : Buffer.from([]);
    if (buffer.byteLength < 100) {
      return response.status(422).json(errorBody("PDF_EMPTY", "没有收到可解析的 PDF 文件。"));
    }
    try {
      const paper = await parsePdfBuffer(buffer, {
        sourceName: safeHeader(request.header("x-file-name")) || "uploaded.pdf",
      });
      return response.json({ paper });
    } catch (error) {
      return handleError(response, error);
    }
  },
);

apiRouter.post("/import-link", async (request, response) => {
  const parsed = ImportLinkRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(422).json(
      errorBody("VALIDATION_ERROR", "请输入 DOI、arXiv 或 PDF 链接。", parsed.error.flatten()),
    );
  }
  try {
    return response.json({ paper: await importPaperFromLink(parsed.data.url) });
  } catch (error) {
    return handleError(response, error);
  }
});

apiRouter.post("/generate", async (request, response) => {
  const parsed = GeneratePaperCoachRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(422).json(
      errorBody("VALIDATION_ERROR", "模型或论文上下文不完整。", parsed.error.flatten()),
    );
  }
  try {
    const data = await generatePaperCoachOutput(parsed.data);
    return response.json({
      data,
      meta: {
        provider: parsed.data.provider,
        model: parsed.data.model,
        task: parsed.data.task,
        generatedAt: new Date().toISOString(),
        mode: "model",
      },
    });
  } catch (error) {
    return handleError(response, error);
  }
});

app.use("/api", apiRouter);

function handleError(response, error) {
  if (error instanceof HubModelError) {
    return response.status(error.status).json(errorBody(error.code, error.message));
  }
  if (error instanceof ProviderError || error instanceof ImportError) {
    return response.status(error.status).json(
      errorBody(
        error.code,
        error.message,
        error instanceof ProviderError ? error.details : undefined,
      ),
    );
  }
  console.error(error);
  return response.status(500).json(errorBody("INTERNAL_ERROR", "服务端处理失败。"));
}

function errorBody(code, message, details) {
  return { error: { code, message, details } };
}

function safeHeader(value) {
  return value ? decodeURIComponent(value).replace(/[^\w .()[\]-]+/g, "").slice(0, 180) : "";
}

export default app;
