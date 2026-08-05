import { NextResponse } from "next/server";
import { getProviderCatalog, HubModelError } from "@/lib/hub-models";

export const runtime = "nodejs";

export async function GET() {
  try {
    const providers = await getProviderCatalog();
    return NextResponse.json({
      providers,
      configured: providers.some((provider) => provider.enabled && provider.configured),
      hubUrl: "/hub/#models",
    });
  } catch (error) {
    if (error instanceof HubModelError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: { code: "HUB_CONFIG_ERROR", message: "读取 Hub 模型配置失败。" } },
      { status: 502 },
    );
  }
}
