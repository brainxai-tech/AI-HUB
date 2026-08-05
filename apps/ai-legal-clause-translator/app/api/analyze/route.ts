import { analyzeWithProvider } from "../../../lib/provider-adapters.ts";
import { validateAnalyzeClauseRequest } from "../../../lib/legal-analysis.ts";
import { HubModelError } from "../../../lib/hub-models.ts";

export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function readPayload(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const payload = await readPayload(request);
  const validation = validateAnalyzeClauseRequest(payload);

  if (!validation.ok || !validation.value) {
    return jsonResponse({ error: "VALIDATION_ERROR", details: validation.errors }, 422);
  }

  try {
    const result = await analyzeWithProvider(validation.value);
    return jsonResponse({ result });
  } catch (error) {
    if (error instanceof HubModelError) {
      return jsonResponse(
        {
          error: "HUB_MODEL_ERROR",
          message: error.message,
        },
        error.status,
      );
    }

    const message = error instanceof Error ? error.message : "模型服务暂时不可用。";
    return jsonResponse(
      {
        error: "PROVIDER_ERROR",
        message,
      },
      502,
    );
  }
}
