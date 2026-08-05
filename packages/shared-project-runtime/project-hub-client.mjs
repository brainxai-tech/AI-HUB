const DEFAULT_CONFIG_URL = "http://127.0.0.1:4194/hub/api/model-config";
const DEFAULT_CHAT_URL = "http://127.0.0.1:4194/hub/api/v1/chat/completions";
const DEFAULT_SHARP_MODULE = "/home/admin/apps/ai-data-analyst/node_modules/sharp/lib/index.js";

export class HubProjectError extends Error {
  constructor(code, message, status = 500, details) {
    super(message);
    this.name = "HubProjectError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function configuredHubProviders(config = {}) {
  return (Array.isArray(config.providers) ? config.providers : [])
    .filter((provider) => provider?.enabled === true && provider?.configured === true)
    .map((provider) => ({
      id: String(provider.id || ""),
      label: String(provider.label || provider.id || "Model"),
      model: String(provider.model || ""),
      models: enabledModels(provider),
      enabled: true,
      configured: true,
    }))
    .filter((provider) => provider.id && provider.model);
}

export function selectHubProvider(config = {}, requestedProvider = "") {
  const providers = configuredHubProviders(config);
  const selected =
    providers.find((provider) => provider.id === requestedProvider) ||
    providers.find((provider) => provider.id === config.defaultProvider) ||
    providers[0];
  if (!selected) {
    throw new HubProjectError("HUB_PROVIDER_NOT_CONFIGURED", "AI Hub 尚未配置可用模型。", 503);
  }
  return {
    id: selected.id,
    label: selected.label,
    model: selected.model,
    models: selected.models,
  };
}

export async function fetchHubModelConfig({
  fetchImpl = globalThis.fetch,
  configUrl = process.env.HUB_MODEL_CONFIG_URL || DEFAULT_CONFIG_URL,
} = {}) {
  const response = await fetchImpl(configUrl, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new HubProjectError(
      "HUB_CONFIG_UNAVAILABLE",
      "无法读取 AI Hub 模型配置。",
      response.status || 503,
      payload,
    );
  }
  return payload;
}

export async function callHubChat({
  provider,
  messages,
  maxTokens = 2400,
  temperature = 0.5,
  responseFormat = "json",
  fetchImpl = globalThis.fetch,
  chatUrl = process.env.HUB_CHAT_COMPLETIONS_URL || DEFAULT_CHAT_URL,
}) {
  const body = {
    provider: provider.id,
    model: provider.model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (responseFormat === "json") body.response_format = { type: "json_object" };

  const response = await fetchImpl(chatUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const upstreamMessage =
      payload?.error?.message || payload?.error?.details || payload?.error || payload?.message;
    throw new HubProjectError(
      "HUB_MODEL_ERROR",
      typeof upstreamMessage === "string" ? upstreamMessage.slice(0, 300) : "AI Hub 模型调用失败。",
      response.status || 502,
      payload,
    );
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new HubProjectError("HUB_MODEL_EMPTY", "AI Hub 模型没有返回可用内容。", 502);
  }
  return content;
}

export async function analyzeImageInputs(images, { sharpImpl } = {}) {
  const sharp = sharpImpl || await loadSharp();
  return Promise.all(images.map(async (image) => {
    const buffer = decodeImageData(image.data || image.dataUrl, image.name);
    try {
      const [metadata, stats] = await Promise.all([
        sharp(buffer, { failOn: "error" }).metadata(),
        sharp(buffer, { failOn: "error" }).stats(),
      ]);
      const red = channel(stats, 0);
      const green = channel(stats, 1);
      const blue = channel(stats, 2);
      const width = Number(metadata.width) || 0;
      const height = Number(metadata.height) || 0;
      return {
        name: String(image.name || "image"),
        format: String(metadata.format || image.mimeType || "unknown"),
        width,
        height,
        orientation: width === height ? "square" : width > height ? "landscape" : "portrait",
        dominantColor: rgbToHex(stats?.dominant?.r, stats?.dominant?.g, stats?.dominant?.b),
        averageColor: rgbToHex(red.mean, green.mean, blue.mean),
        brightness: Math.round(0.2126 * red.mean + 0.7152 * green.mean + 0.0722 * blue.mean),
        contrast: Math.round(0.2126 * red.stdev + 0.7152 * green.stdev + 0.0722 * blue.stdev),
        fileSize: Number(image.size) || buffer.length,
      };
    } catch (error) {
      throw new HubProjectError(
        "IMAGE_ANALYSIS_FAILED",
        `无法读取图片 ${String(image.name || "image")} 的像素信息。`,
        422,
        error instanceof Error ? error.message : String(error),
      );
    }
  }));
}

export function formatImageEvidence(analyses) {
  return analyses.map((image) => [
    `${image.name}: ${image.width}x${image.height} ${image.orientation}`,
    `dominant ${image.dominantColor}`,
    `average ${image.averageColor}`,
    `brightness ${image.brightness}/255`,
    `contrast ${image.contrast}`,
  ].join(", ")).join("\n");
}

function enabledModels(provider) {
  const models = Array.isArray(provider.enabledModels) && provider.enabledModels.length
    ? provider.enabledModels
    : Array.isArray(provider.models) && provider.models.length
      ? provider.models
      : [provider.model];
  return Array.from(new Set(models.map(String).filter(Boolean)));
}

async function loadSharp() {
  const modulePath = process.env.AIHUB_SHARP_MODULE || DEFAULT_SHARP_MODULE;
  try {
    const module = await import(modulePath);
    return module.default || module;
  } catch (error) {
    throw new HubProjectError(
      "IMAGE_ANALYZER_UNAVAILABLE",
      "本地图像分析组件不可用。",
      503,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function decodeImageData(value, name) {
  const text = String(value || "");
  const marker = ";base64,";
  const markerIndex = text.indexOf(marker);
  const encoded = markerIndex >= 0 ? text.slice(markerIndex + marker.length) : text;
  if (!encoded || !/^[A-Za-z0-9+/=\s]+$/.test(encoded)) {
    throw new HubProjectError("INVALID_IMAGE_DATA", `图片 ${String(name || "image")} 不是有效的 base64 数据。`, 422);
  }
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) {
    throw new HubProjectError("INVALID_IMAGE_DATA", `图片 ${String(name || "image")} 内容为空。`, 422);
  }
  return buffer;
}

function channel(stats, index) {
  return {
    mean: Number(stats?.channels?.[index]?.mean) || 0,
    stdev: Number(stats?.channels?.[index]?.stdev) || 0,
  };
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue].map((value) => Math.max(0, Math.min(255, Math.round(Number(value) || 0)))
    .toString(16).padStart(2, "0")).join("")}`;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HubProjectError("UPSTREAM_NON_JSON", "上游服务返回了无法解析的响应。", 502, text.slice(0, 500));
  }
}
