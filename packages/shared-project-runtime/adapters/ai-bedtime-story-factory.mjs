import express from "/home/admin/apps/ai-aesthetic-fingerprint/node_modules/express/index.js";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defaultModels, StoryRequestSchema } from "/home/admin/apps/ai-bedtime-story-factory/dist-server/src/shared/contracts.js";
import { generateWithProvider, getProviderCatalog } from "/home/admin/apps/ai-bedtime-story-factory/dist-server/server/providers.js";
import { ProviderError } from "/home/admin/apps/ai-bedtime-story-factory/dist-server/server/storyEngine.js";
import { buildStoryVisualFallback } from "../remaining-projects.mjs";
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = "/home/admin/apps/ai-bedtime-story-factory";
const app = express();
const port = Number(process.env.PORT || 5177);
const isProduction = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
app.use(express.json({ limit: "1mb" }));
app.get("/api/health", (_req, res) => {
    res.json({
        ok: true,
        defaults: defaultModels
    });
});
app.get("/api/providers", async (_req, res) => {
    try {
        const providers = await getProviderCatalog();
        res.json({
            providers,
            configured: providers.some((provider) => provider.enabled && provider.configured),
            hubUrl: "/hub/#models"
        });
    }
    catch (error) {
        if (error instanceof ProviderError) {
            return res.status(error.status).json(errorBody(error.code, error.message, error.details));
        }
        return res.status(500).json(errorBody("HUB_CONFIG_ERROR", "读取 Hub 模型配置失败。"));
    }
});
app.post("/api/generate", async (req, res) => {
    const parsed = StoryRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(422).json(errorBody("VALIDATION_ERROR", "输入信息不完整或格式不正确", parsed.error.flatten()));
    }
    try {
        const data = await generateWithProvider(parsed.data);
        return res.json({
            data,
            meta: {
                provider: parsed.data.provider,
                model: parsed.data.model,
                generatedAt: new Date().toISOString()
            }
        });
    }
    catch (error) {
        if (error instanceof ProviderError && error.status < 500) {
            return res.status(error.status).json(errorBody(error.code, error.message, error.details));
        }
        console.warn("Story model output was unavailable; using visual fallback.");
        return res.json({
            data: buildStoryVisualFallback(parsed.data),
            meta: {
                provider: parsed.data.provider,
                model: parsed.data.model,
                mode: "fallback",
                generatedAt: new Date().toISOString()
            },
            warning: "实时模型暂未返回完整结构，已切换为本地可视化故事。"
        });
    }
});
if (isProduction) {
    const distPath = resolve(projectRoot, "dist");
    if (!existsSync(distPath)) {
        console.warn("dist directory not found. Run npm run build before npm start.");
    }
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
        res.sendFile(resolve(distPath, "index.html"));
    });
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
function errorBody(code, message, details) {
    return {
        error: {
            code,
            message,
            details
        }
    };
}
