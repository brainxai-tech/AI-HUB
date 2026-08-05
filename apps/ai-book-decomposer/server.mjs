import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildAnalysisPrompt,
  parseAnalysisText,
  resultToMarkdown,
} from "./lib/decomposer.mjs";
import { ProviderError, callProvider, getProviderCatalog } from "./lib/providers.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(__dirname, "public");
const MAX_BODY_BYTES = 220_000;
const PORT = Number(process.env.PORT || 4178);
const HOST = process.env.HOST || "127.0.0.1";
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

export function createServer({ fetchImpl = fetch } = {}) {
  const limiter = createRateLimiter();

  return createHttpServer(async (req, res) => {
    setSecurityHeaders(res);

    try {
      const requestUrl = new URL(req.url, "http://localhost");

      if (req.method === "GET" && requestUrl.pathname === "/api/providers") {
        const providers = await getProviderCatalog({ fetchImpl });
        return sendJson(res, 200, {
          providers,
          configured: providers.some((provider) => provider.enabled && provider.configured),
          hubUrl: "/hub/#models",
        });
      }

      if (req.method === "POST" && requestUrl.pathname === "/api/analyze") {
        if (!limiter.allow(req.socket.remoteAddress || "local")) {
          return sendError(res, 429, "RATE_LIMITED", "请求过于频繁，请稍后再试。");
        }
        const body = await readJsonBody(req);
        return await handleAnalyze(res, body, fetchImpl);
      }

      if (req.method === "POST" && requestUrl.pathname === "/api/test-provider") {
        const body = await readJsonBody(req);
        return await handleProviderTest(res, body, fetchImpl);
      }

      if (req.method === "GET" || req.method === "HEAD") {
        return await serveStatic(req, res);
      }

      return sendError(res, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法。");
    } catch (error) {
      return handleError(res, error);
    }
  });
}

async function handleAnalyze(res, body, fetchImpl) {
  const input = validateAnalyzeInput(body);
  const prompt = buildAnalysisPrompt(input);
  const providerResult = await callProvider({
    provider: input.provider,
    model: input.model,
    system: prompt.system,
    user: prompt.user,
    fetchImpl,
  });
  const analysis = parseAnalysisText(providerResult.text);

  return sendJson(res, 200, {
    analysis,
    markdown: resultToMarkdown(analysis),
    usage: providerResult.usage,
    source: prompt.source,
  });
}

async function handleProviderTest(res, body, fetchImpl) {
  const provider = String(body?.provider || "").trim();
  const model = String(body?.model || "").trim();
  validateProvider(provider);

  const result = await callProvider({
    provider,
    model,
    system: "你是连接测试助手。只返回 JSON。",
    user: '返回 {"ok":true,"message":"connected"}',
    fetchImpl,
    maxTokens: 80,
    timeoutMs: 30_000,
  });

  return sendJson(res, 200, {
    ok: true,
    message: "Hub 模型连接成功。",
    preview: result.text.slice(0, 200),
  });
}

function validateAnalyzeInput(body) {
  const input = {
    provider: String(body?.provider || "").trim(),
    model: String(body?.model || "").trim(),
    inputMode: String(body?.inputMode || "excerpt").trim(),
    title: String(body?.title || "").trim(),
    content: String(body?.content || "").trim(),
    outputLanguage: String(body?.outputLanguage || "zh-CN").trim(),
    depth: String(body?.depth || "focused").trim(),
    orientation: String(body?.orientation || "balanced").trim(),
  };

  validateProvider(input.provider);

  if (!["title", "toc", "excerpt", "notes"].includes(input.inputMode)) {
    throw new ProviderError("VALIDATION_ERROR", "请选择有效的输入类型。");
  }
  if (!input.title && !input.content) {
    throw new ProviderError("VALIDATION_ERROR", "请至少输入书名或摘录内容。");
  }
  if (input.content.length > 80_000) {
    throw new ProviderError("INPUT_TOO_LARGE", "输入内容过长，请先拆成较短片段。");
  }

  return input;
}

function validateProvider(provider) {
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(provider)) {
    throw new ProviderError("UNKNOWN_PROVIDER", "请选择 Hub 已支持的模型供应商。");
  }
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(requestUrl.pathname);
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendError(res, 403, "FORBIDDEN", "无权访问该路径。");
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return sendError(res, 404, "NOT_FOUND", "文件不存在。");
    }

    res.writeHead(200, {
      "content-type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
      "content-length": info.size,
      "cache-control": "no-store",
    });

    if (req.method === "HEAD") {
      return res.end();
    }
    return createReadStream(filePath).pipe(res);
  } catch {
    const fallback = await readFile(join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    return res.end(fallback);
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let received = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        req.destroy();
        reject(new ProviderError("BODY_TOO_LARGE", "请求体过大。"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new ProviderError("INVALID_JSON", "请求 JSON 格式不正确。"));
      }
    });
    req.on("error", reject);
  });
}

function handleError(res, error) {
  if (error instanceof ProviderError) {
    return sendError(res, statusForProviderError(error.code), error.code, error.message);
  }

  return sendError(res, 500, "SERVER_ERROR", "服务器处理失败。");
}

function statusForProviderError(code) {
  if (
    [
      "VALIDATION_ERROR",
      "UNKNOWN_PROVIDER",
      "INPUT_TOO_LARGE",
      "BODY_TOO_LARGE",
      "INVALID_JSON",
    ].includes(code)
  ) {
    return 422;
  }
  if (code === "MODEL_NOT_CONFIGURED") return 424;
  if (code === "MODEL_TIMEOUT") return 504;
  if (code === "HUB_PROJECT_TOKEN_REQUIRED") return 500;
  if (code === "HUB_CONFIG_UNAVAILABLE" || code === "HUB_GATEWAY_ERROR") return 502;
  return 500;
}

function sendJson(res, status, value) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(value));
}

function sendError(res, status, code, message) {
  return sendJson(res, status, {
    error: {
      code,
      message,
    },
  });
}

function setSecurityHeaders(res) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader(
    "content-security-policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
}

function createRateLimiter() {
  const buckets = new Map();
  const windowMs = 60_000;
  const maxRequests = 20;

  return {
    allow(key) {
      const now = Date.now();
      const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };
      if (now > bucket.resetAt) {
        bucket.count = 0;
        bucket.resetAt = now + windowMs;
      }
      bucket.count += 1;
      buckets.set(key, bucket);
      return bucket.count <= maxRequests;
    },
  };
}

if (process.argv[1] && normalize(process.argv[1]) === normalize(__filename)) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(`AI Book Decomposer running at http://${HOST}:${PORT}`);
  });
}
