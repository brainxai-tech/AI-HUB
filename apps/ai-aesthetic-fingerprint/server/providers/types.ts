import type { AnalyzeRequest, AnalyzeResponse, ModelProvider } from "../../src/shared/schema.js";

export interface ModelAdapter {
  provider: ModelProvider;
  model: string;
  analyze(input: AnalyzeRequest): Promise<AnalyzeResponse>;
}

export class ProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 502,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
