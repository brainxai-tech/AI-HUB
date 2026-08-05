import { z } from "zod";
import type { ChatMessage, Provider } from "./ai";

const REQUEST_TIMEOUT_MS = 90_000;
const DEFAULT_HUB_CHAT_COMPLETIONS_URL =
  "http://127.0.0.1:4194/api/v1/chat/completions";
const DEFAULT_HUB_MODEL_CONFIG_URL = "http://127.0.0.1:4194/api/model-config";

const ChatCompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z
          .object({
            content: z.union([z.string(), z.array(z.unknown()), z.null()]).optional(),
          })
          .passthrough(),
      }),
    )
    .min(1),
});

const HubModelConfigSchema = z.object({
  providers: z
    .array(
      z.object({
        id: z.string(),
        model: z.string().optional(),
        models: z.array(z.string()).default([]),
        enabledModels: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

export class ProviderError extends Error {
  constructor(
    public code:
      | "PROVIDER_UNAVAILABLE"
      | "PROVIDER_AUTH_FAILED"
      | "PROVIDER_BAD_RESPONSE",
    message: string,
  ) {
    super(message);
  }
}

export function buildHubChatBody(input: {
  provider: Provider;
  model: string;
  messages: ChatMessage[];
}) {
  return {
    provider: input.provider,
    model: input.model,
    messages: input.messages,
    temperature: 0.2,
    max_tokens: 1200,
    stream: false,
    response_format: { type: "json_object" },
  };

}

export function extractHubChatContent(payload: unknown): string {
  const parsed = ChatCompletionResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw createBadProviderResponseError("AI Hub");
  }

  const content = parsed.data.choices[0].message.content;
  const text = readContentText(content);
  if (!text.trim()) {
    throw createBadProviderResponseError("AI Hub");
  }

  return text;
}

export async function callHubChat(input: {
  provider?: Provider;
  model: string;
  messages: ChatMessage[];
}): Promise<string> {
  const token = process.env.HUB_PROJECT_TOKEN?.trim();
  if (!token) {
    throw new ProviderError(
      "PROVIDER_AUTH_FAILED",
      "AI Hub project token is not configured for this game.",
    );
  }

  const response = await fetch(resolveHubChatCompletionsUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-project-token": token,
      "x-hub-project-id": resolveHubProjectId(),
      "x-hub-project-path": resolveHubProjectPath(),
    },
    body: JSON.stringify(
      buildHubChatBody({
        provider: input.provider ?? "openai",
        model: input.model,
        messages: input.messages,
      }),
    ),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => {
    throw new ProviderError("PROVIDER_UNAVAILABLE", "AI Hub did not respond in time.");
  });

  await throwForProviderError(response);

  try {
    return extractHubChatContent(await response.json());
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw createBadProviderResponseError("AI Hub");
  }
}

export async function listHubModels(provider: Provider = "openai"): Promise<string[]> {
  const token = requireProjectToken();
  const response = await fetch(resolveHubModelConfigUrl(), {
    method: "GET",
    headers: {
      "x-hub-project-token": token,
      "x-hub-project-id": resolveHubProjectId(),
      "x-hub-project-path": resolveHubProjectPath(),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => {
    throw new ProviderError("PROVIDER_UNAVAILABLE", "AI Hub model config did not respond in time.");
  });

  await throwForProviderError(response);

  const parsed = HubModelConfigSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    throw createBadProviderResponseError("AI Hub");
  }

  const hubProvider = parsed.data.providers.find((item) => item.id === provider);
  if (!hubProvider) return [];
  const enabled = hubProvider.enabledModels.length ? hubProvider.enabledModels : hubProvider.models;
  return Array.from(
    new Set(
      ([hubProvider.model, ...enabled].filter(Boolean) as string[]).filter((model) =>
        /^gpt-[a-z0-9][a-z0-9._-]*$/i.test(model),
      ),
    ),
  );
}

function requireProjectToken(): string {
  const token = process.env.HUB_PROJECT_TOKEN?.trim();
  if (!token) {
    throw new ProviderError(
      "PROVIDER_AUTH_FAILED",
      "AI Hub project token is not configured for this game.",
    );
  }
  return token;
}

async function throwForProviderError(response: Response) {
  if (response.status === 401 || response.status === 403) {
    const detail = await readProviderErrorMessage(response);
    throw new ProviderError(
      "PROVIDER_AUTH_FAILED",
      detail ? `AI Hub rejected the project request: ${detail}` : "AI Hub rejected the project request.",
    );
  }

  if (!response.ok) {
    const detail = await readProviderErrorMessage(response);
    throw new ProviderError(
      "PROVIDER_UNAVAILABLE",
      detail ? `AI Hub request failed: ${detail}` : "AI Hub request failed.",
    );
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw createBadProviderResponseError("AI Hub");
  }
}

function readContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map(readContentPartText).join("");
}

function readContentPartText(part: unknown): string {
  if (typeof part === "string") return part;
  if (!part || typeof part !== "object") return "";

  const record = part as Record<string, unknown>;
  if (typeof record.text === "string") return record.text;
  if (typeof record.content === "string") return record.content;
  return "";
}

function createBadProviderResponseError(label: string): ProviderError {
  return new ProviderError(
    "PROVIDER_BAD_RESPONSE",
    `${label} returned an unexpected response.`,
  );
}

async function readProviderErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return "";

    const parsed = JSON.parse(text) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "error" in parsed &&
      parsed.error &&
      typeof parsed.error === "object" &&
      "message" in parsed.error &&
      typeof parsed.error.message === "string"
    ) {
      return parsed.error.message.slice(0, 240);
    }

    return text.slice(0, 240);
  } catch {
    return "";
  }
}

function resolveHubChatCompletionsUrl(): string {
  return process.env.HUB_CHAT_COMPLETIONS_URL?.trim() || DEFAULT_HUB_CHAT_COMPLETIONS_URL;
}

function resolveHubModelConfigUrl(): string {
  return process.env.HUB_MODEL_CONFIG_URL?.trim() || DEFAULT_HUB_MODEL_CONFIG_URL;
}

function resolveHubProjectPath(): string {
  return process.env.HUB_PROJECT_PATH?.trim() || process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "/go";
}

function resolveHubProjectId(): string {
  return process.env.HUB_PROJECT_ID?.trim() || "ai-go-duel";
}
