import { getScenario, LEVELS, TONES } from "./scenarios.mjs";

export class ApiProblem extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "ApiProblem";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function createErrorBody(code, message, details = undefined) {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

export function ensureObject(value, label = "body") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiProblem(422, "VALIDATION_ERROR", `${label} must be an object`);
  }
  return value;
}

export function ensureString(value, label, options = {}) {
  const { required = true, max = 4000 } = options;
  if (value === undefined || value === null || value === "") {
    if (!required) return "";
    throw new ApiProblem(422, "VALIDATION_ERROR", `${label} is required`);
  }
  if (typeof value !== "string") {
    throw new ApiProblem(422, "VALIDATION_ERROR", `${label} must be a string`);
  }
  const trimmed = value.trim();
  if (required && !trimmed) {
    throw new ApiProblem(422, "VALIDATION_ERROR", `${label} is required`);
  }
  if (trimmed.length > max) {
    throw new ApiProblem(422, "VALIDATION_ERROR", `${label} is too long`);
  }
  return trimmed;
}

export function ensureProvider(value) {
  const provider = ensureString(value, "provider").toLowerCase();
  if (!["deepseek", "openai", "anthropic", "gemini"].includes(provider)) {
    throw new ApiProblem(422, "VALIDATION_ERROR", "provider is not supported");
  }
  return provider;
}

export function ensureScene(value) {
  const sceneId = ensureString(value, "sceneId");
  const scenario = getScenario(sceneId);
  if (!scenario) {
    throw new ApiProblem(422, "VALIDATION_ERROR", "sceneId is not supported");
  }
  return scenario;
}

export function ensureLevel(value) {
  const level = ensureString(value ?? "B1", "level");
  if (!LEVELS.includes(level)) {
    throw new ApiProblem(422, "VALIDATION_ERROR", "level must be A2, B1, B2, or C1");
  }
  return level;
}

export function ensureTone(value) {
  const tone = ensureString(value ?? "supportive", "tone");
  if (!TONES.includes(tone)) {
    throw new ApiProblem(422, "VALIDATION_ERROR", "tone is not supported");
  }
  return tone;
}

export function ensureMessages(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-18).map((message, index) => {
    ensureObject(message, `messages[${index}]`);
    const role = ensureString(message.role, `messages[${index}].role`);
    if (!["user", "assistant"].includes(role)) {
      throw new ApiProblem(422, "VALIDATION_ERROR", "message role must be user or assistant");
    }
    return {
      role,
      content: ensureString(message.content, `messages[${index}].content`, { max: 2000 })
    };
  });
}

export function parsePracticeRequest(body) {
  const input = ensureObject(body);
  return {
    provider: ensureProvider(input.provider),
    model: ensureString(input.model, "model", { required: false, max: 120 }),
    scenario: ensureScene(input.sceneId),
    level: ensureLevel(input.level),
    tone: ensureTone(input.tone),
    objective: ensureString(input.objective, "objective", { required: false, max: 600 }),
    userText: ensureString(input.userText, "userText", { required: false, max: 2000 }),
    messages: ensureMessages(input.messages)
  };
}

export function parseEvaluationRequest(body) {
  const request = parsePracticeRequest(body);
  if (request.messages.length < 2) {
    throw new ApiProblem(422, "VALIDATION_ERROR", "at least two messages are required for evaluation");
  }
  return request;
}
