import cors from "cors";
import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppError, sanitizeErrorForLog, toPublicError } from "./errors";
import { getProviderStatuses, interpretDream } from "./llm";
import { InterpretRequestSchema } from "./schemas";
import { getUsageStats, listHistoryEntries, logError, logUsage, saveHistoryEntry } from "./storage";

const app = express();
const apiRouter = express.Router();
const isProduction = process.env.NODE_ENV === "production";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 5173);
const basePath = normalizeBasePath(process.env.BASE_PATH || process.env.VITE_BASE_PATH || "");

app.disable("x-powered-by");
app.set("trust proxy", "loopback");
app.use(
  helmet({
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            upgradeInsecureRequests: null
          }
        }
      : false
  })
);
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()) || true,
    credentials: false
  })
);
app.use(express.json({ limit: "32kb" }));

apiRouter.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 80,
    standardHeaders: true,
    legacyHeaders: false
  })
);

apiRouter.get("/health", (_request, response) => {
  response.json({
    ok: true,
    app: "ai-zhougong-dream",
    time: new Date().toISOString()
  });
});

apiRouter.get("/providers", async (_request, response, next) => {
  try {
    const providers = await getProviderStatuses();
    response.json({
      providers,
      configured: providers.some((provider) => provider.enabled && provider.configured),
      hubUrl: "/hub/#models"
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/history", async (_request, response, next) => {
  try {
    response.json({
      entries: await listHistoryEntries()
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/stats", async (_request, response, next) => {
  try {
    response.json({
      stats: await getUsageStats()
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/interpret", async (request, response, next) => {
  const parsed = InterpretRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    next(
      new AppError(422, "VALIDATION_ERROR", "输入内容不完整或格式不正确。", parsed.error.flatten())
    );
    return;
  }

  const safeRequest = {
    dreamText: parsed.data.dreamText,
    mood: parsed.data.mood,
    tags: parsed.data.tags,
    style: parsed.data.style,
    provider: parsed.data.provider,
    model: parsed.data.model
  };

  try {
    const interpretation = await interpretDream(parsed.data);
    const entry = await saveHistoryEntry(safeRequest, interpretation.result, interpretation.meta);

    await logUsage({
      provider: interpretation.meta.provider,
      latencyMs: interpretation.meta.latencyMs,
      success: true
    });

    response.status(201).json({ entry });
  } catch (error) {
    await logUsage({
      provider: parsed.data.provider,
      latencyMs: 0,
      success: false
    });
    await logError({
      provider: parsed.data.provider,
      code: error instanceof AppError ? error.code : undefined,
      error: sanitizeErrorForLog(error)
    });
    next(error);
  }
});

apiRouter.use((_request, _response, next) => {
  next(new AppError(404, "NOT_FOUND", "没有找到对应的 API。"));
});

app.use("/api", apiRouter);
if (basePath) {
  app.use(`${basePath}/api`, apiRouter);
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const publicError = toPublicError(error);
  response.status(publicError.status).json(publicError.body);
});

const httpServer = createServer(app);

await attachFrontend(httpServer);

httpServer.listen(port, "127.0.0.1", () => {
  console.log(`AI 周公解梦已启动：http://127.0.0.1:${port}${basePath || ""}`);
});

async function attachFrontend(server: Server) {
  if (isProduction) {
    const distDir = path.join(rootDir, "dist");
    const sendIndex = (_request: express.Request, response: express.Response) => {
      response.sendFile(path.join(distDir, "index.html"));
    };

    if (basePath) {
      app.use(basePath, express.static(distDir));
      app.get(basePath, sendIndex);
      app.use(basePath, sendIndex);
    }

    app.use(express.static(distDir));
    app.use(sendIndex);
    return;
  }

  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root: rootDir,
    server: { hmr: { server }, middlewareMode: true },
    appType: "spa"
  });

  app.use(vite.middlewares);
}

function normalizeBasePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}
