import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installScopedHubFetch, runWithHubScope } from "./remaining-projects.mjs";

const projectSpecs = [
  { id: "ai-book-decomposer", basePath: "/book", factory: "createServer", credentialRequired: true, forceJson: true },
  { id: "ai-emotional-companion-local", sourceDir: "qisheng-emotional-companion", basePath: "/qisheng", factory: "createAppServer", credentialRequired: true, forceJson: false },
  { id: "elder-fraud-assistant", basePath: "/elder", capture: true, credentialRequired: true, forceJson: true },
  { id: "ai-english-theater", basePath: "/english", capture: true, credentialRequired: true, forceJson: true },
  {
    id: "ai-zhougong-dream",
    basePath: "/zhougong",
    capture: true,
    entry: "server/index.ts",
    resolveTypeScript: true,
    credentialRequired: true,
    forceJson: true,
  },
];

const capturesKey = Symbol.for("aihub.native-http-captures");
const currentProjectKey = Symbol.for("aihub.native-current-project");
const captureParents = new Set();
const typescriptRoots = new Set();
const zhougongParents = new Set();
let captureHookInstalled = false;

export function nativeProjectIds() {
  return projectSpecs.map((project) => project.id);
}

export function nativeProjectAccessSpecs() {
  return projectSpecs.map(({ id, basePath }) => ({ id, basePath }));
}

export function stripNativeBasePath(requestUrl, basePath) {
  if (requestUrl === basePath) return "/";
  return requestUrl.startsWith(`${basePath}/`)
    ? requestUrl.slice(basePath.length) || "/"
    : requestUrl;
}

function requestListener(server, projectId) {
  const listener = server?.listeners?.("request")?.[0];
  if (typeof listener !== "function") {
    throw new Error(`Unable to load request listener for ${projectId}.`);
  }
  return listener;
}

function installCaptureHook(appsRoot) {
  for (const project of projectSpecs.filter((candidate) => candidate.capture)) {
    const entry = project.entry || "server.mjs";
    const sourceDir = project.sourceDir || project.id;
    const entryUrl = pathToFileURL(path.join(appsRoot, sourceDir, entry)).href;
    captureParents.add(entryUrl);
    if (project.resolveTypeScript) {
      typescriptRoots.add(pathToFileURL(path.join(appsRoot, sourceDir, path.dirname(entry))).href);
    }
    if (project.id === "ai-zhougong-dream") {
      zhougongParents.add(entryUrl);
    }
  }
  if (captureHookInstalled) return;

  const shimUrl = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "native-http-shim.mjs")).href;
  const zhougongStorageUrl = pathToFileURL(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "zhougong-storage.mjs"),
  ).href;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const parentUrl = context.parentURL || "";
      if (specifier === "node:http" && [...captureParents].some((candidate) => parentUrl.startsWith(candidate))) {
        return { url: shimUrl, shortCircuit: true };
      }
      if (specifier === "./storage" && [...zhougongParents].some((candidate) => parentUrl.startsWith(candidate))) {
        return { url: zhougongStorageUrl, shortCircuit: true };
      }
      if (
        specifier.startsWith(".") &&
        !/\.(?:[cm]?[jt]s|json|node)$/i.test(specifier) &&
        [...typescriptRoots].some((candidate) => parentUrl.startsWith(candidate))
      ) {
        return { url: `${new URL(specifier, parentUrl).href}.ts`, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
  captureHookInstalled = true;
}

async function captureListener(project, appsRoot) {
  installCaptureHook(appsRoot);
  const captures = globalThis[capturesKey] || new Map();
  globalThis[capturesKey] = captures;
  globalThis[currentProjectKey] = project.id;
  try {
    await import(pathToFileURL(path.join(appsRoot, project.sourceDir || project.id, project.entry || "server.mjs")).href);
  } finally {
    delete globalThis[currentProjectKey];
  }
  const listener = captures.get(project.id);
  captures.delete(project.id);
  if (typeof listener !== "function") {
    throw new Error(`Unable to capture request listener for ${project.id}.`);
  }
  return listener;
}

async function loadNativeHandlers(appsRoot) {
  installScopedHubFetch();
  const handlers = {};
  const deferredFetch = (...args) => globalThis.fetch(...args);

  for (const project of projectSpecs) {
    if (project.capture) {
      handlers[project.id] = await captureListener(project, appsRoot);
      continue;
    }
    const module = await import(pathToFileURL(path.join(appsRoot, project.sourceDir || project.id, "server.mjs")).href);
    const factory = module[project.factory];
    if (typeof factory !== "function") {
      throw new Error(`Missing ${project.factory} export for ${project.id}.`);
    }
    const server = factory({ fetchImpl: deferredFetch });
    handlers[project.id] = requestListener(server, project.id);
  }
  return handlers;
}

function dispatchNative(listener, request, response) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      response.off("finish", finish);
      response.off("close", finish);
      resolve(true);
    };
    response.once("finish", finish);
    response.once("close", finish);
    Promise.resolve()
      .then(() => listener(request, response))
      .then(() => {
        if (response.writableEnded) finish();
      })
      .catch((error) => {
        response.off("finish", finish);
        response.off("close", finish);
        reject(error);
      });
  });
}

export async function createNativeProjectHandler({ appsRoot, credentials, chatUrl, handlers: providedHandlers }) {
  const handlers = providedHandlers || await loadNativeHandlers(appsRoot);
  for (const project of projectSpecs) {
    if (project.credentialRequired && !credentials[project.id]?.token) {
      throw new Error(`Missing scoped credential for ${project.id}.`);
    }
    if (typeof handlers[project.id] !== "function") {
      throw new Error(`Missing native request handler for ${project.id}.`);
    }
  }

  return async function handleNativeProject(request, response, pathname) {
    const project = projectSpecs.find((candidate) =>
      pathname === `${candidate.basePath}/api` || pathname.startsWith(`${candidate.basePath}/api/`));
    if (!project) return false;

    const originalUrl = request.url;
    request.url = stripNativeBasePath(request.url || pathname, project.basePath);
    try {
      return await runWithHubScope(
        { project, credential: credentials[project.id], chatUrl },
        () => dispatchNative(handlers[project.id], request, response),
      );
    } finally {
      request.url = originalUrl;
    }
  };
}
