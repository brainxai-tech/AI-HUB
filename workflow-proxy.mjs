import { request as httpRequest } from "node:http";

const RUN_ID_PATTERN = "[a-z0-9][a-z0-9-]{7,80}";
const ACTION_ID_PATTERN = "[a-z0-9]+(?:-[a-z0-9]+)*";
const routes = [
  { pattern: /^\/api\/workflows\/health$/i, methods: new Set(["GET"]), target: () => "/health" },
  { pattern: /^\/api\/workflows\/skills$/i, methods: new Set(["GET"]), target: () => "/api/skills" },
  { pattern: /^\/api\/workflows\/runs$/i, methods: new Set(["POST"]), target: () => "/api/runs" },
  {
    pattern: new RegExp(`^/api/workflows/runs/(${RUN_ID_PATTERN})$`, "i"),
    methods: new Set(["GET", "DELETE"]),
    target: ([, runId]) => `/api/runs/${runId}`,
  },
  {
    pattern: new RegExp(`^/api/workflows/runs/(${RUN_ID_PATTERN})/(resume|retry)$`, "i"),
    methods: new Set(["POST"]),
    target: ([, runId, command]) => `/api/runs/${runId}/${command.toLowerCase()}`,
  },
  {
    pattern: new RegExp(`^/api/workflows/runs/(${RUN_ID_PATTERN})/actions/(${ACTION_ID_PATTERN})$`, "i"),
    methods: new Set(["POST"]),
    target: ([, runId, actionId]) => `/api/runs/${runId}/actions/${actionId}`,
  },
];

export function createWorkflowProxy({
  origin = "http://127.0.0.1:4196",
  apiToken = process.env.WORKFLOW_API_TOKEN || "",
  timeoutMs = 240_000,
} = {}) {
  const upstreamOrigin = normalizeLoopbackOrigin(origin);
  const boundedTimeoutMs = boundedInteger(timeoutMs, 240_000, 1_000, 300_000);

  return {
    match(pathname) {
      return matchRoute(pathname);
    },
    async handle(request, response, pathname) {
      const route = matchRoute(pathname);
      if (!route) return false;
      if (!route.methods.has(request.method || "")) {
        return sendJson(response, 405, {
          error: { code: "WORKFLOW_METHOD_NOT_ALLOWED", message: "Workflow method is not allowed." },
        }, { allow: [...route.methods].join(", ") });
      }
      if (!apiToken) {
        return sendJson(response, 503, {
          error: { code: "WORKFLOW_PROXY_NOT_CONFIGURED", message: "Workflow service is not configured." },
        });
      }

      const match = pathname.match(route.pattern);
      const target = new URL(route.target(match), upstreamOrigin);
      await proxyRequest(request, response, target, apiToken, boundedTimeoutMs);
      return true;
    },
  };
}

function matchRoute(pathname) {
  if (typeof pathname !== "string") return null;
  return routes.find(({ pattern }) => pattern.test(pathname)) || null;
}

function normalizeLoopbackOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !new Set(["127.0.0.1", "localhost", "::1", "[::1]"]).has(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Workflow origin must be a loopback HTTP origin.");
  }
  return url.origin;
}

function proxyRequest(request, response, target, apiToken, timeoutMs) {
  return new Promise((resolve) => {
    const headers = {
      authorization: `Bearer ${apiToken}`,
      host: target.host,
    };
    for (const name of ["accept", "content-length", "content-type"]) {
      const value = request.headers[name];
      if (value !== undefined) headers[name] = value;
    }

    const upstream = httpRequest(target, { method: request.method, headers }, (upstreamResponse) => {
      const statusCode = upstreamResponse.statusCode || 502;
      if (statusCode >= 400) {
        forwardSanitizedError(upstreamResponse, response, statusCode, apiToken)
          .catch(() => {
            if (!response.headersSent) {
              sendJson(response, 502, {
                error: { code: "WORKFLOW_UNAVAILABLE", message: "Workflow service is unavailable." },
              });
            } else {
              response.destroy();
            }
          })
          .finally(resolve);
        return;
      }

      const responseHeaders = {
        "cache-control": "no-store",
        "content-type": safeContentType(upstreamResponse.headers["content-type"]),
        "x-content-type-options": "nosniff",
      };
      const contentLength = upstreamResponse.headers["content-length"];
      if (typeof contentLength === "string" && /^\d+$/.test(contentLength)) {
        responseHeaders["content-length"] = contentLength;
      }
      response.writeHead(statusCode, responseHeaders);
      upstreamResponse.pipe(response);
      upstreamResponse.once("end", resolve);
      upstreamResponse.once("error", () => {
        response.destroy();
        resolve();
      });
    });

    upstream.setTimeout(timeoutMs, () => upstream.destroy(new Error("Workflow upstream timed out.")));
    upstream.once("error", () => {
      if (!response.headersSent) {
        sendJson(response, 502, {
          error: { code: "WORKFLOW_UNAVAILABLE", message: "Workflow service is unavailable." },
        });
      } else {
        response.destroy();
      }
      resolve();
    });
    request.once("aborted", () => upstream.destroy());
    response.once("close", () => {
      if (!response.writableEnded) upstream.destroy();
    });
    request.pipe(upstream);
  });
}

async function forwardSanitizedError(upstreamResponse, response, statusCode, apiToken) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of upstreamResponse) {
    totalBytes += chunk.length;
    if (totalBytes > 512 * 1024) {
      upstreamResponse.destroy();
      return sendJson(response, 502, {
        error: { code: "WORKFLOW_UPSTREAM_ERROR", message: "Workflow request failed." },
      });
    }
    chunks.push(chunk);
  }

  if (statusCode === 401) {
    return sendJson(response, 502, {
      error: { code: "WORKFLOW_UNAVAILABLE", message: "Workflow service is unavailable." },
    });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    payload = { error: { code: "WORKFLOW_UPSTREAM_ERROR", message: "Workflow request failed." } };
  }
  return sendJson(response, statusCode, redactSecret(payload, apiToken));
}

function redactSecret(value, secret, depth = 0) {
  if (typeof value === "string") return value.split(secret).join("[redacted]");
  if (value === null || typeof value !== "object") return value;
  if (depth >= 20) return "[redacted]";
  if (Array.isArray(value)) return value.map((item) => redactSecret(item, secret, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      redactSecret(key, secret, depth + 1),
      redactSecret(item, secret, depth + 1),
    ]),
  );
}

function safeContentType(value) {
  return typeof value === "string" && /^application\/json(?:\s*;[^\r\n]*)?$/i.test(value)
    ? value
    : "application/json; charset=utf-8";
}

function sendJson(response, statusCode, body, extraHeaders = {}) {
  const data = Buffer.from(JSON.stringify(body));
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-length": data.length,
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    ...extraHeaders,
  });
  response.end(data);
  return true;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}
