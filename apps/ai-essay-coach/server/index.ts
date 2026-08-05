import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  genreOptions,
  gradeOptions,
  isGenre,
  isGrade,
  type AnalysisResult,
  type AnalyzeRequest,
  type ApiError,
  type ComposeRequest,
  type EssayInput,
  type EssayOutline,
  type MaterialAnswers,
  type OutlineRequest
} from "../src/shared/contracts.js";
import { analyzeEssay, composeEssay, createOutlines, ProviderError } from "./providerGateway.js";
import {
  hubProviderPayload,
  HubRuntimeError,
  readHubModelSelection,
  resolveHubRuntime,
  writeHubModelSelection
} from "./hubRuntime.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = existsSync(resolve(__dirname, "..", "package.json"))
  ? resolve(__dirname, "..")
  : resolve(__dirname, "..", "..");
const app = express();
const port = Number(process.env.PORT || 5216);
const isProduction = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
const basePath = normalizeBasePath(process.env.BASE_PATH || process.env.VITE_BASE_PATH || "");
const apiRouter = express.Router();

app.use(express.json({ limit: "1mb" }));

apiRouter.get("/health", async (_req, res) => {
  try {
    const runtime = await resolveHubRuntime();
    return res.json({ ok: true, app: "ai-essay-coach", modelSource: "hub", defaultModel: runtime.model, configured: true, genres: genreOptions, grades: gradeOptions });
  } catch (error) {
    if (error instanceof HubRuntimeError) return res.json({ ok: true, app: "ai-essay-coach", modelSource: "hub", configured: false, genres: genreOptions, grades: gradeOptions });
    return handleError(res, error);
  }
});

apiRouter.get("/providers", async (_req, res) => {
  try {
    return res.json(hubProviderPayload(await resolveHubRuntime()));
  } catch (error) {
    if (error instanceof HubRuntimeError) return res.json({ ...hubProviderPayload(null), message: error.message });
    return handleError(res, error);
  }
});

apiRouter.get("/model-selection", async (_req, res) => {
  try { return res.json(await readHubModelSelection()); } catch (error) { return handleError(res, error); }
});

apiRouter.put("/model-selection", async (req, res) => {
  try { return res.json(await writeHubModelSelection(req.body?.model)); } catch (error) { return handleError(res, error); }
});

apiRouter.post("/analyze", async (req, res) => {
  const parsed = parseAnalyzeRequest(req.body);
  if (!parsed.ok) return res.status(parsed.status).json(errorBody(parsed.code, parsed.message));
  try {
    const runtime = await resolveHubRuntime();
    return res.json(responseBody(await analyzeEssay(parsed.value, runtime), runtime));
  } catch (error) {
    return handleError(res, error);
  }
});

apiRouter.post("/outlines", async (req, res) => {
  const parsed = parseOutlineRequest(req.body);
  if (!parsed.ok) return res.status(parsed.status).json(errorBody(parsed.code, parsed.message));
  try {
    const runtime = await resolveHubRuntime();
    return res.json(responseBody(await createOutlines(parsed.value, runtime), runtime));
  } catch (error) {
    return handleError(res, error);
  }
});

apiRouter.post("/compose", async (req, res) => {
  const parsed = parseComposeRequest(req.body);
  if (!parsed.ok) return res.status(parsed.status).json(errorBody(parsed.code, parsed.message));
  try {
    const runtime = await resolveHubRuntime();
    return res.json(responseBody(await composeEssay(parsed.value, runtime), runtime));
  } catch (error) {
    return handleError(res, error);
  }
});

app.use("/api", apiRouter);
if (basePath) app.use(`${basePath}/api`, apiRouter);

if (isProduction) {
  const distPath = resolve(projectRoot, "dist");
  const sendIndex = (_req: express.Request, res: express.Response) => res.sendFile(resolve(distPath, "index.html"));
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
  console.log(`八百字 AI running at http://127.0.0.1:${port}${basePath || ""}`);
});

type ParseError = { ok: false; status: number; code: string; message: string };

function parseAnalyzeRequest(body: unknown): { ok: true; value: AnalyzeRequest } | ParseError {
  const common = parseCommon(body);
  if (!common.ok) return common;
  if (looksLikeLiveExam(common.value.input.prompt)) {
    return {
      ok: false,
      status: 403,
      code: "LIVE_EXAM_BLOCKED",
      message: "当前描述像是正在进行的考试。这里可以帮你审题和列思路，但不直接生成可提交答案。"
    };
  }
  return { ok: true, value: common.value };
}

function parseOutlineRequest(body: unknown): { ok: true; value: OutlineRequest } | ParseError {
  const common = parseCommon(body);
  if (!common.ok) return common;
  const value = body as Partial<OutlineRequest>;
  if (!value.analysis || typeof value.analysis !== "object") return validation("缺少审题结果，请先完成审题。");
  return {
    ok: true,
    value: {
      ...common.value,
      analysis: value.analysis as AnalysisResult,
      materials: parseMaterials(value.materials)
    }
  };
}

function parseComposeRequest(body: unknown): { ok: true; value: ComposeRequest } | ParseError {
  const common = parseCommon(body);
  if (!common.ok) return common;
  const value = body as Partial<ComposeRequest>;
  if (!value.outline || typeof value.outline !== "object") return validation("请选择一套提纲后再生成初稿。");
  return {
    ok: true,
    value: {
      ...common.value,
      materials: parseMaterials(value.materials),
      outline: value.outline as EssayOutline
    }
  };
}

function parseCommon(body: unknown): { ok: true; value: AnalyzeRequest } | ParseError {
  if (!body || typeof body !== "object") return validation("请求内容不能为空。");
  const value = body as Partial<AnalyzeRequest>;
  if (!value.input || typeof value.input !== "object") return validation("缺少作文任务。");
  const input = value.input as Partial<EssayInput>;
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (prompt.length < 5) return validation("请把作文题目写完整，至少输入 5 个字。");
  if (prompt.length > 2000) return validation("作文题目过长，请控制在 2000 字以内。");
  if (!isGrade(input.grade)) return validation("请选择有效的年级。");
  if (!isGenre(input.genre)) return validation("请选择有效的文体。");
  const targetLength = Number(input.targetLength);
  if (!Number.isFinite(targetLength) || targetLength < 400 || targetLength > 1500) {
    return validation("目标字数需要在 400—1500 字之间。");
  }

  return {
    ok: true,
    value: {
      input: {
        prompt,
        grade: input.grade,
        genre: input.genre,
        targetLength: Math.round(targetLength),
        includePunctuation: input.includePunctuation !== false,
        scene: ["日常练习", "课堂作业", "考前训练"].includes(input.scene || "")
          ? input.scene as EssayInput["scene"]
          : "日常练习"
      }
    }
  };
}

function parseMaterials(value: unknown): MaterialAnswers {
  const materials = value && typeof value === "object" ? value as Partial<MaterialAnswers> : {};
  return {
    experience: safeText(materials.experience, 2000),
    detail: safeText(materials.detail, 1000),
    insight: safeText(materials.insight, 1000)
  };
}

function safeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function looksLikeLiveExam(prompt: string) {
  return /(正在|现在).{0,6}(考试|考场|监考)|帮我作弊|直接给我考试答案/u.test(prompt);
}

function validation(message: string): ParseError {
  return { ok: false, status: 422, code: "VALIDATION_ERROR", message };
}

function responseBody<T>(data: T, runtime: { provider: "openai"; model: string }) {
  return {
    data,
    meta: {
      provider: runtime.provider,
      model: runtime.model,
      mode: "model" as const,
      generatedAt: new Date().toISOString()
    }
  };
}

function errorBody(code: string, message: string, details?: unknown): ApiError {
  return { error: { code, message, details } };
}

function handleError(res: express.Response, error: unknown) {
  if (error instanceof ProviderError || error instanceof HubRuntimeError) {
    return res.status(error.status).json(errorBody(error.code, error.message, error.details));
  }
  console.error(error);
  return res.status(500).json(errorBody("INTERNAL_ERROR", "生成时发生未知错误，请稍后重试。"));
}

function normalizeBasePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}
