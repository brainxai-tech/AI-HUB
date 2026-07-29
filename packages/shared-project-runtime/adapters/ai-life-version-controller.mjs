import express from "/home/admin/apps/ai-aesthetic-fingerprint/node_modules/express/index.js";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultModels, isProvider, modelSuggestions, providerLabels } from "/home/admin/apps/ai-life-version-controller/dist-server/src/shared/contracts.js";
import { generateLifePlan, ProviderError } from "/home/admin/apps/ai-life-version-controller/dist-server/server/providerGateway.js";
import { fetchHubModelConfig, HubProjectError, selectHubProvider } from "../project-hub-client.mjs";
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = "/home/admin/apps/ai-life-version-controller";
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
        const config = await fetchHubModelConfig();
        const selected = selectHubProvider(config);
        res.json({
            providers: [{
                id: selected.id,
                provider: selected.id,
                label: selected.label,
                model: selected.model,
                models: selected.models,
                enabled: true,
                configured: true
            }],
            configured: true,
            defaultProvider: selected.id,
            hubUrl: "/hub/#models"
        });
    }
    catch (error) {
        return handleError(res, error);
    }
});
apiRouter.post("/generate", async (req, res) => {
    const parsed = parseGenerateRequest(req.body);
    if (!parsed.ok) {
        return res.status(422).json(errorBody("VALIDATION_ERROR", parsed.message));
    }
    try {
        let effectiveRequest = parsed.value;
        if (parsed.value.provider !== "demo") {
            const config = await fetchHubModelConfig();
            const selected = selectHubProvider(config, parsed.value.provider);
            const chatUrl = process.env.HUB_CHAT_COMPLETIONS_URL || "http://127.0.0.1:4194/hub/api/v1/chat/completions";
            effectiveRequest = {
                ...parsed.value,
                provider: selected.id,
                model: selected.model,
                apiKey: "hub-scoped",
                baseUrl: chatUrl.replace(/\/chat\/completions\/?$/, "")
            };
        }
        const data = await generateLifePlan(effectiveRequest);
        return res.json({
            data,
            meta: {
                provider: effectiveRequest.provider,
                model: effectiveRequest.model,
                mode: effectiveRequest.provider === "demo" ? "demo" : "model",
                generatedAt: new Date().toISOString()
            }
        });
    }
    catch (error) {
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
    const sendIndex = (_req, res) => {
        res.sendFile(resolve(distPath, "index.html"));
    };
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
    const vite = await createViteServer({
        root: projectRoot,
        server: { middlewareMode: true },
        appType: "spa"
    });
    app.use(vite.middlewares);
}
export default app;
function parseGenerateRequest(body) {
    if (!body || typeof body !== "object")
        return { ok: false, message: "请求体不能为空。" };
    const value = body;
    if (!isProvider(value.provider))
        return { ok: false, message: "请选择有效的模型供应商。" };
    if (!value.input || typeof value.input !== "object")
        return { ok: false, message: "请输入人生仓库上下文。" };
    const input = value.input;
    if (!input.decision?.trim())
        return { ok: false, message: "请写下这次要管理的人生选择。" };
    return {
        ok: true,
        value: {
            provider: value.provider,
            model: value.model?.trim() || defaultModels[value.provider],
            apiKey: value.apiKey?.trim(),
            baseUrl: value.baseUrl?.trim(),
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
function text(value, fallback) {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function errorBody(code, message, details) {
    return {
        error: { code, message, details }
    };
}
function handleError(res, error) {
    if (error instanceof HubProjectError) {
        return res.status(error.status).json(errorBody(error.code, error.message, error.details));
    }
    if (error instanceof ProviderError) {
        return res.status(error.status).json(errorBody(error.code, error.message, error.details));
    }
    console.error(error);
    return res.status(500).json(errorBody("INTERNAL_ERROR", "生成人生版本库时发生未知错误。"));
}
function normalizeBasePath(value) {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "/")
        return "";
    return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}
