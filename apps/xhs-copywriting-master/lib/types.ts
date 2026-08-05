export type CopywritingType =
  | "种草"
  | "测评"
  | "探店"
  | "教程"
  | "清单"
  | "避坑"
  | "引流";

export type CopyLength = "短" | "中" | "长";

export interface CopywritingInput {
  topic: string;
  productName?: string;
  sellingPoints: string;
  targetAudience: string;
  scenario?: string;
  tone: string;
  type: CopywritingType;
  length: CopyLength;
  forbiddenWords?: string;
  extraRequirements?: string;
}

export interface CopywritingResult {
  id: string;
  createdAt: string;
  input: CopywritingInput;
  titles: string[];
  body: string;
  tags: string[];
  suggestions: string[];
}

export interface HistoryItem {
  id: string;
  title: string;
  createdAt: string;
  result: CopywritingResult;
}

export interface GenerateRequest {
  input: CopywritingInput;
  existing?: CopywritingResult;
  optimizeMode?: string;
}
