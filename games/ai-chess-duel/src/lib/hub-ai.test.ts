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
      messages: [{ role: "user", content: "explain a chess move" }],
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
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/chess");
    vi.stubEnv("HUB_CHAT_COMPLETIONS_URL", "http://127.0.0.1:4194/api/v1/chat/completions");
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: '{"explanation":"Develop the center."}',
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
        provider: "openai",
        model: "gpt-5.5",
        messages: [{ role: "user", content: "explain a chess move" }],
      }),
    ).resolves.toBe('{"explanation":"Develop the center."}');
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4194/api/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-hub-project-token": "hub-project-token",
          "x-hub-project-path": "/chess",
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
