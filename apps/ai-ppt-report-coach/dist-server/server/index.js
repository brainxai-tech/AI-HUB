import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { exportRequestSchema, generateRequestSchema } from "../src/shared/contracts.js";
import { parseSourceFile, UnsupportedFileError } from "./fileParser.js";
import { buildPptxBuffer } from "./pptxExporter.js";
import { generateWithProvider, ProviderError } from "./providerGateway.js";
import { hubProviderPayload, HubRuntimeError, readHubModelSelection, resolveHubRuntime, writeHubModelSelection, } from "./hubRuntime.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = existsSync(resolve(__dirname, "..", "package.json"))
    ? resolve(__dirname, "..")
    : resolve(__dirname, "..", "..");
const app = express();
const port = Number(process.env.PORT || 4201);
const isProduction = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
const basePath = normalizeBasePath(process.env.BASE_PATH || process.env.VITE_BASE_PATH || "");
const api = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 12 * 1024 * 1024, files: 1 }
});
const rateLimitState = new Map();
app.disable("x-powered-by");
app.set("trust proxy", "loopback");
app.use(express.json({ limit: "3mb" }));
app.use(securityHeaders);
api.get("/health", async (_req, res) => {
    try {
        const hubRuntime = await resolveHubRuntime();
        res.json({
            ok: true,
            app: "ai-ppt-report-coach",
            modelSource: "hub",
            apiBaseUrl: "/hub/api",
            defaultModel: hubRuntime.model,
            configured: true,
            maxUploadMb: 12,
            supportedFiles: ["pdf", "docx", "pptx", "txt", "md", "csv"]
        });
    }
    catch (error) {
        return handleError(res, error, "读取 AI Hub 模型配置失败。");
    }
});
api.get("/providers", async (_req, res) => {
    try {
        return res.json(hubProviderPayload(await resolveHubRuntime()));
    }
    catch (error) {
        if (error instanceof HubRuntimeError) {
            return res.json({ ...hubProviderPayload(null), message: error.message });
        }
        return handleError(res, error, "读取 AI Hub 模型配置失败。");
    }
});
api.get("/model-selection", async (_req, res) => {
    try {
        return res.json(await readHubModelSelection());
    }
    catch (error) {
        return handleError(res, error, "读取项目模型选择失败。");
    }
});
api.put("/model-selection", async (req, res) => {
    try {
        return res.json(await writeHubModelSelection(req.body?.model));
    }
    catch (error) {
        return handleError(res, error, "保存项目模型选择失败。");
    }
});
api.post("/parse-file", upload.single("file"), async (req, res) => {
    if (!req.file)
        return res.status(400).json(errorBody("MISSING_FILE", "请选择要上传的资料文件。"));
    try {
        return res.json(await parseSourceFile(req.file));
    }
    catch (error) {
        if (error instanceof UnsupportedFileError) {
            return res.status(422).json(errorBody("UNSUPPORTED_FILE", error.message));
        }
        return handleError(res, error, "解析资料时发生错误，请换一个文件重试。");
    }
});
api.post("/generate", generationRateLimit, async (req, res) => {
    const parsed = generateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(422).json(errorBody("VALIDATION_ERROR", "输入信息不完整或格式不正确。", parsed.error.flatten()));
    }
    try {
        const request = parsed.data;
        const hubRuntime = await resolveHubRuntime();
        const data = await generateWithProvider(request, { hubRuntime });
        return res.json({
            data,
            meta: {
                mode: "model",
                model: hubRuntime.model,
                generatedAt: new Date().toISOString()
            }
        });
    }
    catch (error) {
        return handleError(res, error, "生成汇报方案时发生错误，请稍后重试。");
    }
});
api.post("/export-pptx", async (req, res) => {
    const parsed = exportRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(422).json(errorBody("VALIDATION_ERROR", "PPTX 内容格式不完整。", parsed.error.flatten()));
    }
    try {
        const buffer = await buildPptxBuffer(parsed.data.report, parsed.data.theme);
        const filename = safeFilename(parsed.data.report.title || "AI-PPT汇报方案");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.pptx`);
        return res.send(buffer);
    }
    catch (error) {
        return handleError(res, error, "导出 PPTX 时发生错误，请稍后重试。");
    }
});
app.use("/api", api);
if (basePath)
    app.use(`${basePath}/api`, api);
if (isProduction) {
    const distPath = resolve(projectRoot, "dist");
    const sendIndex = (_req, res) => res.sendFile(resolve(distPath, "index.html"));
    if (basePath) {
        app.use(basePath, express.static(distPath));
        app.get(basePath, sendIndex);
        app.get(`${basePath}/*`, sendIndex);
    }
    app.use(express.static(distPath));
    app.get("*", sendIndex);
}
else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ root: projectRoot, server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
}
app.listen(port, "127.0.0.1", () => {
    console.log(`AI PPT Report Coach running at http://127.0.0.1:${port}${basePath || ""}`);
});
function generationRateLimit(req, res, next) {
    const key = req.ip || "local";
    const now = Date.now();
    const current = rateLimitState.get(key);
    if (!current || current.resetAt < now) {
        rateLimitState.set(key, { count: 1, resetAt: now + 15 * 60_000 });
        return next();
    }
    if (current.count >= 30)
        return res.status(429).json(errorBody("RATE_LIMITED", "请求过于频繁，请稍后再试。"));
    current.count += 1;
    return next();
}
function securityHeaders(_req, res, next) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (isProduction) {
        res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
    }
    return next();
}
function handleError(res, error, fallback) {
    if (error instanceof ProviderError) {
        return res.status(error.status).json(errorBody(error.code, error.message, error.details));
    }
    if (error instanceof HubRuntimeError) {
        return res.status(error.status).json(errorBody(error.code, error.message));
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json(errorBody("FILE_TOO_LARGE", "文件不能超过 12MB。"));
    }
    console.error(error instanceof Error ? error.message : error);
    return res.status(500).json(errorBody("INTERNAL_ERROR", fallback));
}
function errorBody(code, message, details) {
    return { error: { code, message, details } };
}
function normalizeBasePath(value) {
    const clean = value.trim();
    if (!clean || clean === "/")
        return "";
    return `/${clean.replace(/^\/+|\/+$/g, "")}`;
}
function safeFilename(value) {
    return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").slice(0, 70).trim() || "AI-PPT汇报方案";
}
