import { createHttpError, createPlanResponse, errorToPayload } from "../src/server/plan-response.mjs";

export const config = {
  maxDuration: 60
};

const BODY_LIMIT_BYTES = 128_000;
const CORS_ALLOW_HEADERS = "Content-Type, Authorization";
const CORS_ALLOW_METHODS = "POST, OPTIONS";
const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

export function createPlanHandler({ fetchImpl = globalThis.fetch } = {}) {
  return async function handler(request, response) {
    applyCorsHeaders(request, response);

    if (request.method === "OPTIONS") {
      response.setHeader("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS);
      response.setHeader("Access-Control-Allow-Methods", CORS_ALLOW_METHODS);
      response.setHeader("Access-Control-Max-Age", "600");
      response.status(204).end();
      return;
    }

    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    try {
      const body = await readJsonBody(request);
      const payload = await createPlanResponse(body, { fetchImpl });
      sendJson(response, 200, payload);
    } catch (error) {
      sendJson(response, error.status || 500, errorToPayload(error));
    }
  };
}

async function readJsonBody(request) {
  if (request.body !== undefined) {
    return parseKnownBody(request.body);
  }

  const raw = await readRawBody(request);
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw createHttpError("Request JSON could not be parsed.", 400);
  }
}

function parseKnownBody(body) {
  if (body === null || body === "") return {};
  if (Buffer.isBuffer(body)) {
    return parseBodyString(body.toString("utf8"));
  }
  if (typeof body === "string") {
    return parseBodyString(body);
  }
  if (typeof body === "object") {
    return body;
  }
  throw createHttpError("Request JSON could not be parsed.", 400);
}

function parseBodyString(raw) {
  if (Buffer.byteLength(raw, "utf8") > BODY_LIMIT_BYTES) {
    throw createHttpError("Request body is too large.", 413);
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw createHttpError("Request JSON could not be parsed.", 400);
  }
}

async function readRawBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw, "utf8") > BODY_LIMIT_BYTES) {
      throw createHttpError("Request body is too large.", 413);
    }
  }
  return raw;
}

function applyCorsHeaders(request, response) {
  const origin = request.headers?.origin;
  if (!origin) return;
  if (!isAllowedOrigin(origin, request)) return;

  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
}

function isAllowedOrigin(origin, request) {
  if (origin === "null" || LOCAL_ORIGIN_PATTERN.test(origin)) {
    return true;
  }

  const host = request.headers?.["x-forwarded-host"] || request.headers?.host;
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function sendJson(response, status, payload) {
  response.setHeader("Cache-Control", "no-store");
  response.status(status).json(payload);
}

export default createPlanHandler();
