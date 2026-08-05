import { NextResponse } from "next/server";

import { dimensions, personalityTypes, type DimensionVector } from "@/data/personality-test";
import { generateDeepSeekResult, type DeepSeekResultPayload } from "@/lib/deepseek-result";

export const runtime = "nodejs";

type DeepSeekResultRequest = {
  modeLabel?: unknown;
  answeredCount?: unknown;
  personalityId?: unknown;
  scores?: unknown;
};

export async function POST(request: Request) {
  let body: DeepSeekResultRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是有效 JSON。" }, { status: 400 });
  }

  const modeLabel = typeof body.modeLabel === "string" ? body.modeLabel : "";
  const answeredCount = typeof body.answeredCount === "number" ? body.answeredCount : 0;
  const personality = typeof body.personalityId === "string"
    ? personalityTypes.find((type) => type.id === body.personalityId)
    : undefined;

  if (!modeLabel || answeredCount <= 0 || !personality || !isDimensionVector(body.scores)) {
    return NextResponse.json({ error: "生成结果所需的测评数据不完整。" }, { status: 400 });
  }

  const payload: DeepSeekResultPayload = {
    modeLabel,
    answeredCount,
    personality,
    scores: body.scores,
    dimensions
  };

  try {
    const result = await generateDeepSeekResult(payload);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "模型结果生成失败。" },
      { status: 502 }
    );
  }
}

function isDimensionVector(value: unknown): value is DimensionVector {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<Record<keyof DimensionVector, unknown>>;

  return dimensions.every((dimension) => typeof record[dimension.id] === "number");
}
