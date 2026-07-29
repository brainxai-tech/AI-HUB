import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDeepSeekChatBody,
  callDeepSeekChat,
  getDeepSeekExplanationErrorMessage,
  ProviderError,
} from "./deepseek";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("AI provider chat payload", () => {
  it("enables thinking mode for Xiangqi explanations", () => {
    const body = buildDeepSeekChatBody({
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "explain the provided Xiangqi move" }],
    });

    expect(body.thinking).toEqual({ type: "enabled" });
    expect(body.reasoning_effort).toBe("high");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.stream).toBe(false);
  });

  it("calls AI Hub with the project token and reads assistant content", async () => {
    vi.stubEnv("HUB_PROJECT_TOKEN", "hub-project-token");
    vi.stubEnv("HUB_CHAT_COMPLETIONS_URL", "http://127.0.0.1:4194/api/v1/chat/completions");
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: [
                  { type: "text", text: '{"explanation":"' },
                  { type: "text", text: "Develop with tempo." },
                  { type: "text", text: '"}' },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callDeepSeekChat({
        provider: "openai",
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: "explain a Xiangqi move" }],
      }),
    ).resolves.toBe('{"explanation":"Develop with tempo."}');
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4194/api/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-hub-project-token": "hub-project-token",
        }),
      }),
    );
  });

  it("fails closed when the AI Hub project token is missing", async () => {
    await expect(
      callDeepSeekChat({
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: "explain a Xiangqi move" }],
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_AUTH_FAILED" });
  });

  it("formats bad provider responses as an engine fallback message", () => {
    const message = getDeepSeekExplanationErrorMessage(
      new ProviderError(
        "PROVIDER_BAD_RESPONSE",
        "DeepSeek returned an unexpected response.",
      ),
    );

    expect(message).toContain("模型");
    expect(message).toContain("引擎事实");
    expect(message).not.toContain("unexpected response");
  });
});
