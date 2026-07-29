import type { AnalyzeRequest, ModelProvider } from "../../src/shared/schema.js";
import { DemoAdapter } from "./demo.js";
import type { ModelAdapter } from "./types.js";
import { ProviderError } from "./types.js";

export function getConfiguredProvider(requested?: ModelProvider): ModelAdapter {
  if (!requested || requested === "demo") return new DemoAdapter();
  throw new ProviderError(
    "HUB_RUNTIME_REQUIRED",
    "实时审美报告由 AI Hub 统一运行时提供，请从 Hub 首页打开本项目。",
    503
  );
}

export function providerStatus() {
  return [
    {
      provider: "openai",
      label: "GPT · AI Routing",
      configured: false,
      model: "Hub 项目模型"
    },
    {
      provider: "demo",
      label: "本地像素分析",
      configured: true,
      model: "local-image-metrics"
    }
  ];
}

export async function runAnalysis(input: AnalyzeRequest) {
  const adapter = getConfiguredProvider(input.provider);
  return adapter.analyze(input);
}
