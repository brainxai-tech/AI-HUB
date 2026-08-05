import { callTeachingProvider, ProviderError } from "../../../lib/providers.ts";
import { validateTeachingRequest } from "../../../lib/teaching.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readPayload(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export async function POST(request: Request) {
  const payload = await readPayload(request);
  const validation = validateTeachingRequest(payload);

  if (!validation.ok) {
    return jsonResponse({ error: validation.error }, 422);
  }

  try {
    const bundle = await callTeachingProvider(validation.data);

    return jsonResponse({
      bundle,
      source: "ai",
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      return jsonResponse(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        error.status,
      );
    }

    return jsonResponse(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "生成服务暂时不可用，请稍后再试。",
        },
      },
      500,
    );
  }
}
