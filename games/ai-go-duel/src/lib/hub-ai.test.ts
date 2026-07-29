import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHubChatBody, callHubChat } from "./hub-ai";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("AI Hub gateway adapter", () => {
  it("enables reasoning controls for DeepSeek requests", () => {
    const body = buildHubChatBody({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "explain a Go move" }],
    });
    const deepSeekBody = body as typeof body & {
      thinking?: unknown;
      reasoning_effort?: string;
    };

    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.stream).toBe(false);
    expect(deepSeekBody.thinking).toEqual({ type: "enabled" });
    expect(deepSeekBody.reasoning_effort).toBe("high");
  });

  it("calls AI Hub with the project token and project path", async () => {
    vi.stubEnv("HUB_PROJECT_TOKEN", "hub-project-token");
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/go");
    vi.stubEnv("HUB_CHAT_COMPLETIONS_URL", "http://127.0.0.1:4194/api/v1/chat/completions");
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: '{"explanation":"This move takes a key liberty."}',
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callHubChat({
        provider: "gemini",
        model: "gemini-3.5-flash",
        messages: [{ role: "user", content: "explain a Go move" }],
      }),
    ).resolves.toBe('{"explanation":"This move takes a key liberty."}');
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4194/api/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-hub-project-token": "hub-project-token",
          "x-hub-project-path": "/go",
        }),
      }),
    );
  });

  it("fails closed when the project token is missing", async () => {
    await expect(
      callHubChat({
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: "explain a move" }],
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_AUTH_FAILED" });
  });
});
