import { chmod, mkdir, open } from "node:fs/promises";
import path from "node:path";

export const focusProjectPaths = ["/data", "/paper/", "/legal", "/elder/", "/course"];
export const maximumEventBytes = 1024;

const allowedEventTypes = new Set(["page_visit", "generate", "export", "api_request", "api_error"]);
const allowedSources = new Set(["hub", "api", "project"]);

function normalizeTimestamp(payloadValue, defaults = {}) {
  for (const value of [defaults.now, payloadValue, defaults.timestamp]) {
    if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) {
      continue;
    }
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

function normalizeEventType(value) {
  return allowedEventTypes.has(value) ? value : "api_request";
}

function normalizeSource(value) {
  return allowedSources.has(value) ? value : "hub";
}

function normalizeMethod(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const method = value.trim().toUpperCase();
  return /^[A-Z]{3,10}$/.test(method) ? method : undefined;
}

function normalizeStatusCode(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 100 || number > 599) {
    return undefined;
  }
  return number;
}

function normalizeDurationMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return undefined;
  }
  return Math.min(Math.round(number), 600000);
}

function normalizeProjectId(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const projectId = value.trim().toLowerCase();
  return /^[a-z0-9-]{2,80}$/.test(projectId) ? projectId : undefined;
}

export function normalizeProjectPath(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return "/hub/";
  }

  try {
    const parsed = new URL(value, "http://47.84.108.192");
    let pathname = parsed.pathname || "/hub/";
    pathname = pathname.replace(/\/{2,}/g, "/");

    if (pathname === "/hub") {
      return "/hub/";
    }

    if (pathname.length > 100) {
      pathname = pathname.slice(0, 100);
    }

    return pathname;
  } catch {
    return "/hub/";
  }
}

export function createObservabilityEvent(payload = {}, defaults = {}) {
  const event = {
    timestamp: normalizeTimestamp(payload.timestamp, defaults),
    eventType: normalizeEventType(payload.eventType || defaults.eventType),
    projectPath: normalizeProjectPath(payload.projectPath || payload.path || payload.url || defaults.projectPath),
    projectId: normalizeProjectId(payload.projectId || defaults.projectId),
    source: normalizeSource(payload.source || defaults.source),
    method: normalizeMethod(payload.method || defaults.method),
    statusCode: normalizeStatusCode(payload.statusCode || defaults.statusCode),
    durationMs: normalizeDurationMs(payload.durationMs || defaults.durationMs),
  };

  return Object.fromEntries(Object.entries(event).filter(([, value]) => value !== undefined));
}

export async function recordObservabilityEvent(logPath, payload, defaults = {}) {
  const event = createObservabilityEvent(payload, defaults);
  const serialized = `${JSON.stringify(event)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > maximumEventBytes + 1) {
    throw new Error("Normalized observability event exceeds the maximum size.");
  }

  const directory = path.dirname(logPath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const handle = await open(logPath, "a", 0o600);
  try {
    await chmod(logPath, 0o600);
    await handle.writeFile(serialized, "utf8");
  } finally {
    await handle.close();
  }
  return event;
}

export async function readObservabilityEvents(logPath, options = {}) {
  const limit = Number.isInteger(options.limit) ? Math.max(options.limit, 1) : 5000;
  const maxBytes = Number.isInteger(options.maxBytes)
    ? Math.min(Math.max(options.maxBytes, 128), 16 * 1024 * 1024)
    : 1024 * 1024;
  let handle;

  try {
    handle = await open(logPath, "r");
    const { size } = await handle.stat();
    const offset = Math.max(0, size - maxBytes);
    const readOffset = offset > 0 ? offset - 1 : 0;
    const buffer = Buffer.alloc(Math.max(0, size - readOffset));
    if (buffer.length > 0) await handle.read(buffer, 0, buffer.length, readOffset);
    let content = buffer.toString("utf8");
    if (offset > 0) {
      if (content.startsWith("\n")) {
        content = content.slice(1);
      } else {
        const firstLineEnd = content.indexOf("\n");
        content = firstLineEnd >= 0 ? content.slice(firstLineEnd + 1) : "";
      }
    }

    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((event) => event && typeof event === "object" && !Array.isArray(event))
      .map((event) => createObservabilityEvent(event, event));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
}

export function createAnonymousEventLimiter(options = {}) {
  const limit = Number.isInteger(options.limit) ? Math.min(Math.max(options.limit, 1), 1000) : 30;
  const windowMs = Number.isInteger(options.windowMs)
    ? Math.min(Math.max(options.windowMs, 1000), 60 * 60 * 1000)
    : 60 * 1000;
  const now = typeof options.now === "function" ? options.now : Date.now;
  const clients = new Map();

  return {
    allow(rawKey) {
      const key = String(rawKey || "anonymous").slice(0, 200);
      const timestamp = now();
      const current = clients.get(key);
      if (!current || timestamp - current.startedAt >= windowMs) {
        clients.set(key, { startedAt: timestamp, count: 1 });
        return true;
      }
      if (current.count >= limit) return false;
      current.count += 1;

      if (clients.size > 10_000) {
        for (const [clientKey, window] of clients) {
          if (timestamp - window.startedAt >= windowMs) clients.delete(clientKey);
        }
      }
      return true;
    },
  };
}

function emptyPathSummary(projectPath) {
  return {
    path: projectPath,
    pageVisits: 0,
    generations: 0,
    exports: 0,
    apiRequests: 0,
    errors: 0,
    avgDurationMs: 0,
    lastSeenAt: null,
  };
}

export function buildObservabilitySummary(events = [], options = {}) {
  const paths = options.paths || focusProjectPaths;
  const byPath = new Map(paths.map((projectPath) => [projectPath, emptyPathSummary(projectPath)]));
  const durationTotals = new Map(paths.map((projectPath) => [projectPath, { total: 0, count: 0 }]));

  for (const rawEvent of events) {
    const event = createObservabilityEvent(rawEvent, rawEvent);
    if (!byPath.has(event.projectPath)) {
      continue;
    }

    const row = byPath.get(event.projectPath);
    if (event.eventType === "page_visit") {
      row.pageVisits += 1;
    } else if (event.eventType === "generate") {
      row.generations += 1;
    } else if (event.eventType === "export") {
      row.exports += 1;
    } else {
      row.apiRequests += 1;
    }

    if (event.statusCode >= 400 || event.eventType === "api_error") {
      row.errors += 1;
    }

    if (typeof event.durationMs === "number") {
      const duration = durationTotals.get(event.projectPath);
      duration.total += event.durationMs;
      duration.count += 1;
    }

    if (!row.lastSeenAt || event.timestamp > row.lastSeenAt) {
      row.lastSeenAt = event.timestamp;
    }
  }

  for (const [projectPath, row] of byPath.entries()) {
    const duration = durationTotals.get(projectPath);
    row.avgDurationMs = duration.count > 0 ? Math.round(duration.total / duration.count) : 0;
  }

  return {
    generatedAt: typeof options.now === "string" ? options.now : new Date().toISOString(),
    totalEvents: events.length,
    paths: Array.from(byPath.values()),
  };
}
