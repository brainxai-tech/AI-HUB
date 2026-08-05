import { afterEach, describe, expect, it, vi } from "vitest";
import { callHubChat, getProviderCatalog } from "../src/lib/hub-models";
import { buildHubTrackPayload } from "../src/lib/hub-tracking";

describe("Hub tracking payloads", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.HUB_CHAT_COMPLETIONS_URL;
    delete process.env.HUB_MODEL_CONFIG_URL;
    delete process.env.HUB_PROJECT_TOKEN;
  });

  it("keeps project observability events free of source data", () => {
    const payload = buildHubTrackPayload({
      eventType: "generate",
      statusCode: 200,
      durationMs: 124.6,
      rows: [{ email: "private@example.com" }],
      prompt: "do not log this",
      body: { csv: "secret" },
    } as never);

    expect(payload).toEqual({
      eventType: "generate",
      projectPath: "/data",
      projectId: "ai-data-analyst",
      source: "project",
      statusCode: 200,
      durationMs: 125,
    });
    expect(JSON.stringify(payload)).not.toContain("private@example.com");
    expect(JSON.stringify(payload)).not.toContain("do not log this");
    expect(JSON.stringify(payload)).not.toContain("secret");
  });

  it("tags Hub model requests with project metadata for server-side generate metrics", async () => {
    process.env.HUB_CHAT_COMPLETIONS_URL = "http://hub.test/v1/chat/completions";
    process.env.HUB_PROJECT_TOKEN = "project-token";
    const requests: Array<{ url: string; init: RequestInit }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        requests.push({ url, init });
        return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await callHubChat({
      provider: "routing",
      model: "gpt-5.5",
      messages: [{ role: "user", content: "private analysis packet" }],
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].init.headers).toMatchObject({
      "content-type": "application/json",
      "x-hub-project-token": "project-token",
      "x-hub-project-path": "/data",
    });
    expect(JSON.parse(String(requests[0].init.body))).toMatchObject({
      provider: "routing",
      model: "gpt-5.5",
      projectId: "ai-data-analyst",
      reasoning_effort: "high",
    });
  });

  it("exposes one routing provider and filters the catalog to GPT models", async () => {
    process.env.HUB_MODEL_CONFIG_URL = "http://hub.test/model-config";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({
        providers: [{
          id: "routing",
          label: "AI Routing",
          adapter: "openai-compatible",
          model: "gpt-5.5",
          models: ["gpt-5.5", "gemini-3.1-pro-preview", "claude-sonnet-4-6", "kimi-k2.5"],
          enabledModels: ["gpt-5.5", "kimi-k2.5"],
          enabled: true,
          configured: true,
        }],
      }), { status: 200 })),
    );

    const providers = await getProviderCatalog();

    expect(providers).toHaveLength(1);
    expect(providers[0]).toMatchObject({
      id: "routing",
      defaultModel: "gpt-5.5",
      enabledModels: ["gpt-5.5"],
      enabled: true,
      configured: true,
    });
    expect(providers[0].models).toEqual(["gpt-5.5"]);
    expect(providers[0].models).not.toContain("kimi-k2.5");
  });

  it("rejects non-GPT models before a Hub request is sent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(callHubChat({
      provider: "routing",
      model: "gemini-3.1-pro-preview",
      messages: [{ role: "user", content: "analysis" }],
    })).rejects.toMatchObject({ code: "INVALID_MODEL", status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
