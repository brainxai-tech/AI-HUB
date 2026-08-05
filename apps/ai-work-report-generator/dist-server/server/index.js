import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateRequestSchema } from "../src/shared/contracts.js";
import { generateWithProvider, ProviderError } from "./providerGateway.js";
import { hubProviderPayload, HubRuntimeError, readHubModelSelection, resolveHubRuntime, writeHubModelSelection, } from "./hubRuntime.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = existsSync(resolve(__dirname, "..", "package.json"))
    ? resolve(__dirname, "..")
    : resolve(__dirname, "..", "..");
const app = express();
const port = Number(process.env.PORT || 4202);
const isProduction = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
const basePath = normalizeBasePath(process.env.BASE_PATH || process.env.VITE_BASE_PATH || "");
const api = express.Router();
const rateLimitState = new Map();
app.disable("x-powered-by");
app.set("trust proxy", "loopback");
app.use(express.json({ limit: "1mb" }));
app.use(securityHeaders);
api.get("/health", async (_req, res) => {
    try {
        const hubRuntime = await resolveHubRuntime();
        res.json({
            ok: true,
            app: "ai-work-report-generator",
            modelSource: "hub",
            gateway: "/hub/api",
            defaultModel: hubRuntime.model,
            configured: true
        });
    }
    catch (error) {
        return handleError(res, error);
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
        return handleError(res, error);
    }
});
api.get("/model-selection", async (_req, res) => {
    try {
        return res.json(await readHubModelSelection());
    }
    catch (error) {
        return handleError(res, error);
    }
});
api.put("/model-selection", async (req, res) => {
    try {
        return res.json(await writeHubModelSelection(req.body?.model));
    }
    catch (error) {
        return handleError(res, error);
    }
});
api.post("/generate", generationRateLimit, async (req, res) => {
    const parsed = generateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(422).json(errorBody("VALIDATION_ERROR", "输入信息不完整或格式不正确。", parsed.error.flatten()));
    }
    try {
        const hubRuntime = await resolveHubRuntime();
        const data = await generateWithProvider(parsed.data, { hubRuntime });
        return res.json({
            data,
            meta: {
                model: hubRuntime.model,
                generatedAt: new Date().toISOString()
            }
        });
    }
    catch (error) {
        return handleError(res, error);
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
    console.log(`AI Work Report Generator running at http://127.0.0.1:${port}${basePath || ""}`);
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
function handleError(res, error) {
    if (error instanceof ProviderError) {
        return res.status(error.status).json(errorBody(error.code, error.message, error.details));
    }
    if (error instanceof HubRuntimeError) {
        return res.status(error.status).json(errorBody(error.code, error.message));
    }
    console.error(error instanceof Error ? error.message : error);
    return res.status(500).json(errorBody("INTERNAL_ERROR", "生成汇报时发生未知错误，请稍后重试。"));
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
