import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createServer as createViteServer } from "vite";
import { defaultModels, StoryRequestSchema, type ApiError } from "../src/shared/contracts.js";
import { generateWithProvider, getProviderCatalog } from "./providers.js";
import { ProviderError } from "./storyEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
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
  } catch (error) {
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
  } catch (error) {
    if (error instanceof ProviderError) {
      return res.status(error.status).json(errorBody(error.code, error.message, error.details));
    }

    console.error(error);
    return res.status(500).json(errorBody("INTERNAL_ERROR", "生成故事时发生未知错误"));
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
} else {
  const vite = await createViteServer({
    root: projectRoot,
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

app.listen(port, "127.0.0.1", () => {
  console.log(`AI Bedtime Story Factory running at http://127.0.0.1:${port}`);
});

function errorBody(code: string, message: string, details?: unknown): ApiError {
  return {
    error: {
      code,
      message,
      details
    }
  };
}
