import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  createRemainingProjectHandler,
  remainingProjectAccessSpecs,
  remainingProjectIds,
  runWithHubScope,
} from "./remaining-projects.mjs";
import { createNativeProjectHandler, nativeProjectAccessSpecs, nativeProjectIds } from "./native-projects.mjs";
import { createNextProjectHandler, nextProjectAccessSpecs, nextProjectIds } from "./next-projects.mjs";

const runtimeRoot = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_APPS_ROOT = path.resolve(runtimeRoot, "../../apps");
const DEFAULT_CREDENTIALS_PATH = path.resolve(runtimeRoot, "../../.local-runtime/shared-project-credentials.json");
const DEFAULT_HUB_CHAT_URL = "http://127.0.0.1:4194/hub/api/v1/chat/completions";
const DEFAULT_PORT = 4195;
const MAX_BODY_BYTES = 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 90_000;

const securityHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "same-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

const cookingProviders = [
  { id: "openai", label: "GPT · AI Routing", model: "", models: [] },
];

const projectSpecs = {
  villain: {
    id: "ai-life-villain-generator",
    basePath: "/villain",
  },
  parallel: {
    id: "ai-parallel-universe-daily",
    basePath: "/parallel-daily",
  },
  tone: {
    id: "ai-tone-dressing-room",
    basePath: "/tone",
  },
  cooking: {
    id: "ai-cooking-coach",
    basePath: "/cooking",
  },
  life: {
    id: "ai-counterfactual-life-simulator",
    basePath: "/life",
  },
  board: {
    id: "ai-one-person-board",
    basePath: "/board",
  },
  anti: {
    id: "ai-anti-motivation-coach",
    basePath: "/anti-coach",
  },
  misunderstanding: {
    id: "ai-misunderstanding-simulator",
    basePath: "/misunderstanding",
  },
};

export function projectIds() {
  return [
    ...Object.values(projectSpecs).map((project) => project.id),
    ...remainingProjectIds(),
    ...nativeProjectIds(),
    ...nextProjectIds(),
  ];
}

function moduleUrl(appsRoot, projectId, relativePath) {
  return pathToFileURL(path.join(appsRoot, projectId, "dist-server", relativePath)).href;
}

function appModuleUrl(appsRoot, projectId, relativePath) {
  return pathToFileURL(path.join(appsRoot, projectId, relativePath)).href;
}

async function loadProjects(appsRoot) {
  const villain = projectSpecs.villain;
  const parallel = projectSpecs.parallel;
  const tone = projectSpecs.tone;
  const life = projectSpecs.life;
  const board = projectSpecs.board;
  const anti = projectSpecs.anti;
  const misunderstanding = projectSpecs.misunderstanding;
  const cooking = projectSpecs.cooking;

  const [
    villainContracts,
    villainDemo,
    villainGateway,
    villainHub,
    villainSafety,
    parallelContracts,
    parallelDemo,
    parallelGateway,
    parallelHub,
    toneContracts,
    toneGateway,
    toneHub,
    lifeContracts,
    lifeDemo,
    lifeGateway,
    lifeHub,
    boardContracts,
    boardDemo,
    boardGateway,
    boardHub,
    antiContracts,
    antiDemo,
    antiGateway,
    antiHub,
    antiSafety,
    misunderstandingContracts,
    misunderstandingGateway,
    misunderstandingHub,
    cookingPlan,
    cookingAgent,
    cookingAdjustment,
    cookingReview,
  ] = await Promise.all([
    import(moduleUrl(appsRoot, villain.id, "src/shared/contracts.js")),
    import(moduleUrl(appsRoot, villain.id, "server/demo.js")),
    import(moduleUrl(appsRoot, villain.id, "server/providerGateway.js")),
    import(moduleUrl(appsRoot, villain.id, "server/hubModels.js")),
    import(moduleUrl(appsRoot, villain.id, "server/safety.js")),
    import(moduleUrl(appsRoot, parallel.id, "src/shared/contracts.js")),
    import(moduleUrl(appsRoot, parallel.id, "server/localDemo.js")),
    import(moduleUrl(appsRoot, parallel.id, "server/providerGateway.js")),
    import(moduleUrl(appsRoot, parallel.id, "server/hubModels.js")),
    import(moduleUrl(appsRoot, tone.id, "src/shared/contracts.js")),
    import(moduleUrl(appsRoot, tone.id, "server/providerGateway.js")),
    import(moduleUrl(appsRoot, tone.id, "server/hubModels.js")),
    import(moduleUrl(appsRoot, life.id, "src/shared/contracts.js")),
    import(moduleUrl(appsRoot, life.id, "server/localDemo.js")),
    import(moduleUrl(appsRoot, life.id, "server/providerGateway.js")),
    import(moduleUrl(appsRoot, life.id, "server/hubModels.js")),
    import(moduleUrl(appsRoot, board.id, "src/shared/contracts.js")),
    import(moduleUrl(appsRoot, board.id, "server/board.js")),
    import(moduleUrl(appsRoot, board.id, "server/providerGateway.js")),
    import(moduleUrl(appsRoot, board.id, "server/hubModels.js")),
    import(moduleUrl(appsRoot, anti.id, "src/shared/contracts.js")),
    import(moduleUrl(appsRoot, anti.id, "server/demo.js")),
    import(moduleUrl(appsRoot, anti.id, "server/providerGateway.js")),
    import(moduleUrl(appsRoot, anti.id, "server/hubModels.js")),
    import(moduleUrl(appsRoot, anti.id, "server/safety.js")),
    import(moduleUrl(appsRoot, misunderstanding.id, "src/shared/contracts.js")),
    import(moduleUrl(appsRoot, misunderstanding.id, "server/providerGateway.js")),
    import(moduleUrl(appsRoot, misunderstanding.id, "server/hubModels.js")),
    import(appModuleUrl(appsRoot, cooking.id, "src/server/plan-response.mjs")),
    import(appModuleUrl(appsRoot, cooking.id, "src/server/agent-response.mjs")),
    import(appModuleUrl(appsRoot, cooking.id, "src/server/meal-adjustment-response.mjs")),
    import(appModuleUrl(appsRoot, cooking.id, "src/server/week-review-response.mjs")),
  ]);

  return {
    villain: {
      ...villain,
      contracts: villainContracts,
      demo: villainDemo,
      gateway: villainGateway,
      hub: villainHub,
      safety: villainSafety,
    },
    parallel: {
      ...parallel,
      contracts: parallelContracts,
      demo: parallelDemo,
      gateway: parallelGateway,
      hub: parallelHub,
    },
    tone: {
      ...tone,
      contracts: toneContracts,
      gateway: toneGateway,
      hub: toneHub,
    },
    life: {
      ...life,
      contracts: lifeContracts,
      demo: lifeDemo,
      gateway: lifeGateway,
      hub: lifeHub,
      requestSchema: lifeContracts.generateRequestSchema,
      buildDemo: lifeDemo.demoCounterfactualResult,
      requestPaths: ["/life/api/generate"],
      demoMode: "local_preview",
    },
    board: {
      ...board,
      contracts: boardContracts,
      demo: boardDemo,
      gateway: boardGateway,
      hub: boardHub,
      requestSchema: boardContracts.generateRequestSchema,
      buildDemo: boardDemo.buildDemoBoardReport,
      requestPaths: ["/board/api/generate"],
      demoMode: "demo",
    },
    anti: {
      ...anti,
      contracts: antiContracts,
      demo: antiDemo,
      gateway: antiGateway,
      hub: antiHub,
      safety: antiSafety,
    },
    misunderstanding: {
      ...misunderstanding,
      contracts: misunderstandingContracts,
      gateway: misunderstandingGateway,
      hub: misunderstandingHub,
      requestSchema: misunderstandingContracts.analyzeRequestSchema,
      requestPaths: ["/misunderstanding/api/analyze", "/misunderstanding/api/generate"],
      hubOnly: true,
    },
    cooking: {
      ...cooking,
      plan: cookingPlan,
      agent: cookingAgent,
      adjustment: cookingAdjustment,
      review: cookingReview,
    },
  };
}

export function extractHubText(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.output_text === "string") return payload.output_text.trim();

  const firstChoice = Array.isArray(payload.choices)
    ? payload.choices.find((choice) => choice && typeof choice === "object")
    : undefined;
  const content = firstChoice?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (typeof firstChoice?.text === "string") return firstChoice.text.trim();

  if (Array.isArray(payload.content)) {
    return payload.content
      .map((part) => (part && typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function hubErrorMessage(payload) {
  if (payload?.error && typeof payload.error.message === "string") {
    return payload.error.message;
  }
  if (typeof payload?.error === "string") return payload.error;
  if (typeof payload?.message === "string") return payload.message;
  return "AI Hub 模型调用失败。";
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

export function buildHubPayload(payload) {
  return {
    provider: payload.provider,
    model: payload.model,
    messages: payload.messages,
    temperature: payload.temperature,
    max_tokens: payload.maxTokens,
    response_format: { type: "json_object" },
    stream: false,
  };
}

function createHubCaller(project, credential, chatUrl) {
  return async function callHubChat(payload) {
    let response;
    try {
      response = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hub-project-id": project.id,
          "x-hub-project-token": credential.token,
          "x-hub-project-path": project.basePath,
        },
        body: JSON.stringify(buildHubPayload(payload)),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch {
      throw new project.hub.HubModelError(
        "HUB_NETWORK_ERROR",
        "无法连接 AI Hub 模型网关。",
        502,
      );
    }

    const responsePayload = await readJsonResponse(response);
    if (!response.ok) {
      throw new project.hub.HubModelError(
        "HUB_MODEL_ERROR",
        hubErrorMessage(responsePayload),
        response.status >= 500 ? 502 : response.status,
      );
    }

    const text = extractHubText(responsePayload);
    if (!text) {
      throw new project.hub.HubModelError(
        "EMPTY_MODEL_OUTPUT",
        "AI Hub 返回了空内容。",
        502,
      );
    }
    return text;
  };
}

export function createScopedFetch(project, credential, fetchImpl = fetch, chatUrl = DEFAULT_HUB_CHAT_URL) {
  return async function scopedFetch(input, options = {}) {
    const inputUrl = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
    let sourceUrl;
    let hubUrl;
    try {
      sourceUrl = new URL(inputUrl);
      hubUrl = new URL(chatUrl);
    } catch {
      return fetchImpl(input, options);
    }
    if (sourceUrl.origin !== hubUrl.origin) return fetchImpl(input, options);

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(options.headers).forEach((value, key) => headers.set(key, value));
    headers.set("x-hub-project-id", project.id);
    headers.set("x-hub-project-token", credential.token);
    headers.set("x-hub-project-path", project.basePath);

    const target = sourceUrl.pathname.endsWith("/api/v1/chat/completions") ? chatUrl : input;
    return fetchImpl(target, { ...options, headers });
  };
}

export function normalizeRequestPath(requestUrl, host = "127.0.0.1") {
  return decodeURIComponent(new URL(requestUrl || "/", `http://${host}`).pathname);
}

export function projectModelSelectionUrl(chatUrl) {
  const url = new URL(chatUrl);
  const marker = "/api/";
  const markerIndex = url.pathname.lastIndexOf(marker);
  const apiPath = markerIndex >= 0 ? url.pathname.slice(0, markerIndex + marker.length - 1) : "/api";
  url.pathname = `${apiPath}/project-model-selection`;
  url.search = "";
  url.hash = "";
  return url.href;
}

async function handleProjectModelSelection(request, response, pathname, projects, credentials, chatUrl) {
  const project = projects.find((candidate) => pathname === `${candidate.basePath}/api/model-selection`);
  if (!project) return false;
  if (request.method !== "GET" && request.method !== "PUT") {
    sendJson(response, 405, {
      error: { code: "METHOD_NOT_ALLOWED", message: "Only GET and PUT are supported." },
    });
    return true;
  }

  const credential = credentials[project.id];
  if (!credential?.token) {
    sendJson(response, 503, {
      error: { code: "PROJECT_CREDENTIAL_MISSING", message: "AI Hub project access is unavailable." },
    });
    return true;
  }

  const upstream = await fetch(projectModelSelectionUrl(chatUrl), {
    method: request.method,
    headers: {
      accept: "application/json",
      ...(request.method === "PUT" ? { "content-type": "application/json" } : {}),
      "x-hub-project-id": project.id,
      "x-hub-project-token": credential.token,
      "x-hub-project-path": project.basePath,
    },
    body: request.method === "PUT" ? JSON.stringify(await readJsonBody(request)) : undefined,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  sendJson(response, upstream.status, await readJsonResponse(upstream));
  return true;
}

export function unifiedProviderPayload(selection = {}) {
  const model = typeof selection.model === "string" ? selection.model.trim() : "";
  if (!/^gpt-/i.test(model)) {
    return {
      providers: [],
      configured: false,
      defaultProvider: "",
      hubUrl: "/hub/key-config/",
    };
  }

  const providerId = "openai";
  const label = "GPT · AI Routing";
  const provider = {
    id: providerId,
    provider: providerId,
    name: label,
    label,
    adapter: "ai-routing-project-selection",
    model,
    defaultModel: model,
    models: [model],
    enabledModels: [model],
    enabled: true,
    configured: true,
  };
  return {
    providers: [provider],
    configured: true,
    defaultProvider: providerId,
    hubUrl: "/hub/",
  };
}

async function handleProjectProviderCatalog(request, response, pathname, projects, credentials, chatUrl) {
  const project = projects.find((candidate) => pathname === `${candidate.basePath}/api/providers`);
  if (!project) return false;
  if (request.method !== "GET") {
    sendJson(response, 405, {
      error: { code: "METHOD_NOT_ALLOWED", message: "Only GET is supported." },
    });
    return true;
  }

  const credential = credentials[project.id];
  if (!credential?.token) {
    sendJson(response, 503, {
      error: { code: "PROJECT_CREDENTIAL_MISSING", message: "AI Hub project access is unavailable." },
    });
    return true;
  }

  const upstream = await fetch(projectModelSelectionUrl(chatUrl), {
    headers: {
      accept: "application/json",
      "x-hub-project-id": project.id,
      "x-hub-project-token": credential.token,
      "x-hub-project-path": project.basePath,
    },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  const payload = await readJsonResponse(upstream);
  if (!upstream.ok) {
    sendJson(response, upstream.status, payload);
    return true;
  }
  sendJson(response, 200, unifiedProviderPayload(payload));
  return true;
}

export function isMainModule(importMetaUrl, argvPath, resolveRealPath = realpathSync) {
  if (!argvPath) return false;
  try {
    return resolveRealPath(fileURLToPath(importMetaUrl)) === resolveRealPath(path.resolve(argvPath));
  } catch {
    return false;
  }
}

async function readJsonBody(request) {
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
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("请求内容不是有效的 JSON。");
    error.status = 400;
    error.code = "INVALID_JSON";
    throw error;
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, securityHeaders);
  response.end(JSON.stringify(payload));
}

function validationError(parsed) {
  return {
    error: {
      code: "VALIDATION_ERROR",
      message: "输入信息不完整或格式不正确。",
      details: parsed.error.flatten(),
    },
  };
}

function demoProvider(contracts, labelKey = "name") {
  return {
    id: "demo",
    [labelKey]: contracts.providerLabels.demo,
    name: contracts.providerLabels.demo,
    defaultModel: contracts.defaultModels.demo,
    models: [...contracts.modelSuggestions.demo],
    enabled: true,
    configured: true,
  };
}

async function providerPayload(project, credential, chatUrl, labelKey = "name", includeDemo = true) {
  const hubProviders = await runWithHubScope(
    { project, credential, chatUrl },
    () => project.hub.getProviderCatalog(),
  );
  const providers = [
    ...(includeDemo ? [demoProvider(project.contracts, labelKey)] : []),
    ...hubProviders.map((provider) => ({
      ...provider,
      ...(labelKey === "label" ? { label: provider.name } : {}),
    })),
  ];
  return {
    providers,
    configured: hubProviders.some((provider) => provider.enabled && provider.configured),
    hubUrl: "/hub/#models",
  };
}

function generationMeta(input, mode, model = input.model) {
  return {
    provider: input.provider,
    model,
    mode,
    generatedAt: new Date().toISOString(),
  };
}

async function handleVillain(request, response, project, credential, pathname, chatUrl) {
  if (pathname === "/villain/api/health" && request.method === "GET") {
    sendJson(response, 200, { ok: true, app: project.id, runtime: "shared-static-pilot" });
    return true;
  }
  if (pathname === "/villain/api/providers" && request.method === "GET") {
    sendJson(response, 200, await providerPayload(project, credential, chatUrl, "name", false));
    return true;
  }
  if (pathname === "/villain/api/generate" && request.method === "POST") {
    const parsed = project.contracts.generateRequestSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      sendJson(response, 422, validationError(parsed));
      return true;
    }
    const input = parsed.data;
    const isSafety = project.safety.needsSafetyMode(input);
    const generated =
      isSafety
        ? null
        : await project.gateway.generateWithProvider(input, {
            callModel: createHubCaller(project, credential, chatUrl),
          });
    const data = isSafety
      ? project.safety.buildSafetyResult(input)
      : generated.data;
    const meta = generationMeta(input, isSafety ? "safety" : "model");
    if (generated) {
      meta.quality = {
        score: generated.quality.score,
        passed: generated.quality.passed,
        rewritten: generated.rewritten,
        issues: generated.quality.issues.map((issue) => issue.code),
      };
    }
    sendJson(response, 200, { data, meta });
    return true;
  }
  return false;
}

async function handleParallel(request, response, project, credential, pathname, chatUrl) {
  if (pathname === "/parallel-daily/api/health" && request.method === "GET") {
    sendJson(response, 200, { ok: true, app: project.id, runtime: "shared-static-pilot" });
    return true;
  }
  if (pathname === "/parallel-daily/api/providers" && request.method === "GET") {
    sendJson(response, 200, await providerPayload(project, credential, chatUrl, "label"));
    return true;
  }
  if (pathname === "/parallel-daily/api/reports" && request.method === "POST") {
    const parsed = project.contracts.generateRequestSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      sendJson(response, 422, validationError(parsed));
      return true;
    }
    const input = parsed.data;
    const isDemo = input.provider === "demo";
    const data = isDemo
      ? project.demo.demoParallelDaily(input)
      : await project.gateway.generateWithProvider(input, {
          callModel: createHubCaller(project, credential, chatUrl),
        });
    sendJson(response, 200, {
      data,
      meta: generationMeta(input, isDemo ? "local_preview" : "model"),
    });
    return true;
  }
  return false;
}

async function handleTone(request, response, project, credential, pathname, chatUrl) {
  if (pathname === "/tone/api/health" && request.method === "GET") {
    sendJson(response, 200, { ok: true, app: project.id, runtime: "shared-static-pilot" });
    return true;
  }
  if (pathname === "/tone/api/providers" && request.method === "GET") {
    sendJson(response, 200, await providerPayload(project, credential, chatUrl));
    return true;
  }
  if (pathname === "/tone/api/rewrite" && request.method === "POST") {
    const parsed = project.contracts.rewriteRequestSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      sendJson(response, 422, validationError(parsed));
      return true;
    }
    const input = parsed.data;
    const generated = await project.gateway.generateRewrite(input, {
      callModel: createHubCaller(project, credential, chatUrl),
    });
    sendJson(response, 200, {
      data: generated.result,
      meta: {
        ...generationMeta(input, input.provider === "demo" ? "demo" : "model", generated.model),
        keyMode: input.provider === "demo" ? "none" : input.apiKeyMode,
      },
    });
    return true;
  }
  return false;
}

function healthPayload(project, extras = {}) {
  return {
    ok: true,
    app: project.id,
    runtime: "shared-static-pilot",
    providers: project.contracts.providerLabels,
    defaultModels: project.contracts.defaultModels,
    modelSuggestions: project.contracts.modelSuggestions,
    ...extras,
  };
}

export function shouldUseVisualFallback(error) {
  return Number.isInteger(error?.status) && error.status >= 500 && error.status <= 599;
}

async function handleStandardGenerator(request, response, project, credential, pathname, chatUrl) {
  if (pathname === `${project.basePath}/api/health` && request.method === "GET") {
    sendJson(response, 200, healthPayload(project));
    return true;
  }
  if (pathname === `${project.basePath}/api/providers` && request.method === "GET") {
    sendJson(response, 200, await providerPayload(project, credential, chatUrl, "name", !project.hubOnly));
    return true;
  }
  if (project.requestPaths.includes(pathname) && request.method === "POST") {
    const parsed = project.requestSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      sendJson(response, 422, validationError(parsed));
      return true;
    }
    const input = parsed.data;
    if (project.hubOnly) {
      const data = await project.gateway.generateWithProvider(input, {
        callModel: createHubCaller(project, credential, chatUrl),
      });
      sendJson(response, 200, {
        data,
        meta: generationMeta(input, "model"),
      });
      return true;
    }
    const isDemo = input.provider === "demo";
    let mode = isDemo ? project.demoMode : "model";
    let warning;
    let data;
    if (isDemo) {
      data = project.buildDemo(input);
    } else {
      try {
        data = await project.gateway.generateWithProvider(input, {
          callModel: createHubCaller(project, credential, chatUrl),
        });
      } catch (error) {
        if (!shouldUseVisualFallback(error)) throw error;
        console.warn(`${project.id} model output was unavailable; using visual fallback.`);
        data = project.buildDemo(input);
        mode = "fallback";
        warning = "实时模型暂未返回完整结构，已切换为本地可视化结果。";
      }
    }
    sendJson(response, 200, {
      data,
      meta: generationMeta(input, mode),
      ...(warning ? { warning } : {}),
    });
    return true;
  }
  return false;
}

async function handleAntiCoach(request, response, project, credential, pathname, chatUrl) {
  if (pathname === "/anti-coach/api/health" && request.method === "GET") {
    sendJson(response, 200, healthPayload(project, { styles: project.contracts.styleLabels }));
    return true;
  }
  if (pathname === "/anti-coach/api/providers" && request.method === "GET") {
    sendJson(response, 200, await providerPayload(project, credential, chatUrl));
    return true;
  }
  if (pathname === "/anti-coach/api/generate" && request.method === "POST") {
    const parsed = project.contracts.generateRequestSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      sendJson(response, 422, validationError(parsed));
      return true;
    }
    const input = parsed.data;
    const isSafety = project.safety.needsSafetyMode(input.userText);
    const isDemo = input.provider === "demo";
    let generated = null;
    let fallback = false;
    if (!isSafety && !isDemo) {
      try {
        generated = await project.gateway.generateWithProvider(input, {
          callModel: createHubCaller(project, credential, chatUrl),
        });
      } catch (error) {
        if (!shouldUseVisualFallback(error)) throw error;
        console.warn(`${project.id} model output was unavailable; using visual fallback.`);
        fallback = true;
      }
    }
    const data = isSafety
      ? project.safety.buildSafetyResult(input)
      : isDemo || fallback
        ? project.demo.buildDemoResult(input)
        : generated.data;
    const meta = generationMeta(
      input,
      isSafety ? "safety" : isDemo ? "demo" : fallback ? "fallback" : "model",
    );
    if (generated) {
      meta.quality = {
        score: generated.quality.score,
        passed: generated.quality.passed,
        rewritten: generated.rewritten,
        issues: generated.quality.issues.map((issue) => issue.code),
      };
    }
    sendJson(response, 200, {
      data,
      meta,
      ...(fallback ? { warning: "实时模型暂未返回完整结构，已切换为本地可视化结果。" } : {}),
    });
    return true;
  }
  return false;
}

function stringList(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
    : [];
}

async function cookingProvidersPayload(project, credential, chatUrl) {
  const fallback = cookingProviders.map((provider) => ({
    ...provider,
    provider: provider.id,
    enabledModels: [],
    enabled: false,
    configured: false,
  }));
  try {
    const configUrl = process.env.HUB_MODEL_CONFIG_URL || new URL("/hub/api/model-config", chatUrl).href;
    const response = await createScopedFetch(project, credential, fetch, chatUrl)(configUrl, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    const config = await response.json();
    if (!response.ok || !Array.isArray(config?.providers)) throw new Error("Invalid Hub config response.");
    const byId = new Map(config.providers.map((provider) => [provider?.id, provider]));
    const providers = cookingProviders.map((fallbackProvider) => {
      const provider = byId.get(fallbackProvider.id) || {};
      const enabledModels = stringList(provider.enabledModels);
      const models = stringList([...(provider.models || []), ...fallbackProvider.models]);
      return {
        id: fallbackProvider.id,
        provider: fallbackProvider.id,
        label: typeof provider.label === "string" ? provider.label : fallbackProvider.label,
        model: typeof provider.model === "string" ? provider.model : enabledModels[0] || fallbackProvider.model,
        models,
        enabledModels,
        enabled: Boolean(provider.enabled),
        configured: Boolean(provider.enabled && provider.configured),
      };
    });
    const defaultProvider = "openai";
    return {
      providers,
      configured: providers.some((provider) => provider.configured),
      defaultProvider,
      hubUrl: "/hub/#models",
    };
  } catch {
    return { providers: fallback, configured: false, defaultProvider: "openai", hubUrl: "/hub/key-config/" };
  }
}

async function handleCooking(request, response, project, credential, pathname, chatUrl) {
  if (pathname === "/cooking/api/health" && request.method === "GET") {
    sendJson(response, 200, { ok: true, app: project.id, runtime: "shared-static-pilot" });
    return true;
  }
  if (pathname === "/cooking/api/providers" && request.method === "GET") {
    sendJson(response, 200, await cookingProvidersPayload(project, credential, chatUrl));
    return true;
  }
  if (pathname === "/cooking/api/agent" && request.method === "GET") {
    sendJson(response, 200, project.agent.createAgentResponse());
    return true;
  }

  const responseFactories = {
    "/cooking/api/plan": project.plan.createPlanResponse,
    "/cooking/api/adjust-meal": project.adjustment.createMealAdjustmentResponse,
    "/cooking/api/review-week": project.review.createWeekReviewResponse,
  };
  const createResponse = responseFactories[pathname];
  if (createResponse && request.method === "POST") {
    try {
      const payload = await createResponse(await readJsonBody(request), {
        fetchImpl: createScopedFetch(project, credential, fetch, chatUrl),
      });
      sendJson(response, 200, payload);
    } catch (error) {
      sendJson(response, error?.status || 500, project.plan.errorToPayload(error));
    }
    return true;
  }
  return false;
}

function safeError(error) {
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
    ? error.status
    : 500;
  const code = typeof error?.code === "string" ? error.code : "INTERNAL_ERROR";
  const message =
    typeof error?.message === "string" && (status < 500 || code !== "INTERNAL_ERROR")
      ? error.message
      : "共享项目接口发生未知错误。";
  return { status, body: { error: { code, message, details: error?.details } } };
}

async function loadCredentials(credentialsPath) {
  const parsed = JSON.parse(await readFile(credentialsPath, "utf8"));
  const credentials = {};
  for (const [projectId, value] of Object.entries(parsed?.projects || {})) {
    if (typeof value?.token === "string" && value.token.length >= 20) {
      credentials[projectId] = { token: value.token };
    }
  }
  for (const spec of Object.values(projectSpecs)) {
    if (!credentials[spec.id]) {
      throw new Error(`Missing scoped credential for ${spec.id}.`);
    }
  }
  return credentials;
}

export async function startServer(options = {}) {
  const appsRoot = options.appsRoot || process.env.AIHUB_APPS_ROOT || DEFAULT_APPS_ROOT;
  const credentialsPath =
    options.credentialsPath || process.env.AIHUB_SHARED_CREDENTIALS_PATH || DEFAULT_CREDENTIALS_PATH;
  const chatUrl = options.chatUrl || process.env.HUB_CHAT_COMPLETIONS_URL || DEFAULT_HUB_CHAT_URL;
  const port = Number(options.port || process.env.PORT || DEFAULT_PORT);
  const adapterRoot = options.adapterRoot || path.join(path.dirname(fileURLToPath(import.meta.url)), "adapters");
  const [projects, credentials] = await Promise.all([
    loadProjects(appsRoot),
    loadCredentials(credentialsPath),
  ]);
  const handleRemainingProject = await createRemainingProjectHandler({
    adapterRoot,
    appsRoot,
    credentials,
    chatUrl,
  });
  const handleNativeProject = await createNativeProjectHandler({
    appsRoot,
    credentials,
    chatUrl,
  });
  const handleNextProject = await createNextProjectHandler({
    appsRoot,
    credentials,
    chatUrl,
  });
  const modelSelectionProjects = [
    ...Object.values(projectSpecs).map(({ id, basePath }) => ({ id, basePath })),
    ...remainingProjectAccessSpecs(),
    ...nativeProjectAccessSpecs(),
    ...nextProjectAccessSpecs(),
  ];

  const server = createServer(async (request, response) => {
    try {
      const pathname = normalizeRequestPath(request.url, request.headers.host);
      if (pathname === "/health" && request.method === "GET") {
        sendJson(response, 200, {
          ok: true,
          runtime: "shared-static-pilot",
          projects: projectIds(),
        });
        return;
      }

      if (
        await handleProjectModelSelection(
          request,
          response,
          pathname,
          modelSelectionProjects,
          credentials,
          chatUrl,
        )
      ) return;

      if (
        await handleProjectProviderCatalog(
          request,
          response,
          pathname,
          modelSelectionProjects,
          credentials,
          chatUrl,
        )
      ) return;

      if (await handleRemainingProject(request, response, pathname)) return;
      if (await handleNativeProject(request, response, pathname)) return;
      if (await handleNextProject(request, response, pathname)) return;

      const handled =
        (await handleVillain(
          request,
          response,
          projects.villain,
          credentials[projects.villain.id],
          pathname,
          chatUrl,
        )) ||
        (await handleParallel(
          request,
          response,
          projects.parallel,
          credentials[projects.parallel.id],
          pathname,
          chatUrl,
        )) ||
        (await handleTone(
          request,
          response,
          projects.tone,
          credentials[projects.tone.id],
          pathname,
          chatUrl,
        )) ||
        (await handleCooking(
          request,
          response,
          projects.cooking,
          credentials[projects.cooking.id],
          pathname,
          chatUrl,
        )) ||
        (await handleStandardGenerator(
          request,
          response,
          projects.life,
          credentials[projects.life.id],
          pathname,
          chatUrl,
        )) ||
        (await handleStandardGenerator(
          request,
          response,
          projects.board,
          credentials[projects.board.id],
          pathname,
          chatUrl,
        )) ||
        (await handleAntiCoach(
          request,
          response,
          projects.anti,
          credentials[projects.anti.id],
          pathname,
          chatUrl,
        )) ||
        (await handleStandardGenerator(
          request,
          response,
          projects.misunderstanding,
          credentials[projects.misunderstanding.id],
          pathname,
          chatUrl,
        ));

      if (!handled) {
        sendJson(response, 404, { error: { code: "NOT_FOUND", message: "接口不存在。" } });
      }
    } catch (error) {
      console.error(error?.stack || error);
      const { status, body } = safeError(error);
      sendJson(response, status, body);
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  console.log(`Shared static project API listening on http://127.0.0.1:${port}`);
  return server;
}

if (isMainModule(import.meta.url, process.argv[1])) {
  await startServer();
}
