import { NextResponse } from "next/server";
import {
  buildGoCoachMessages,
  GoCoachRequestSchema,
  parseGoCoachContent,
} from "@/lib/ai";
import { jsonError } from "@/lib/api-response";
import { callHubChat, ProviderError } from "@/lib/hub-ai";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("VALIDATION_ERROR", "Request body must be JSON.", 400);
  }

  const parsed = GoCoachRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Coach request is invalid.",
      422,
      parsed.error.flatten(),
    );
  }

  try {
    const content = await callHubChat({
      provider: parsed.data.provider,
      model: parsed.data.model,
      messages: buildGoCoachMessages(parsed.data),
    });

    return NextResponse.json({
      explanation: parseGoCoachContent(content),
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      const status = error.code === "PROVIDER_AUTH_FAILED" ? 401 : 502;
      return jsonError(error.code, error.message, status);
    }

    return jsonError("COACH_FAILED", "Unable to generate a Go explanation.", 502);
  }
}
