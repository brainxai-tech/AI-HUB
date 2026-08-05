import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildHubChatBody,
  callHubChat,
  getHubExplanationErrorMessage,
  listHubModels,
  ProviderError,
} from "./deepseek";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("AI provider chat payload", () => {
  it("uses the GPT-compatible JSON chat shape for Xiangqi explanations", () => {
    const body = buildHubChatBody({
      model: "gpt-5.4-mini",
      messages: [{ role: "user", content: "explain the provided Xiangqi move" }],
    });

    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.stream).toBe(false);
  });

  it("calls AI Hub with the project token and reads assistant content", async () => {
    vi.stubEnv("HUB_PROJECT_TOKEN", "hub-project-token");
    vi.stubEnv("HUB_PROJECT_ID", "ai-xiangqi-duel");
    vi.stubEnv("HUB_PROJECT_PATH", "/xiangqi");
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
      callHubChat({
        provider: "openai",
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: "explain a Xiangqi move" }],
      }),
    ).resolves.toBe('{"explanation":"Develop with tempo."}');
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4194/api/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-hub-project-token": "hub-project-token",
          "x-hub-project-id": "ai-xiangqi-duel",
          "x-hub-project-path": "/xiangqi",
        }),
      }),
    );
  });

  it("loads only project-scoped GPT models with server credentials", async () => {
    vi.stubEnv("HUB_PROJECT_TOKEN", "hub-project-token");
    vi.stubEnv("HUB_PROJECT_ID", "ai-xiangqi-duel");
    vi.stubEnv("HUB_PROJECT_PATH", "/xiangqi");
    vi.stubEnv("HUB_MODEL_CONFIG_URL", "http://127.0.0.1:4194/api/model-config");
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          providers: [
            {
              id: "openai",
              model: "gpt-5.4-mini",
              models: ["gpt-5.4-mini", "claude-opus-4-8"],
              enabledModels: ["gpt-5.4-mini", "gemini-3.5-flash"],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listHubModels("openai")).resolves.toEqual(["gpt-5.4-mini"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4194/api/model-config",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-hub-project-token": "hub-project-token",
          "x-hub-project-id": "ai-xiangqi-duel",
          "x-hub-project-path": "/xiangqi",
        }),
      }),
    );
  });

  it("fails closed when the AI Hub project token is missing", async () => {
    await expect(
      callHubChat({
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: "explain a Xiangqi move" }],
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_AUTH_FAILED" });
  });

  it("formats bad provider responses as an engine fallback message", () => {
    const message = getHubExplanationErrorMessage(
      new ProviderError(
        "PROVIDER_BAD_RESPONSE",
        "AI Hub returned an unexpected response.",
      ),
    );

    expect(message).toContain("模型");
    expect(message).toContain("引擎事实");
    expect(message).not.toContain("unexpected response");
  });
});
