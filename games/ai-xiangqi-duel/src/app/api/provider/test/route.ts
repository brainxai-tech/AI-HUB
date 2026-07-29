import { NextResponse } from "next/server";
import { ProviderTestRequestSchema } from "@/lib/ai";
import { jsonError } from "@/lib/api-response";
import { listHubModels, ProviderError } from "@/lib/deepseek";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("VALIDATION_ERROR", "Request body must be JSON.", 400);
  }

  const parsed = ProviderTestRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Provider settings are invalid.",
      422,
      parsed.error.flatten(),
    );
  }

  try {
    const models = await listHubModels(parsed.data.provider);
    return NextResponse.json({
      ok: true,
      models,
      selectedModelAvailable: parsed.data.model
        ? models.includes(parsed.data.model)
        : null,
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      const status = error.code === "PROVIDER_AUTH_FAILED" ? 401 : 502;
      return jsonError(error.code, error.message, status);
    }

    return jsonError("INTERNAL_ERROR", "Unable to test provider.", 500);
  }
}
