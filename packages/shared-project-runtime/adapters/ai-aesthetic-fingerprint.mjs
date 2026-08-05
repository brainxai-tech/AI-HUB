import express from "/home/admin/apps/ai-aesthetic-fingerprint/node_modules/express/index.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { analyzeRequestSchema } from "/home/admin/apps/ai-aesthetic-fingerprint/dist-server/src/shared/schema.js";
import { providerStatus, runAnalysis } from "/home/admin/apps/ai-aesthetic-fingerprint/dist-server/server/providers/index.js";
import { ProviderError } from "/home/admin/apps/ai-aesthetic-fingerprint/dist-server/server/providers/types.js";
import { parseReportFromText } from "/home/admin/apps/ai-aesthetic-fingerprint/dist-server/server/providers/utils.js";
import {
  analyzeImageInputs,
  callHubChat,
  fetchHubModelConfig,
  formatImageEvidence,
  HubProjectError,
  selectHubProvider,
} from "../project-hub-client.mjs";

const projectRoot = "/home/admin/apps/ai-aesthetic-fingerprint";
const app = express();
const isProduction = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
const basePath = normalizeBasePath(process.env.BASE_PATH || process.env.VITE_BASE_PATH || "");
const apiRouter = express.Router();

app.disable("x-powered-by");
app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.use(express.json({ limit: "70mb" }));

apiRouter.get("/health", async (_request, response) => {
  try {
    const selected = selectHubProvider(await fetchHubModelConfig());
    response.json({
      ok: true,
      app: "ai-aesthetic-fingerprint",
      providers: hybridProviderPayload(selected),
      pipeline: "local-pixels+hub-model",
    });
  } catch (error) {
    return handleError(response, error);
  }
});

apiRouter.get("/providers", async (_request, response) => {
  try {
    const selected = selectHubProvider(await fetchHubModelConfig());
    response.json({
      providers: hybridProviderPayload(selected),
      configured: true,
      defaultProvider: selected.id,
      hubUrl: "/hub/#models",
      note: "图片先在服务器本地提取色彩、亮度、对比度和构图指标，再由 AI Hub 生成可视化审美报告。",
    });
  } catch (error) {
    if (error instanceof HubProjectError && error.code === "HUB_PROVIDER_NOT_CONFIGURED") {
      return response.json({
        providers: providerStatus().filter((provider) => provider.provider === "demo"),
        configured: false,
        defaultProvider: "demo",
        hubUrl: "/hub/#models",
        note: "AI Hub 模型尚未配置，当前仍可使用本地像素分析生成演示报告。",
      });
    }
    return handleError(response, error);
  }
});

apiRouter.post("/analyze", async (request, response) => {
  const parsed = analyzeRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(422).json(errorBody(
      "VALIDATION_ERROR",
      "上传图片或目标描述不符合要求。",
      parsed.error.flatten(),
    ));
  }

  try {
    const input = parsed.data;
    if (input.provider === "demo") return response.json(await runAnalysis(input));

    const [config, baseResponse, imageAnalysis] = await Promise.all([
      fetchHubModelConfig(),
      runAnalysis({ ...input, provider: "demo" }),
      analyzeImageInputs(input.images),
    ]);
    const selected = selectHubProvider(config, input.provider);
    let report;
    let model = `${selected.model} + local-image-metrics`;

    try {
      const content = await callHubChat({
        provider: selected,
        messages: [
          {
            role: "system",
            content: "You convert measured image statistics into an aesthetic fingerprint report. Return one valid JSON object only. Never claim to recognize people, objects, brands, or scenes that are not present in the supplied measurements. Keep every required field and every uploaded image name.",
          },
          {
            role: "user",
            content: [
              `Project goal: ${input.projectGoal || "Generate the next visual direction."}`,
              "Measured evidence from the actual uploaded pixels:",
              formatImageEvidence(imageAnalysis),
              "Return the exact JSON shape shown by this template, replacing its generic demo content with evidence-grounded guidance:",
              JSON.stringify(baseResponse.report),
            ].join("\n\n"),
          },
        ],
        maxTokens: 3400,
        temperature: 0.45,
        responseFormat: "json",
      });
      report = parseReportFromText(content);
    } catch (error) {
      if (!(error instanceof HubProjectError) && !(error instanceof ProviderError)) throw error;
      report = buildMeasuredFallback(baseResponse.report, imageAnalysis, input.projectGoal, error.message);
      model = "local-image-metrics-fallback";
    }

    return response.json({
      provider: selected.id,
      model,
      generatedAt: new Date().toISOString(),
      report,
    });
  } catch (error) {
    return handleError(response, error);
  }
});

app.use("/api", apiRouter);
if (basePath) app.use(`${basePath}/api`, apiRouter);

if (isProduction) {
  const distPath = resolve(projectRoot, "dist");
  if (!existsSync(distPath)) console.warn("dist directory not found. Run npm run build before npm start.");
  const sendIndex = (_request, response) => response.sendFile(resolve(distPath, "index.html"));
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

export default app;

function hybridProviderPayload(selected) {
  return [{
    provider: selected.id,
    label: "AI Hub 混合视觉",
    configured: true,
    model: `${selected.model} + local-image-metrics`,
    pipeline: "local-pixels+hub-model",
  }, ...providerStatus().filter((provider) => provider.provider === "demo")];
}

function buildMeasuredFallback(template, analyses, projectGoal, modelError) {
  const averageBrightness = Math.round(analyses.reduce((sum, item) => sum + item.brightness, 0) / analyses.length);
  const averageContrast = Math.round(analyses.reduce((sum, item) => sum + item.contrast, 0) / analyses.length);
  const palette = uniqueColors([
    ...analyses.flatMap((item) => [item.dominantColor, item.averageColor]),
    averageBrightness >= 128 ? "#111827" : "#f8fafc",
    "#d7b56d",
  ]).slice(0, 8);
  return {
    ...template,
    summary: `基于 ${analyses.length} 张上传图片的真实像素统计，视觉方向偏向${averageBrightness >= 150 ? "明亮轻盈" : averageBrightness <= 90 ? "深色沉稳" : "中性克制"}，整体对比度为${averageContrast >= 45 ? "鲜明" : averageContrast <= 20 ? "柔和" : "适中"}。`,
    dnaName: averageBrightness >= 150 ? "Light Metric Editorial" : "Measured Contrast System",
    color: {
      palette,
      temperature: temperatureFromAnalyses(analyses),
      contrast: `像素对比度均值 ${averageContrast}，建议在界面中保持相近的明暗节奏。`,
      guidance: `以 ${palette.slice(0, 2).join(" 与 ")} 为主色依据，使用 ${palette[2]} 建立文字和背景的可读性。`,
    },
    layout: {
      ...template.layout,
      composition: `参考图以 ${orientationLabel(dominantOrientation(analyses))}构图为主，下一版可沿用相同的内容展开方向。`,
      density: averageContrast >= 45 ? "中等密度，使用清楚的块面分隔。" : "中低密度，通过留白保持柔和层次。",
    },
    imageNotes: analyses.map((image) => ({
      imageName: image.name,
      observations: [
        `实际尺寸 ${image.width} × ${image.height}，${orientationLabel(image.orientation)}构图。`,
        `主色 ${image.dominantColor}，平均色 ${image.averageColor}。`,
        `亮度 ${image.brightness}/255，对比度指标 ${image.contrast}。`,
      ],
    })),
    caveats: [
      "报告读取了真实图片像素的色彩、亮度、对比度、尺寸和方向，不进行人物身份或具体物体识别。",
      projectGoal ? `本次建议围绕目标：${projectGoal}` : "未提供具体项目目标，建议结合实际品牌和使用场景复核。",
      modelError ? "AI Hub 文案增强暂时不可用，本次使用本地像素分析生成可操作报告。" : "结果用于设计方向探索，最终决策仍需结合业务与可用性测试。",
    ].slice(0, 6),
  };
}

function uniqueColors(colors) {
  const result = Array.from(new Set(colors.filter(Boolean)));
  for (const fallback of ["#111827", "#f8fafc", "#d7b56d", "#6b7280"]) {
    if (!result.includes(fallback)) result.push(fallback);
    if (result.length >= 3) break;
  }
  return result;
}

function temperatureFromAnalyses(analyses) {
  const warmth = analyses.reduce((sum, item) => (
    sum + parseInt(item.averageColor.slice(1, 3), 16) - parseInt(item.averageColor.slice(5, 7), 16)
  ), 0);
  return warmth > 24 ? "整体偏暖。" : warmth < -24 ? "整体偏冷。" : "整体中性。";
}

function dominantOrientation(analyses) {
  const counts = analyses.reduce((map, item) => ({
    ...map,
    [item.orientation]: (map[item.orientation] || 0) + 1,
  }), {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "mixed";
}

function orientationLabel(value) {
  return { landscape: "横向", portrait: "纵向", square: "方形", mixed: "混合" }[value] || "混合";
}

function handleError(response, error) {
  if (error instanceof HubProjectError) {
    return response.status(error.status).json(errorBody(error.code, error.message, error.details));
  }
  if (error instanceof ProviderError) {
    return response.status(error.status).json(errorBody(error.code, error.message, error.details));
  }
  console.error(error);
  return response.status(500).json(errorBody("INTERNAL_ERROR", "服务端处理失败，请稍后重试。"));
}

function errorBody(code, message, details) {
  return { error: { code, message, details } };
}

function normalizeBasePath(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}
