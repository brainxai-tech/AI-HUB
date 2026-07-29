import { aestheticReportSchema, type AestheticReport, type AnalyzeRequest, type ImageInput } from "../../src/shared/schema.js";
import { ProviderError } from "./types.js";

export function imageDataUrlToBase64(image: ImageInput) {
  const marker = ";base64,";
  const index = image.data.indexOf(marker);
  if (index === -1) {
    throw new ProviderError("INVALID_IMAGE_DATA", `图片 ${image.name} 不是有效的 base64 data URL。`, 422);
  }
  return image.data.slice(index + marker.length);
}

export function imageToDataUrl(image: ImageInput) {
  if (image.data.startsWith("data:")) return image.data;
  return `data:${image.mimeType};base64,${image.data}`;
}

export function parseReportFromText(text: string): AestheticReport {
  const trimmed = stripJsonFence(text).trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new ProviderError("MODEL_JSON_MISSING", "模型没有返回可解析的 JSON。", 502);
  }

  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    const result = aestheticReportSchema.safeParse(parsed);
    if (!result.success) {
      throw new ProviderError("MODEL_SCHEMA_MISMATCH", "模型返回的报告结构不符合约定。", 502, result.error.flatten());
    }
    return result.data;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("MODEL_JSON_INVALID", "模型返回的 JSON 格式无效。", 502);
  }
}

export function buildResponse(input: {
  provider: AnalyzeRequest["provider"];
  model: string;
  text: string;
}) {
  return {
    provider: input.provider ?? "demo",
    model: input.model,
    report: parseReportFromText(input.text),
    generatedAt: new Date().toISOString()
  };
}

export function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timeout)
  };
}

function stripJsonFence(value: string) {
  return value.replace(/^```(?:json)?/i, "").replace(/```$/i, "");
}
