import { getProviderCatalog, ProviderError } from "../../../lib/providers.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export async function GET() {
  try {
    const providers = await getProviderCatalog();
    return jsonResponse({
      providers,
      configured: providers.some((provider) => provider.enabled && provider.configured),
      hubUrl: "/hub/#models",
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
          message: "无法读取 Hub 模型配置。",
        },
      },
      500,
    );
  }
}
