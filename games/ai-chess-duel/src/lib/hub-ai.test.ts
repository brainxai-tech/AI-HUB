import { afterEach, describe, expect, it, vi } from "vitest";
import { ChessCoachRequestSchema, ProviderSchema } from "./ai";
import { buildHubChatBody, callHubChat, listHubModels } from "./hub-ai";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("AI Hub gateway adapter", () => {
  it("accepts only Hub GPT provider and model settings", () => {
    expect(ProviderSchema.safeParse("openai").success).toBe(true);
    expect(ProviderSchema.safeParse("deepseek").success).toBe(false);
    expect(ProviderSchema.safeParse("anthropic").success).toBe(false);
    expect(ProviderSchema.safeParse("gemini").success).toBe(false);
    expect(
      ChessCoachRequestSchema.safeParse({
        provider: "openai",
        model: "claude-opus-4-8",
        fenBefore: "before",
        fenAfter: "after",
        playedBy: "human",
        side: "w",
        moveSan: "e4",
        moveUci: "e2e4",
      }).success,
    ).toBe(false);
  });

  it("uses the GPT-compatible JSON chat shape", () => {
    const body = buildHubChatBody({
      provider: "openai",
      model: "gpt-5.4-mini",
      messages: [{ role: "user", content: "explain a chess move" }],
    });
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.stream).toBe(false);
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  it("calls AI Hub with the project token and project path", async () => {
    vi.stubEnv("HUB_PROJECT_TOKEN", "hub-project-token");
    vi.stubEnv("HUB_PROJECT_ID", "ai-chess-duel");
    vi.stubEnv("HUB_PROJECT_PATH", "/chess");
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
          "x-hub-project-id": "ai-chess-duel",
          "x-hub-project-path": "/chess",
        }),
      }),
    );
  });

  it("loads only the project-scoped GPT catalog", async () => {
    vi.stubEnv("HUB_PROJECT_TOKEN", "hub-project-token");
    vi.stubEnv("HUB_PROJECT_ID", "ai-chess-duel");
    vi.stubEnv("HUB_PROJECT_PATH", "/chess");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        providers: [{
          id: "openai",
          model: "gpt-5.5",
          models: ["gpt-5.5", "deepseek-v4-flash"],
          enabledModels: ["gpt-5.5"],
        }],
      }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listHubModels()).resolves.toEqual(["gpt-5.5"]);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({
        "x-hub-project-token": "hub-project-token",
        "x-hub-project-id": "ai-chess-duel",
        "x-hub-project-path": "/chess",
      }),
    }));
  });

  it("fails closed when the project token is missing", async () => {
    await expect(
      callHubChat({
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: "explain a move" }],
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_AUTH_FAILED" });
  });
});
