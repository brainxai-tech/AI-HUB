import { AsyncLocalStorage } from "node:async_hooks";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectSpecs = [
  { id: "ai-bedtime-story-factory", basePath: "/story", adapter: "ai-bedtime-story-factory.mjs", credentialRequired: true, forceJson: true },
  { id: "ai-dream-director", basePath: "/dream", adapter: "ai-dream-director.mjs", credentialRequired: true, forceJson: true },
  { id: "ai-aesthetic-fingerprint", basePath: "/aesthetic", adapter: "ai-aesthetic-fingerprint.mjs", credentialRequired: true, forceJson: true },
  { id: "ai-life-version-controller", basePath: "/life-version", adapter: "ai-life-version-controller.mjs", credentialRequired: true, forceJson: true },
  { id: "ai-reality-filter-translator", basePath: "/reality-filter", adapter: "ai-reality-filter-translator.mjs", credentialRequired: true, forceJson: true },
  { id: "ai-cold-start-brand-lab", basePath: "/brand-lab", adapter: "ai-cold-start-brand-lab.mjs", credentialRequired: true, forceJson: true },
  { id: "ai-paper-reading-coach", basePath: "/paper", adapter: "ai-paper-reading-coach.mjs", credentialRequired: true, forceJson: true },
];

const fetchScope = new AsyncLocalStorage();
const originalFetch = globalThis.fetch.bind(globalThis);
let scopedFetchInstalled = false;
let legacyImportHookInstalled = false;
let portableAppsRoot = "";

export function mapLegacyServerImport(specifier, appsRoot) {
  const prefix = "/home/admin/apps/";
  if (typeof specifier !== "string" || !specifier.startsWith(prefix)) return null;
  const relativePath = specifier.slice(prefix.length);
  if (/^[^/]+\/node_modules\/express\/index\.js$/.test(relativePath)) return "express";
  return pathToFileURL(path.join(appsRoot, ...relativePath.split("/"))).href;
}

function installLegacyImportHook(appsRoot) {
  portableAppsRoot = appsRoot;
  if (legacyImportHookInstalled) return;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const mapped = mapLegacyServerImport(specifier, portableAppsRoot);
      if (!mapped) return nextResolve(specifier, context);
      if (mapped === "express") return nextResolve(mapped, context);
      return { url: mapped, shortCircuit: true };
    },
  });
  legacyImportHookInstalled = true;
}

export function remainingProjectIds() {
  return projectSpecs.map((project) => project.id);
}

export function remainingProjectAccessSpecs() {
  return projectSpecs.map(({ id, basePath }) => ({ id, basePath }));
}

export function buildStoryVisualFallback(input = {}) {
  const childName = input.childName?.trim() || "小小探险家";
  const theme = input.theme?.trim() || "勇气与友谊";
  const characters = input.characters?.trim() || "一只小狐狸和一位月亮机器人";
  const setting = input.setting?.trim() || "会发光的森林";
  const story = `${childName}在${setting}遇见了${characters}。他们原本都担心自己做不到，却决定先完成眼前最小的一步。一路上，他们互相提醒、互相等待，也发现真正的勇气不是从不害怕，而是害怕时仍愿意照顾朋友。最后，他们带着关于${theme}的新发现回到家，把今晚的星光装进了记忆里。`;
  return {
    title: `${childName}的星光约定`,
    subtitle: `一个关于${theme}的晚安故事`,
    story,
    readAloud: `夜深了，${setting}安静下来。${story}现在，请闭上眼睛，让这份温暖陪你进入梦乡。`,
    shareCard: {
      headline: `${childName}的星光约定`,
      quote: "勇气不是不害怕，而是愿意和朋友一起向前一步。",
      caption: `今晚读一个关于${theme}的温暖故事。`,
      hashtags: ["晚安故事", "亲子阅读", "勇气与友谊"],
    },
    parentNotes: ["朗读时适当放慢速度。", "可以请孩子说说今天勇敢完成的一件小事。"],
    sequelSeed: `${characters}下一次会沿着星光地图寻找一座会唱歌的小岛。`,
  };
}

export function stripProjectBasePath(requestUrl, basePath) {
  if (requestUrl === basePath) return "/";
  return requestUrl.startsWith(`${basePath}/`)
    ? requestUrl.slice(basePath.length) || "/"
    : requestUrl;
}

export function scopeHubRequest(input, options = {}, scope) {
  const inputUrl = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
  let sourceUrl;
  let chatUrl;
  try {
    sourceUrl = new URL(inputUrl);
    chatUrl = new URL(scope.chatUrl);
  } catch {
    return { input, options };
  }
  if (sourceUrl.origin !== chatUrl.origin) return { input, options };

  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(options.headers).forEach((value, key) => headers.set(key, value));
  if (scope.credential?.token) {
    headers.set("x-hub-project-id", scope.project.id);
    headers.set("x-hub-project-token", scope.credential.token);
    headers.set("x-hub-project-path", scope.project.basePath);
  }

  let body = options.body;
  if (scope.project.forceJson && typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed.messages) && parsed.stream !== true) {
        parsed.response_format = { type: "json_object" };
        body = JSON.stringify(parsed);
      }
    } catch {
      // Preserve non-JSON request bodies unchanged.
    }
  }

  const target = sourceUrl.pathname.endsWith("/api/v1/chat/completions") ? scope.chatUrl : input;
  return { input: target, options: { ...options, headers, body } };
}

function installScopedFetch() {
  if (scopedFetchInstalled) return;
  globalThis.fetch = (input, options) => {
    const scope = fetchScope.getStore();
    if (!scope) return originalFetch(input, options);
    const scoped = scopeHubRequest(input, options, scope);
    return originalFetch(scoped.input, scoped.options);
  };
  scopedFetchInstalled = true;
}

export function installScopedHubFetch() {
  installScopedFetch();
}

export function runWithHubScope(scope, callback) {
  installScopedFetch();
  return fetchScope.run(scope, callback);
}

async function loadAdapters(adapterRoot, credentials) {
  const entries = await Promise.all(projectSpecs.map(async (project) => {
    const credential = credentials[project.id];
    if (project.credentialRequired && !credential?.token) {
      throw new Error(`Missing scoped credential for ${project.id}.`);
    }
    const module = await import(pathToFileURL(path.join(adapterRoot, project.adapter)).href);
    if (typeof module.default !== "function") {
      throw new Error(`Adapter does not export an Express app: ${project.adapter}`);
    }
    return [project.id, { project, credential, app: module.default }];
  }));
  return Object.fromEntries(entries);
}

function dispatchExpress(app, request, response) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (handled) => {
      if (settled) return;
      settled = true;
      response.off("finish", onFinish);
      response.off("close", onFinish);
      resolve(handled);
    };
    const onFinish = () => finish(true);
    response.once("finish", onFinish);
    response.once("close", onFinish);
    try {
      app(request, response, (error) => {
        if (error) {
          if (!settled) {
            settled = true;
            response.off("finish", onFinish);
            response.off("close", onFinish);
            reject(error);
          }
          return;
        }
        finish(false);
      });
    } catch (error) {
      response.off("finish", onFinish);
      response.off("close", onFinish);
      reject(error);
    }
  });
}

export async function createRemainingProjectHandler({ adapterRoot, appsRoot, credentials, chatUrl }) {
  installScopedFetch();
  installLegacyImportHook(appsRoot || path.resolve(adapterRoot, "../../../apps"));
  const adapters = await loadAdapters(adapterRoot, credentials);

  return async function handleRemainingProject(request, response, pathname) {
    const project = projectSpecs.find((candidate) =>
      pathname === `${candidate.basePath}/api` || pathname.startsWith(`${candidate.basePath}/api/`));
    if (!project) return false;

    const adapter = adapters[project.id];
    const originalUrl = request.url;
    request.url = stripProjectBasePath(request.url || pathname, project.basePath);
    try {
      return await fetchScope.run(
        { project, credential: adapter.credential, chatUrl },
        () => dispatchExpress(adapter.app, request, response),
      );
    } finally {
      request.url = originalUrl;
    }
  };
}
