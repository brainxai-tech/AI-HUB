import express from "/home/admin/apps/ai-aesthetic-fingerprint/node_modules/express/index.js";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultModels, GenerateRealityRequestSchema, modelSuggestions, providerCapabilities, providerLabels, worldLabels } from "/home/admin/apps/ai-reality-filter-translator/dist-server/src/shared/contracts.js";
import { buildRealityPrompt, extractJson, generateLocalRealityFilter, normalizeRealityOutput, ProviderError } from "/home/admin/apps/ai-reality-filter-translator/dist-server/server/realityTranslator.js";
import { analyzeImageInputs, callHubChat, fetchHubModelConfig, formatImageEvidence, HubProjectError, selectHubProvider } from "../project-hub-client.mjs";
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = "/home/admin/apps/ai-reality-filter-translator";
const app = express();
const port = Number(process.env.PORT || 5186);
const isProduction = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
const basePath = normalizeBasePath(process.env.BASE_PATH || process.env.VITE_BASE_PATH || "");
const apiRouter = express.Router();
app.use(express.json({ limit: "12mb" }));
apiRouter.get("/health", (_req, res) => {
    res.json({
        ok: true,
        app: "ai-reality-filter-translator",
        providers: providerLabels,
        capabilities: {
            ...providerCapabilities,
            deepseek: { acceptsImage: true, needsKey: false, pipeline: "local-pixels+hub-model" }
        },
        worlds: worldLabels,
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
                configured: true,
                acceptsImage: true,
                pipeline: "local-pixels+hub-model"
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
    const parsed = GenerateRealityRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(422).json(errorBody("VALIDATION_ERROR", "输入不完整或格式不正确。", parsed.error.flatten()));
    }
    try {
        const request = parsed.data;
        const isLocalPreview = request.provider === "demo";
        let effectiveRequest = request;
        let data;
        let pipeline = "local-preview";
        if (isLocalPreview) {
            data = generateLocalRealityFilter(request);
        }
        else {
            const config = await fetchHubModelConfig();
            const selected = selectHubProvider(config, request.provider);
            const imageAnalysis = await analyzeImageInputs([{
                ...request.photo,
                data: request.photo.dataUrl
            }]);
            const pixelEvidence = formatImageEvidence(imageAnalysis);
            effectiveRequest = {
                ...request,
                provider: selected.id,
                model: selected.model,
                photoNote: [request.photoNote, `Local pixel evidence:\n${pixelEvidence}`].filter(Boolean).join("\n")
            };
            const prompt = buildRealityPrompt(effectiveRequest);
            const text = await callHubChat({
                provider: selected,
                messages: [
                    { role: "system", content: prompt.system },
                    { role: "user", content: `${prompt.user}\n\nThe local pixel evidence above comes from the uploaded image and must be reflected in sourcePhotoFacts.` }
                ],
                maxTokens: 2400,
                temperature: 0.62,
                responseFormat: "json"
            });
            data = normalizeRealityOutput(extractJson(text), effectiveRequest);
            pipeline = "local-pixels+hub-model";
        }
        return res.json({
            data,
            meta: {
                provider: effectiveRequest.provider,
                model: effectiveRequest.model,
                mode: isLocalPreview ? "local_preview" : "model",
                acceptsImage: true,
                pipeline,
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
function handleError(res, error) {
    if (error instanceof HubProjectError) {
        return res.status(error.status).json(errorBody(error.code, error.message, error.details));
    }
    if (error instanceof ProviderError) {
        return res.status(error.status).json(errorBody(error.code, error.message, error.details));
    }
    console.error(error);
    return res.status(500).json(errorBody("INTERNAL_ERROR", "生成现实滤镜时发生未知错误。"));
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
