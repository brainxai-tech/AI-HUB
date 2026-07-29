import {
  buildDeepSeekMessages,
  buildDeepSeekRepairMessages,
  parseDeepSeekCandidates,
  parseDeepSeekGeneratedResult
} from "../../../lib/deepseek.ts";

const HUB_CHAT_COMPLETIONS_URL = process.env.HUB_CHAT_COMPLETIONS_URL || "http://127.0.0.1:4194/api/v1/chat/completions";
const HUB_PROJECT_TOKEN = process.env.HUB_PROJECT_TOKEN || "";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
      { status: 400 }
    );
  }

  const body = payload as {
    modeName?: unknown;
    userTags?: unknown;
    candidates?: unknown;
    fixedIdolId?: unknown;
  };
  const modeName = typeof body.modeName === "string" ? body.modeName : "";
  const userTags = Array.isArray(body.userTags)
    ? body.userTags.filter((tag): tag is string => typeof tag === "string").slice(0, 12)
    : [];
  const candidates = parseDeepSeekCandidates(body.candidates);
  const fixedIdolId = typeof body.fixedIdolId === "string" ? body.fixedIdolId.trim() : "";

  if (!modeName || candidates.length === 0 || !fixedIdolId || !candidates.some((candidate) => candidate.id === fixedIdolId)) {
    return Response.json(
      { error: { code: "INVALID_MATCH_CONTEXT", message: "Missing fixed match context or candidate data." } },
      { status: 422 }
    );
  }

  const requestInput = { modeName, userTags, candidates, fixedIdolId };
  const firstAttempt = await requestDeepSeekCompletion({
    messages: buildDeepSeekMessages(requestInput),
    maxTokens: 2200
  });

  if ("error" in firstAttempt) {
    return firstAttempt.error;
  }

  const firstResult = parseDeepSeekGeneratedResult(firstAttempt.content, candidates, fixedIdolId);

  if (firstResult) {
    return Response.json({
      result: firstResult,
      model: "hub-default",
      usage: firstAttempt.usage,
      repaired: false
    });
  }

  const repairAttempt = await requestDeepSeekCompletion({
    messages: buildDeepSeekRepairMessages(requestInput, firstAttempt.content, [
      "The first result was too sparse, incomplete, or did not keep the fixed idolId."
    ]),
    maxTokens: 2600
  });

  if ("error" in repairAttempt) {
    return repairAttempt.error;
  }

  const repairedResult = parseDeepSeekGeneratedResult(repairAttempt.content, candidates, fixedIdolId);

  if (!repairedResult) {
    return Response.json(
      { error: { code: "HUB_MODEL_INVALID_RESULT", message: "The model returned an invalid or incomplete result." } },
      { status: 502 }
    );
  }

  return Response.json({
    result: repairedResult,
    model: "hub-default",
    usage: repairAttempt.usage,
    repaired: true
  });
}

async function requestDeepSeekCompletion({
  messages,
  maxTokens
}: {
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
}): Promise<{ content: string; usage: unknown } | { error: Response }> {
  let hubResponse: Response;

  try {
    hubResponse = await fetch(HUB_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: buildHubHeaders(),
      body: JSON.stringify({
        messages,
        response_format: { type: "json_object" },
        temperature: 0.55,
        max_tokens: maxTokens
      })
    });
  } catch {
    return {
      error: Response.json(
        { error: { code: "HUB_MODEL_NETWORK_ERROR", message: "Unable to reach AI Project Hub model proxy." } },
        { status: 502 }
      )
    };
  }

  const completion = await hubResponse.json().catch(() => null);

  if (!hubResponse.ok) {
    const message = completion?.error?.message || completion?.error || "Hub model request failed.";
    return {
      error: Response.json({
        error: {
          code: "HUB_MODEL_ERROR",
          message: String(message).slice(0, 500)
        }
      }, {
        status: hubResponse.status === 400 ? 400 : 502
      })
    };
  }

  const content = extractCompletionText(completion);

  if (!content) {
    return {
      error: Response.json(
        { error: { code: "HUB_MODEL_EMPTY_RESULT", message: "AI Project Hub returned no usable text." } },
        { status: 502 }
      )
    };
  }

  return {
    content,
    usage: extractCompletionUsage(completion)
  };
}

function buildHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (HUB_PROJECT_TOKEN) {
    headers["x-hub-project-token"] = HUB_PROJECT_TOKEN;
  }
  return headers;
}

function extractCompletionText(value: unknown) {
  if (!value || typeof value !== "object") {
    return "";
  }

  const body = value as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  const content = body.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

function extractCompletionUsage(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const body = value as { usage?: unknown; usageMetadata?: unknown };
  return body.usage ?? body.usageMetadata ?? null;
}
