import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";

const allowedScopes = new Set(["model:chat", "coze:invoke", "track:write", "admin:config"]);
const projectIdPattern = /^[a-z0-9][a-z0-9-]{1,79}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

function integerWithin(value, fallback, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function headerValue(request, name) {
  const value = request?.headers?.[name];
  if (Array.isArray(value)) {
    return value[0] || "";
  }
  return typeof value === "string" ? value : "";
}

function bearerToken(request) {
  const authorization = headerValue(request, "authorization");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function safeHashEqual(left, right) {
  if (!sha256Pattern.test(left) || !sha256Pattern.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function unauthorized() {
  return {
    ok: false,
    statusCode: 401,
    error: {
      error: {
        code: "PROJECT_AUTH_REQUIRED",
        message: "Valid project credentials are required.",
      },
    },
  };
}

export function hashProjectToken(token) {
  return createHash("sha256").update(String(token), "utf8").digest("hex");
}

export function normalizeProjectTokenRegistry(rawRegistry) {
  const projects = {};
  const rawProjects =
    rawRegistry?.projects && typeof rawRegistry.projects === "object" && !Array.isArray(rawRegistry.projects)
      ? rawRegistry.projects
      : {};

  for (const [projectId, rawProject] of Object.entries(rawProjects)) {
    if (!projectIdPattern.test(projectId) || !rawProject || typeof rawProject !== "object") {
      continue;
    }

    const tokenHash = typeof rawProject.tokenHash === "string" ? rawProject.tokenHash.toLowerCase() : "";
    if (!sha256Pattern.test(tokenHash)) {
      continue;
    }

    const scopes = Array.isArray(rawProject.scopes)
      ? Array.from(
          new Set(rawProject.scopes.filter((scope) => typeof scope === "string" && allowedScopes.has(scope))),
        )
      : [];
    if (scopes.length === 0) {
      continue;
    }

    projects[projectId] = {
      tokenHash,
      scopes,
      requestsPerMinute: integerWithin(rawProject.requestsPerMinute, 60, 1, 600),
      maxConcurrent: integerWithin(rawProject.maxConcurrent, 4, 1, 20),
      dailyTokenBudget: integerWithin(rawProject.dailyTokenBudget, 200000, 1000, 100000000),
      enabled: rawProject.enabled !== false,
    };
  }

  return { version: 1, projects };
}

export async function loadProjectTokenRegistry(registryPath) {
  if (!registryPath) {
    return normalizeProjectTokenRegistry({});
  }

  try {
    return normalizeProjectTokenRegistry(JSON.parse(await readFile(registryPath, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") {
      return normalizeProjectTokenRegistry({});
    }
    throw error;
  }
}

export function createProjectAuthorizer(options = {}) {
  const registry = normalizeProjectTokenRegistry(options.registry || {});
  const allowLegacy = options.allowLegacy === true;
  const legacyToken = typeof options.legacyToken === "string" ? options.legacyToken : "";
  const legacyTokenHash = legacyToken ? hashProjectToken(legacyToken) : "";
  const legacyRequestsPerMinute = integerWithin(options.legacyRequestsPerMinute, 300, 1, 600);
  const legacyMaxConcurrent = integerWithin(options.legacyMaxConcurrent, 20, 1, 20);

  return function authorizeProject(request, requiredScope) {
    const token = headerValue(request, "x-hub-project-token") || bearerToken(request);
    const requestedProjectId = headerValue(request, "x-hub-project-id").trim().toLowerCase();

    if (!token) {
      return unauthorized();
    }

    const tokenHash = hashProjectToken(token);
    let matchedProjectId = "";
    let matchedProject;
    if (requestedProjectId && projectIdPattern.test(requestedProjectId)) {
      const project = registry.projects[requestedProjectId];
      if (project?.enabled && safeHashEqual(tokenHash, project.tokenHash)) {
        matchedProjectId = requestedProjectId;
        matchedProject = project;
      }
    } else if (!requestedProjectId) {
      for (const [projectId, project] of Object.entries(registry.projects)) {
        if (project.enabled && safeHashEqual(tokenHash, project.tokenHash)) {
          matchedProjectId = projectId;
          matchedProject = project;
          break;
        }
      }
    }

    if (matchedProject) {
      if (!matchedProject.scopes.includes(requiredScope)) {
        return {
          ok: false,
          statusCode: 403,
          projectId: matchedProjectId,
          error: {
            error: {
              code: "PROJECT_SCOPE_REQUIRED",
              message: "The project credential does not grant this capability.",
            },
          },
        };
      }

      return {
        ok: true,
        projectId: matchedProjectId,
        scopes: [...matchedProject.scopes],
        requestsPerMinute: matchedProject.requestsPerMinute,
        maxConcurrent: matchedProject.maxConcurrent,
        dailyTokenBudget: matchedProject.dailyTokenBudget,
        legacy: false,
      };
    }

    if (allowLegacy && legacyTokenHash && safeHashEqual(hashProjectToken(token), legacyTokenHash)) {
      return {
        ok: true,
        projectId: projectIdPattern.test(requestedProjectId) ? requestedProjectId : "legacy",
        scopes: [requiredScope],
        requestsPerMinute: legacyRequestsPerMinute,
        maxConcurrent: legacyMaxConcurrent,
        dailyTokenBudget: 10000000,
        legacy: true,
      };
    }

    return unauthorized();
  };
}
