import { existsSync, readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installScopedHubFetch, runWithHubScope } from "./remaining-projects.mjs";

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const projectSpecs = [
  {
    id: "xhs-copywriting-master",
    basePath: "/xhs",
    routes: { "/generate": "app/api/generate/route.ts", "/providers": "app/api/providers/route.ts" },
  },
  {
    id: "ai-data-analyst",
    basePath: "/data",
    aliasRoot: "src",
    forceJson: false,
    routes: { "/llm": "app/api/llm/route.ts", "/providers": "app/api/providers/route.ts" },
  },
  {
    id: "trace-sheet-workbench",
    basePath: "/tracesheet",
    aliasRoot: "src",
    forceJson: false,
    routes: { "/plan": "app/api/plan/route.ts", "/providers": "app/api/providers/route.ts" },
  },
  {
    id: "ai-course-teaching-assistant",
    basePath: "/course",
    routes: {
      "/providers": "app/api/providers/route.ts",
      "/teaching-bundles": "app/api/teaching-bundles/route.ts",
    },
  },
  {
    id: "ai-legal-clause-translator",
    basePath: "/legal",
    routes: { "/analyze": "app/api/analyze/route.ts", "/providers": "app/api/providers/route.ts" },
  },
  {
    id: "ai-tarot-sanctum",
    basePath: "/tarot",
    routes: {
      "/compatible-reading": "app/api/compatible-reading/route.ts",
      "/deepseek-reading": "app/api/deepseek-reading/route.ts",
      "/providers": "app/api/providers/route.ts",
    },
  },
  {
    id: "qingqing-grassland-personality",
    basePath: "/grassland",
    routes: {
      "/deepseek-result": "app/api/deepseek-result/route.ts",
      "/providers": "app/api/providers/route.ts",
    },
  },
  {
    id: "idol-match-test",
    basePath: "/idol-match",
    routes: {
      "/compatible-result": "app/api/compatible-result/route.ts",
      "/deepseek-result": "app/api/deepseek-result/route.ts",
      "/explain-match": "app/api/explain-match/route.ts",
      "/providers": "app/api/providers/route.ts",
    },
  },
].map((project) => ({
  ...project,
  credentialRequired: true,
  forceJson: project.forceJson ?? true,
}));

const projectRoots = new Map();
const projectAliasRoots = new Map();
let nextHooksInstalled = false;

export function nextProjectIds() {
  return projectSpecs.map((project) => project.id);
}

export function nextProjectAccessSpecs() {
  return projectSpecs
    .map(({ id, basePath }) => ({ id, basePath }));
}

export function stripNextApiPath(pathname, basePath) {
  const prefix = `${basePath}/api`;
  if (pathname === prefix) return "/";
  return pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) || "/" : pathname;
}

export function buildIdolVisualFallback(payload = {}) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const fixedId = typeof payload.fixedIdolId === "string" ? payload.fixedIdolId : "";
  const selected = candidates.find((candidate) => candidate?.id === fixedId);
  if (!selected || typeof selected.name !== "string") return null;

  const userTags = Array.isArray(payload.userTags)
    ? payload.userTags.filter((tag) => typeof tag === "string" && tag.trim()).slice(0, 8)
    : [];
  const matchedTags = Array.isArray(selected.matchedTags) && selected.matchedTags.length
    ? selected.matchedTags.filter((tag) => typeof tag === "string").slice(0, 8)
    : userTags.slice(0, 4);
  const entryReasons = Array.isArray(selected.entryReasons)
    ? selected.entryReasons.filter((reason) => typeof reason === "string" && reason.trim())
    : [];
  const reasons = [
    entryReasons[0] || `${selected.name} 的内容气质与当前偏好标签形成了直接对应。`,
    entryReasons[1] || `固定匹配结果保留了候选资料中最稳定、最容易验证的吸引点。`,
    `建议先从代表舞台或代表作品开始，观察 ${matchedTags.join("、") || "核心标签"} 是否持续成立。`,
    `把短期上头感与长期追随体验分开记录，可以减少只凭一次内容下结论。`,
  ];
  const dimensionScores = Array.isArray(selected.dimensionScores) && selected.dimensionScores.length
    ? selected.dimensionScores.slice(0, 6)
    : [
        { label: "气质", score: 7, matchedTags },
        { label: "作品", score: 7, matchedTags: [] },
        { label: "陪伴", score: 6, matchedTags: [] },
      ];
  const top3 = candidates.slice(0, 3).map((candidate, index) => ({
    idolId: candidate.id,
    idolName: candidate.name,
    score: Number.isFinite(candidate.score) ? candidate.score : Math.max(60, 88 - index * 5),
    difference: index === 0
      ? "固定首选与当前偏好标签的重合度最高，适合作为第一条内容探索路径。"
      : "该候选提供了不同的作品或陪伴体验，可作为对照观察而不替换固定首选。",
  }));

  return {
    result: {
      idolId: selected.id,
      idolName: selected.name,
      score: Number.isFinite(selected.score) ? selected.score : 85,
      confidence: Number.isFinite(selected.confidence) ? selected.confidence : 78,
      summary: `${selected.name} 是规则已经确定的固定首选。当前结果把用户标签、候选资料和内容入口整理为可直接查看的匹配卡片；先从一项代表内容开始，再用真实观看体验验证这份吸引是否稳定。`,
      matchedTags,
      reasons,
      entryPath: [
        `先看一项能体现 ${matchedTags[0] || "核心气质"} 的代表内容，记录第一印象。`,
        "再补一项不同类型的作品，对比舞台表现、作品完成度和日常表达。",
        "七天后回看记录，判断吸引来自单次高光还是能够持续的内容体验。",
      ],
      dimensionScores,
      top3,
    },
    model: "local-visual-fallback",
    usage: null,
    repaired: false,
    fallback: true,
    warning: "实时模型未返回完整结构，已使用固定候选生成可视化结果。",
  };
}

function resolveProjectFile(root, relativePath) {
  const base = path.join(root, relativePath);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, path.join(base, "index.ts")];
  const match = candidates.find((candidate) => existsSync(candidate));
  return match ? pathToFileURL(match).href : null;
}

function installNextHooks(appsRoot) {
  for (const project of projectSpecs) {
    const root = path.join(appsRoot, project.id);
    projectRoots.set(project.id, root);
    projectAliasRoots.set(root, path.join(root, project.aliasRoot || ""));
  }
  if (nextHooksInstalled) return;

  const responseShimUrl = pathToFileURL(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "next-response-shim.mjs"),
  ).href;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "next/server" || specifier === "next/server.js") {
        return { url: responseShimUrl, shortCircuit: true };
      }

      const parentPath = context.parentURL?.startsWith("file:") ? fileURLToPath(context.parentURL) : "";
      const project = [...projectRoots.entries()].find(([, root]) => parentPath.startsWith(root));
      if (project) {
        const [, root] = project;
        if (specifier.startsWith("@/")) {
          const url = resolveProjectFile(projectAliasRoots.get(root), specifier.slice(2));
          if (url) return { url, shortCircuit: true };
        }
        if (specifier.startsWith(".") && !/\.(?:[cm]?[jt]s|json|node)$/i.test(specifier)) {
          const target = path.resolve(path.dirname(parentPath), specifier);
          const url = resolveProjectFile(path.parse(target).root, target.slice(path.parse(target).root.length));
          if (url) return { url, shortCircuit: true };
        }
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      const filePath = url.startsWith("file:") ? fileURLToPath(url) : "";
      if (
        /\.tsx?$/i.test(filePath) &&
        [...projectRoots.values()].some((root) => filePath.startsWith(root))
      ) {
        return {
          format: "module",
          source: stripTypeScriptTypes(readFileSync(filePath, "utf8"), { mode: "transform" }),
          shortCircuit: true,
        };
      }
      return nextLoad(url, context);
    },
  });
  nextHooksInstalled = true;
}

async function loadRouteModules(appsRoot) {
  installScopedHubFetch();
  installNextHooks(appsRoot);
  const modules = {};
  for (const project of projectSpecs) {
    modules[project.id] = {};
    for (const [apiPath, relativePath] of Object.entries(project.routes)) {
      modules[project.id][apiPath] = await import(pathToFileURL(path.join(appsRoot, project.id, relativePath)).href);
    }
  }
  return modules;
}

async function readBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      const error = new Error("请求内容过大。");
      error.status = 413;
      error.code = "PAYLOAD_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function toWebRequest(request) {
  const method = request.method || "GET";
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers || {})) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(request);
  return new Request(`http://${request.headers?.host || "127.0.0.1"}${request.url || "/"}`, {
    method,
    headers,
    ...(body ? { body, duplex: "half" } : {}),
  });
}

async function sendWebResponse(response, webResponse) {
  if (!(webResponse instanceof Response)) throw new TypeError("Next route did not return a Response.");
  const headers = Object.fromEntries(webResponse.headers.entries());
  headers["x-content-type-options"] ||= "nosniff";
  headers["referrer-policy"] ||= "same-origin";
  const body = Buffer.from(await webResponse.arrayBuffer());
  response.writeHead(webResponse.status, headers);
  response.end(body);
}

export async function createNextProjectHandler({ appsRoot, credentials, chatUrl, routeModules: providedModules }) {
  process.env.AI_HUB_CHAT_URL ||= chatUrl;
  process.env.HUB_CHAT_COMPLETIONS_URL ||= chatUrl;
  process.env.HUB_PROJECT_TOKEN ||= "hub-scoped-runtime";
  const routeModules = providedModules || await loadRouteModules(appsRoot);
  for (const project of projectSpecs) {
    if (project.credentialRequired && !credentials[project.id]?.token) {
      throw new Error(`Missing scoped credential for ${project.id}.`);
    }
    for (const apiPath of Object.keys(project.routes)) {
      if (!routeModules[project.id]?.[apiPath]) throw new Error(`Missing Next route ${project.id}:${apiPath}.`);
    }
  }

  return async function handleNextProject(request, response, pathname) {
    const project = projectSpecs.find((candidate) =>
      pathname === `${candidate.basePath}/api` || pathname.startsWith(`${candidate.basePath}/api/`));
    if (!project) return false;

    const apiPath = stripNextApiPath(pathname, project.basePath);
    const routeModule = routeModules[project.id][apiPath];
    if (!routeModule) {
      await sendWebResponse(response, Response.json({ error: { code: "NOT_FOUND", message: "接口不存在。" } }, { status: 404 }));
      return true;
    }
    const routeHandler = routeModule[request.method || "GET"];
    if (typeof routeHandler !== "function") {
      await sendWebResponse(response, Response.json({ error: { code: "METHOD_NOT_ALLOWED", message: "请求方法不支持。" } }, { status: 405 }));
      return true;
    }
    const webRequest = await toWebRequest(request);
    const fallbackRequest = project.id === "idol-match-test" && apiPath === "/deepseek-result"
      ? webRequest.clone()
      : null;
    let webResponse = await runWithHubScope(
      { project, credential: credentials[project.id], chatUrl },
      () => routeHandler(webRequest),
    );
    if (fallbackRequest && webResponse.status >= 500) {
      const fallback = buildIdolVisualFallback(await fallbackRequest.json().catch(() => null));
      if (fallback) webResponse = Response.json(fallback);
    }
    await sendWebResponse(response, webResponse);
    return true;
  };
}
