const allowedRoles = new Set(["system", "developer", "user", "assistant", "tool"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedInteger(value, fallback, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

export class RequestPolicyError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "RequestPolicyError";
    this.code = code;
    this.statusCode = statusCode;
    this.body = { error: { code, message } };
  }
}

export function requestedTokenLimit(payload) {
  for (const field of ["max_completion_tokens", "max_tokens", "maxTokens"]) {
    if (payload?.[field] !== undefined) {
      return payload[field];
    }
  }
  return undefined;
}

export function validateChatPayload(payload, options = {}) {
  const maxMessages = boundedInteger(options.maxMessages, 100, 1, 500);
  const maxMessageBytes = boundedInteger(options.maxMessageBytes, 512 * 1024, 1024, 1024 * 1024);
  const maxOutputTokens = boundedInteger(options.maxOutputTokens, 32768, 128, 1000000);

  if (!isPlainObject(payload)) {
    throw new RequestPolicyError("INVALID_REQUEST", "The request body must be a JSON object.");
  }
  if (!Array.isArray(payload.messages) || payload.messages.length < 1 || payload.messages.length > maxMessages) {
    throw new RequestPolicyError(
      "INVALID_MESSAGES",
      `messages must contain between 1 and ${maxMessages} entries.`,
    );
  }

  for (const message of payload.messages) {
    if (!isPlainObject(message) || !allowedRoles.has(message.role)) {
      throw new RequestPolicyError("INVALID_MESSAGES", "Every message must use a supported role.");
    }
    const validString = typeof message.content === "string";
    const validParts =
      Array.isArray(message.content) &&
      message.content.length > 0 &&
      message.content.every((part) => typeof part === "string" || isPlainObject(part));
    if (!validString && !validParts) {
      throw new RequestPolicyError(
        "INVALID_MESSAGES",
        "Every message must contain text or a non-empty content parts array.",
      );
    }
  }

  if (Buffer.byteLength(JSON.stringify(payload.messages), "utf8") > maxMessageBytes) {
    throw new RequestPolicyError(
      "MESSAGES_TOO_LARGE",
      `The serialized messages exceed the ${maxMessageBytes}-byte limit.`,
      413,
    );
  }

  if (
    payload.temperature !== undefined &&
    (!Number.isFinite(payload.temperature) || payload.temperature < 0 || payload.temperature > 2)
  ) {
    throw new RequestPolicyError("INVALID_TEMPERATURE", "temperature must be between 0 and 2.");
  }

  const tokenLimit = requestedTokenLimit(payload);
  if (tokenLimit !== undefined && (!Number.isInteger(tokenLimit) || tokenLimit < 1 || tokenLimit > maxOutputTokens)) {
    throw new RequestPolicyError(
      "INVALID_TOKEN_LIMIT",
      `The requested output token limit must be between 1 and ${maxOutputTokens}.`,
    );
  }

  if (payload.stream !== undefined && payload.stream !== false) {
    throw new RequestPolicyError("STREAMING_NOT_SUPPORTED", "Streaming responses are not supported by this gateway.");
  }
  if (payload.provider !== undefined && !/^[a-z0-9-]{2,40}$/.test(String(payload.provider))) {
    throw new RequestPolicyError("INVALID_PROVIDER", "provider has an invalid format.");
  }
  if (payload.model !== undefined && !/^[A-Za-z0-9._:-]{1,100}$/.test(String(payload.model))) {
    throw new RequestPolicyError("INVALID_MODEL", "model has an invalid format.");
  }
  if (
    payload.response_format !== undefined &&
    (!isPlainObject(payload.response_format) || payload.response_format.type !== "json_object")
  ) {
    throw new RequestPolicyError(
      "INVALID_RESPONSE_FORMAT",
      "Only response_format.type=json_object is supported.",
    );
  }

  return payload;
}

function denial(code, message, retryAfterSeconds = undefined) {
  return {
    ok: false,
    statusCode: 429,
    code,
    retryAfterSeconds,
    body: { error: { code, message } },
  };
}

export class RequestGovernor {
  constructor(options = {}) {
    this.now = typeof options.now === "function" ? options.now : Date.now;
    this.states = new Map();
  }

  acquire(identity, rawLimits = {}, requestedTokens = 0) {
    const now = Number(this.now());
    const requestsPerMinute = boundedInteger(rawLimits.requestsPerMinute, 60, 1, 600);
    const maxConcurrent = boundedInteger(rawLimits.maxConcurrent, 4, 1, 20);
    const dailyTokenBudget = boundedInteger(rawLimits.dailyTokenBudget, 200000, 1000, 100000000);
    const tokenReservation = Number.isInteger(requestedTokens) && requestedTokens > 0 ? requestedTokens : 0;
    const day = new Date(now).toISOString().slice(0, 10);
    let state = this.states.get(identity);

    if (!state) {
      state = { windowStart: now, requests: 0, inFlight: 0, day, usedTokens: 0 };
      this.states.set(identity, state);
    }
    if (now - state.windowStart >= 60_000) {
      state.windowStart = now;
      state.requests = 0;
    }
    if (state.day !== day) {
      state.day = day;
      state.usedTokens = 0;
    }

    if (state.inFlight >= maxConcurrent) {
      return denial(
        "REQUEST_CONCURRENCY_LIMITED",
        "The project already has the maximum number of model requests in progress.",
        1,
      );
    }
    if (state.requests >= requestsPerMinute) {
      return denial(
        "REQUEST_RATE_LIMITED",
        "The project request rate limit has been reached.",
        Math.max(1, Math.ceil((state.windowStart + 60_000 - now) / 1000)),
      );
    }
    if (state.usedTokens + tokenReservation > dailyTokenBudget) {
      return denial(
        "PROJECT_DAILY_BUDGET_EXCEEDED",
        "The project daily output token budget has been reached.",
      );
    }

    state.requests += 1;
    state.inFlight += 1;
    state.usedTokens += tokenReservation;
    let released = false;

    return {
      ok: true,
      release() {
        if (released) {
          return;
        }
        released = true;
        state.inFlight = Math.max(0, state.inFlight - 1);
      },
    };
  }
}
