import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { questions } from "../src/data/questions.js";
import { personalityProfiles } from "../src/data/results.js";
import { scoreAnswers } from "../src/lib/scoring.js";
import { aiInterpretationRequestSchema, type ApiError } from "../src/shared/contracts.js";
import type { AnswerMap } from "../src/types.js";
import {
  hubProviderPayload,
  HubRuntimeError,
  readHubModelSelection,
  resolveHubRuntime,
  writeHubModelSelection,
} from "./hubRuntime.js";
import { generateAiInterpretation, ProviderError } from "./providerGateway.js";
import { PROMPT_VERSION } from "./prompt.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = existsSync(resolve(__dirname, "..", "package.json"))
  ? resolve(__dirname, "..")
  : resolve(__dirname, "..", "..");
const app = express();
const port = Number(process.env.PORT || 5177);
const isProduction = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
const basePath = normalizeBasePath(process.env.BASE_PATH || process.env.VITE_BASE_PATH || "");
const api = express.Router();
const rateLimitState = new Map<string, { count: number; resetAt: number }>();

app.disable("x-powered-by");
app.set("trust proxy", "loopback");
app.use(express.json({ limit: "256kb" }));
app.use(securityHeaders);

api.get("/health", async (_req, res) => {
  try {
    const runtime = await resolveHubRuntime();
    return res.json({
      ok: true,
      app: "mbti-persona-compass",
      modelSource: "hub",
      defaultModel: runtime.model,
      configured: true,
      promptVersion: PROMPT_VERSION,
    });
  } catch (error) {
    if (error instanceof HubRuntimeError) {
      return res.json({
        ok: true,
        app: "mbti-persona-compass",
        modelSource: "hub",
        configured: false,
        promptVersion: PROMPT_VERSION,
      });
    }
    return handleError(res, error);
  }
});

api.get("/providers", async (_req, res) => {
  try {
    return res.json(hubProviderPayload(await resolveHubRuntime()));
  } catch (error) {
    if (error instanceof HubRuntimeError) {
      return res.json({ ...hubProviderPayload(null), message: error.message });
    }
    return handleError(res, error);
  }
});

api.get("/model-selection", async (_req, res) => {
  try {
    return res.json(await readHubModelSelection());
  } catch (error) {
    return handleError(res, error);
  }
});

api.put("/model-selection", async (req, res) => {
  try {
    return res.json(await writeHubModelSelection(req.body?.model));
  } catch (error) {
    return handleError(res, error);
  }
});

api.post("/ai-interpretation", generationRateLimit, async (req, res) => {
  const parsed = aiInterpretationRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json(errorBody("VALIDATION_ERROR", "答题数据不完整。", parsed.error.flatten()));
  }

  const answers = Object.fromEntries(
    Object.entries(parsed.data.answers).map(([key, value]) => [Number(key), value]),
  ) as AnswerMap;
  const score = scoreAnswers(answers, questions);
  if (!score.isComplete) {
    return res.status(422).json(errorBody("INCOMPLETE_ANSWERS", "需要完成全部 32 题后再生成解读。"));
  }
  const profile = personalityProfiles[score.type];
  if (!profile) {
    return res.status(422).json(errorBody("UNKNOWN_TYPE", "无法识别本次人格类型。"));
  }

  try {
    const runtime = await resolveHubRuntime();
    const data = await generateAiInterpretation({ answers, score, profile }, runtime);
    return res.json({
      data,
      meta: {
        type: score.type,
        provider: runtime.provider,
        model: runtime.model,
        promptVersion: PROMPT_VERSION,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
});

app.use("/api", api);
if (basePath) app.use(`${basePath}/api`, api);

if (isProduction) {
  const distPath = resolve(projectRoot, "dist");
  const sendIndex = (_req: express.Request, res: express.Response) =>
    res.sendFile(resolve(distPath, "index.html"));
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
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.listen(port, "127.0.0.1", () => {
  console.log(`人格罗盘 Persona running at http://127.0.0.1:${port}${basePath || ""}`);
});

function generationRateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = req.ip || "local";
  const now = Date.now();
  const current = rateLimitState.get(key);
  if (!current || current.resetAt < now) {
    rateLimitState.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return next();
  }
  if (current.count >= 20) {
    return res.status(429).json(errorBody("RATE_LIMITED", "AI 解读请求过于频繁，请稍后再试。"));
  }
  current.count += 1;
  return next();
}

function securityHeaders(_req: express.Request, res: express.Response, next: express.NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isProduction) {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    );
  }
  return next();
}

function handleError(res: express.Response, error: unknown) {
  if (error instanceof ProviderError || error instanceof HubRuntimeError) {
    return res.status(error.status).json(errorBody(error.code, error.message, "details" in error ? error.details : undefined));
  }
  console.error(error instanceof Error ? error.message : error);
  return res.status(500).json(errorBody("INTERNAL_ERROR", "生成 AI 解读时发生未知错误，请稍后重试。"));
}

function errorBody(code: string, message: string, details?: unknown): ApiError {
  return { error: { code, message, details } };
}

function normalizeBasePath(value: string) {
  const clean = value.trim();
  if (!clean || clean === "/") return "";
  return `/${clean.replace(/^\/+|\/+$/g, "")}`;
}
