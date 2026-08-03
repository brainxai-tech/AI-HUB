import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

import { WorkflowError, publicError } from "./errors.mjs";

const MAX_JSON_BYTES = 4 * 1024 * 1024;

export function createWorkflowHttpServer({ runner, registry, apiToken = process.env.WORKFLOW_API_TOKEN || "" }) {
  return createServer(async (request, response) => {
    setSecurityHeaders(response);
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    try {
      authorize(request, apiToken);
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const pathname = url.pathname.replace(/\/+$/, "") || "/";

      if (request.method === "GET" && pathname === "/health") {
        return sendJson(response, 200, { ok: true, service: "ai-hub-agent-workflow-runtime", skills: registry.list().length });
      }
      if (request.method === "GET" && pathname === "/api/skills") {
        return sendJson(response, 200, { skills: registry.list() });
      }
      if (request.method === "POST" && pathname === "/api/runs") {
        const body = await readJson(request);
        if (typeof body?.skillId !== "string") {
          throw new WorkflowError("VALIDATION_ERROR", "skillId 不能为空。", 422);
        }
        return sendJson(response, 201, { run: await runner.create(body.skillId, body.input) });
      }

      const runMatch = pathname.match(/^\/api\/runs\/([a-z0-9-]+)$/i);
      if (request.method === "GET" && runMatch) {
        return sendJson(response, 200, { run: await runner.get(runMatch[1]) });
      }
      const resumeMatch = pathname.match(/^\/api\/runs\/([a-z0-9-]+)\/resume$/i);
      if (request.method === "POST" && resumeMatch) {
        const body = await readJson(request);
        return sendJson(response, 200, { run: await runner.resume(resumeMatch[1], body?.input) });
      }
      const retryMatch = pathname.match(/^\/api\/runs\/([a-z0-9-]+)\/retry$/i);
      if (request.method === "POST" && retryMatch) {
        return sendJson(response, 200, { run: await runner.retry(retryMatch[1]) });
      }
      const actionMatch = pathname.match(/^\/api\/runs\/([a-z0-9-]+)\/actions\/([a-z0-9-]+)$/i);
      if (request.method === "POST" && actionMatch) {
        const body = await readJson(request);
        return sendJson(response, 200, { run: await runner.action(actionMatch[1], actionMatch[2], body?.input) });
      }
      throw new WorkflowError("NOT_FOUND", "没有找到这个工作流接口。", 404);
    } catch (error) {
      const payload = publicError(error);
      const status = error instanceof WorkflowError ? error.status : 500;
      return sendJson(response, status, { error: payload });
    }
  });
}

function authorize(request, apiToken) {
  if (!apiToken) return;
  const supplied = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const expectedBuffer = Buffer.from(apiToken);
  const suppliedBuffer = Buffer.from(supplied);
  if (
    expectedBuffer.length !== suppliedBuffer.length ||
    !timingSafeEqual(expectedBuffer, suppliedBuffer)
  ) {
    throw new WorkflowError("UNAUTHORIZED", "工作流接口凭证无效。", 401);
  }
}

async function readJson(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_JSON_BYTES) throw new WorkflowError("PAYLOAD_TOO_LARGE", "请求内容过大。", 413);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new WorkflowError("INVALID_JSON", "请求不是有效 JSON。", 400);
  }
}

function sendJson(response, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": data.length,
  });
  response.end(data);
}

function setSecurityHeaders(response) {
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "no-referrer");
}
