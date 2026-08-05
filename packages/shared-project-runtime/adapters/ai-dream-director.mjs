import express from "/home/admin/apps/ai-aesthetic-fingerprint/node_modules/express/index.js";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultModels, GenerateDreamRequestSchema, modelSuggestions, providerLabels } from "/home/admin/apps/ai-dream-director/dist-server/src/shared/contracts.js";
import { demoDirectorOutput, ProviderError } from "/home/admin/apps/ai-dream-director/dist-server/server/dreamDirector.js";
import { getProviderCatalog, HubModelError } from "/home/admin/apps/ai-dream-director/dist-server/server/hubModels.js";
import { generateWithModel } from "/home/admin/apps/ai-dream-director/dist-server/server/modelGateway.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = "/home/admin/apps/ai-dream-director";
const app = express();
const port = Number(process.env.PORT || 5178);
const isProduction = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
const basePath = normalizeBasePath(process.env.BASE_PATH || process.env.VITE_BASE_PATH || "");
const apiRouter = express.Router();
app.use(express.json({ limit: "1mb" }));
apiRouter.get("/health", (_req, res) => {
    res.json({
        ok: true,
        app: "ai-dream-director",
        defaults: defaultModels,
        providers: providerLabels,
        modelSuggestions
    });
});
apiRouter.get("/providers", async (_req, res) => {
    try {
        const providers = await getProviderCatalog();
        return res.json({
            providers,
            configured: providers.some((provider) => provider.enabled && provider.configured),
            hubUrl: "/hub/#models"
        });
    }
    catch (error) {
        return handleError(res, error);
    }
});
apiRouter.post("/generate", async (req, res) => {
    const parsed = GenerateDreamRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(422).json(errorBody("VALIDATION_ERROR", "输入信息不完整或格式不正确。", parsed.error.flatten()));
    }
    try {
        const isLocalPreview = parsed.data.provider === "demo";
        const data = isLocalPreview ? demoDirectorOutput(parsed.data) : await generateWithModel(parsed.data);
        return res.json({
            data,
            meta: {
                provider: parsed.data.provider,
                model: parsed.data.model,
                mode: isLocalPreview ? "local_preview" : "model",
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
    const vite = await createViteServer({
        root: projectRoot,
        server: { middlewareMode: true },
        appType: "spa"
    });
    app.use(vite.middlewares);
}
export default app;
function handleError(res, error) {
    if (error instanceof HubModelError) {
        return res.status(error.status).json(errorBody(error.code, error.message));
    }
    if (error instanceof ProviderError) {
        return res.status(error.status).json(errorBody(error.code, error.message, error.details));
    }
    console.error(error);
    return res.status(500).json(errorBody("INTERNAL_ERROR", "生成梦境导演案时发生未知错误。"));
}
function errorBody(code, message, details) {
    return {
        error: {
            code,
            message,
            details
        }
    };
}
function normalizeBasePath(value) {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "/")
        return "";
    return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}
