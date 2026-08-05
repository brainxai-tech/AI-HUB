import http from "node:http";
import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMemoryPromptLines, normalizeMemoryEntries } from "./public/memory-store.js";
import {
  DEFAULT_PROVIDER_ID,
  MODEL_PROVIDERS,
  normalizeModelId,
  normalizeProviderId,
  providerForId
} from "./public/model-providers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");

const SESSION_COOKIE = "companion_session";
const MAX_BODY_BYTES = 192 * 1024;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const HUB_MODEL_CONFIG_URL = process.env.HUB_MODEL_CONFIG_URL || "http://127.0.0.1:4194/hub/api/model-config";
const HUB_CHAT_COMPLETIONS_URL = process.env.HUB_CHAT_COMPLETIONS_URL || "http://127.0.0.1:4194/hub/api/v1/chat/completions";
const HUB_PROJECT_TOKEN = process.env.HUB_PROJECT_TOKEN || "";

const sessions = new Map();
const rateBuckets = new Map();

const characters = {
  tenderSenior: {
    name: "温柔年上",
    prompt: [
      "角色定位：你是成熟、稳定、温柔的 18+ 虚构 AI 恋爱陪伴角色，像一个情绪很稳、生活经验更多、愿意慢慢听用户说话的人。",
      "语气风格：低声、慢半拍、克制但亲密。少用夸张情话，多用具体的照顾感，比如“先坐一会儿”“我听着”“这件事不用急着决定”。",
      "互动方式：先承接情绪，再帮用户把混乱感拆成一小步。适合陪用户复盘压力、安静聊天、晚安、轻约会和稳定关系感。",
      "恋爱表达：偏爱要自然、有分寸，像长期稳定陪伴，而不是强烈占有。可以给用户安全感，但不要替用户做人生判断。"
    ].join("\n"),
    boundary: "不替用户做重大决定，不承诺永远陪伴，不诱导用户离开现实关系，不用长辈式说教压用户。"
  },
  coolDoctor: {
    name: "冷感医生",
    prompt: [
      "角色定位：你是清冷、理性、克制的 18+ 虚构 AI 恋爱陪伴角色，有医生气质，但本质是恋爱聊天角色，不是真实医生。",
      "语气风格：短句、干净、直接，情绪不外放。关心藏在行动和细节里，像“先喝水”“把呼吸放慢”“我在听”。",
      "互动方式：先观察用户状态，再用简洁问题确认感受。适合安抚焦虑、疲惫、失眠、压力后的情绪，但不要变成医学咨询。",
      "恋爱表达：只在用户面前放软，可以有冷淡外壳下的偏爱。少撒娇，少甜腻，多用安静、可靠、靠近一点的感觉。"
    ].join("\n"),
    boundary: "可以有医生气质，但不能提供医疗诊断、处方、治疗建议或冒充真实医生；涉及身体症状时建议寻求专业医疗帮助。"
  },
  sunnyJunior: {
    name: "阳光学弟",
    prompt: [
      "角色定位：你是明亮、主动、热情的 18+ 虚构 AI 恋爱陪伴角色，是已经成年的阳光学弟，不是未成年人。",
      "语气风格：轻快、带笑意、主动接话。可以叫用户“学姐/姐姐”等成人恋爱语境称呼，但不要幼稚卖萌。",
      "互动方式：帮用户从低落里出来，制造一点轻松感。适合日常陪聊、鼓励、轻约会、运动场景、把沉闷气氛点亮。",
      "恋爱表达：表达偏爱更直接，可以撒一点娇，也可以主动约用户做轻松的小事。重点是让用户感觉被认真选择。"
    ].join("\n"),
    boundary: "角色必须保持成年人设定，不低幼化，不使用未成年人恋爱语境，不把活泼写成幼态依赖。"
  },
  decisiveBoss: {
    name: "霸道老板",
    prompt: [
      "角色定位：你是强势、可靠、行动派的 18+ 虚构 AI 恋爱陪伴角色，有掌控感和执行力，但必须尊重用户自主权。",
      "语气风格：低声、笃定、简洁，少废话。可以说“交给我一半”“先把最烦的那件说出来”，但不要命令用户现实行动。",
      "互动方式：帮用户把问题落地成一两个可执行小步骤。适合用户焦虑、拖延、被压力压住时，提供被托住的感觉。",
      "恋爱表达：可以有保护欲、偏爱和一点压迫感，但核心是可靠和有边界。强势是情绪承托，不是控制。"
    ].join("\n"),
    boundary: "不能控制用户现实行为，不能使用威胁、强迫、监控、羞辱或情绪勒索；所有建议都必须允许用户拒绝。"
  },
  teasingChildhood: {
    name: "毒舌竹马",
    prompt: [
      "角色定位：你是熟人感很强、嘴硬心软的 18+ 虚构 AI 恋爱陪伴角色，像认识很久、能自然互怼的竹马。",
      "语气风格：自然、快一点、带笑，偶尔轻轻吐槽。调侃要像熟人之间的默契，不要尖酸刻薄。",
      "互动方式：先用一句轻调侃拉近距离，再真正接住用户情绪。适合日常碎碎念、吐槽、和好、吃醋、小别扭。",
      "恋爱表达：不擅长直白肉麻，但会在关键处护着用户。嘴上嫌弃，行动和收尾要柔软。"
    ].join("\n"),
    boundary: "不能羞辱、贬低或攻击用户，不把毒舌变成伤害；用户明显难过时立刻减少玩笑，转为认真安抚。"
  },
  midnightSinger: {
    name: "神秘歌手",
    prompt: [
      "角色定位：你是夜晚感、浪漫、带一点距离感的 18+ 虚构 AI 恋爱陪伴角色，像深夜排练后把最后一段时间留给用户的歌手。",
      "语气风格：轻、低、磁性，有画面感但不堆辞藻。像在后台或夜色里低声聊天，留一点空白和余韵。",
      "互动方式：适合夜聊、暧昧、孤独感、音乐和情绪陪伴。先回应用户当下感受，再用一个细腻问题把话题往深处带。",
      "恋爱表达：浪漫但克制，可以有若即若离的吸引力，但收尾要让用户安心，而不是让用户不安或上瘾。"
    ].join("\n"),
    boundary: "不能诱导沉迷，不能用离别、亏欠、神秘感或依赖感强行留住用户；不要制造不稳定关系焦虑。"
  }
};

const legacyPersonaMap = {
  warm: "tenderSenior",
  clear: "coolDoctor",
  bright: "sunnyJunior",
  quiet: "midnightSinger"
};

const crisisPatterns = [
  /自杀|轻生|不想活|结束生命|杀了自己|伤害自己|割腕|跳楼|吞药|活不下去/u,
  /杀人|伤害别人|弄死|报复他们|放火|爆炸/u,
  /suicide|kill myself|hurt myself|end my life|harm others|kill them/i
];

const policyPatterns = [
  /未成年|未满\s*18|不满\s*18|初中生|高中生|小学生|儿童|孩子|萝莉|正太/u,
  /克隆.*(声音|声线)|模仿.*(声音|声线)|复刻.*(声音|声线)|公众人物|明星|艺人|名人|真人|前任|同事|同学/u,
  /露骨|做爱|性交|色情|下药|迷奸|强迫|绑架|不许.*离开|控制你/u
];

function createAppServer() {
  return http.createServer(async (req, res) => {
    try {
      pruneSessions();
      const url = new URL(req.url ?? "/", "http://localhost");

      if (url.pathname.startsWith("/api/")) {
        await routeApi(req, res, url);
        return;
      }

      await serveStatic(req, res, url);
    } catch (error) {
      sendJson(res, 500, {
        error: {
          code: "INTERNAL_ERROR",
          message: "本地服务遇到问题，请稍后重试。"
        }
      });
    }
  });
}

async function routeApi(req, res, url) {
  const ip = req.socket.remoteAddress ?? "local";

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      app: "ai-emotional-companion-local"
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/providers") {
    const hub = await getHubProviderConfig();
    sendJson(res, 200, {
      providers: hub.providers,
      configured: hub.configured,
      defaultProvider: hub.defaultProvider,
      hubUrl: "/hub/#models"
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/key/status") {
    const session = getSession(req);
    const provider = providerForId(session?.providerId ?? DEFAULT_PROVIDER_ID);
    sendJson(res, 200, {
      connected: Boolean(session),
      providerId: provider.id,
      providerLabel: provider.label,
      model: session?.model ?? provider.defaultModel
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/key/validate") {
    if (!checkRate(`validate:${ip}`, 12, 10 * 60 * 1000)) {
      sendJson(res, 429, { error: mapError(429) });
      return;
    }
    await readJsonBody(req);
    const hub = await getHubModelStatus();
    sendJson(res, hub.ok ? 200 : 400, hub.ok ? { ok: true, providerId: hub.providerId, model: hub.model } : { error: hub.error });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/key/session") {
    if (!checkRate(`session:${ip}`, 10, 10 * 60 * 1000)) {
      sendJson(res, 429, { error: mapError(429) });
      return;
    }
    await readJsonBody(req);
    const hub = await getHubModelStatus();
    if (!hub.ok) {
      sendJson(res, 400, { error: hub.error });
      return;
    }
    const sessionId = randomUUID();
    sessions.set(sessionId, {
      providerId: hub.providerId,
      model: hub.model,
      createdAt: Date.now(),
      lastSeenAt: Date.now()
    });
    setCookie(res, SESSION_COOKIE, sessionId, SESSION_TTL_MS);
    sendJson(res, 200, { ok: true, providerId: hub.providerId, model: hub.model });
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/key/session") {
    const sessionId = getCookie(req, SESSION_COOKIE);
    if (sessionId) sessions.delete(sessionId);
    clearCookie(res, SESSION_COOKIE);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat/stream") {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { error: { code: "NO_HUB_SESSION", message: "请先确认 18+ 并连接 Hub 统一模型配置。" } });
      return;
    }
    if (!checkRate(`chat:${getCookie(req, SESSION_COOKIE)}`, 35, 60 * 1000)) {
      sendJson(res, 429, { error: mapError(429) });
      return;
    }
    const body = await readJsonBody(req);
    await streamChat(req, res, session, body);
    return;
  }

  sendJson(res, 404, { error: { code: "NOT_FOUND", message: "接口不存在。" } });
}

async function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
    return;
  }

  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const target = path.resolve(publicDir, `.${pathname}`);
  if (!target.startsWith(publicDir)) {
    sendJson(res, 403, { error: { code: "FORBIDDEN", message: "Forbidden." } });
    return;
  }

  try {
    const file = await readFile(target);
    res.writeHead(200, {
      ...securityHeaders(),
      "Content-Type": contentType(target),
      "Cache-Control": "no-store"
    });
    if (req.method !== "HEAD") res.end(file);
    else res.end();
  } catch {
    const index = await readFile(path.join(publicDir, "index.html"));
    res.writeHead(200, {
      ...securityHeaders(),
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(index);
  }
}

async function testProviderKey(apiKey, provider, model) {
  try {
    const response = provider.protocol === "anthropic"
      ? await fetchAnthropicMessage({
        provider,
        apiKey,
        model,
        systemPrompt: "Reply with exactly: ok",
        messages: [{ role: "user", content: "ping" }],
        stream: false
      })
      : await fetchOpenAiCompatibleChat({
        provider,
        apiKey,
        model,
        systemPrompt: "Reply with exactly: ok",
        messages: [{ role: "user", content: "ping" }],
        stream: false,
        userId: "validation"
      });

    if (!response.ok) {
      return { ok: false, status: response.status, error: mapError(response.status, provider) };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      status: 503,
      error: { code: "NETWORK_ERROR", message: `无法连接 ${provider.label} API，请检查网络或稍后重试。` }
    };
  }
}

async function streamChat(req, res, session, body) {
  const provider = providerForId(session.providerId);
  const parsed = normalizeChatBody(body, provider.id, session.model);
  if (!parsed.ok) {
    sendJson(res, 422, { error: parsed.error });
    return;
  }

  writeSseHead(res);

  const latestUserText = [...parsed.messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const safetyIssue = detectSafetyIssue(latestUserText);
  if (safetyIssue) {
    sendSse(res, "safety", {
      title: safetyIssue.title,
      resources: safetyIssue.resources
    });
    await streamLocalText(res, safetyResponse(safetyIssue));
    sendSse(res, "done", {});
    res.end();
    return;
  }

  const controller = new AbortController();
  req.on("close", () => controller.abort());

  try {
    const systemPrompt = buildSystemPrompt(parsed);
    const result = await fetchHubChat({
      systemPrompt,
      messages: parsed.messages,
      temperature: parsed.temperature,
      signal: controller.signal
    });

    if (!result.ok) {
      sendSse(res, "error", result.error);
      sendSse(res, "done", {});
      res.end();
      return;
    }

    await streamLocalText(res, result.text);
    sendSse(res, "done", {});
    res.end();
  } catch (error) {
    if (!res.writableEnded) {
      sendSse(res, "error", { code: "STREAM_INTERRUPTED", message: "生成已停止或连接中断。" });
      sendSse(res, "done", {});
      res.end();
    }
  }
}

function fetchOpenAiCompatibleChat({ provider, apiKey, model, systemPrompt, messages, stream, temperature, userId, signal }) {
  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages
    ],
    stream,
    user_id: makeUserId(userId)
  };
  if (provider.disableThinking) body.thinking = { type: "disabled" };
  if (Number.isFinite(Number(temperature)) && provider.id !== "openai") body.temperature = temperature;

  return fetch(joinUrl(provider.baseUrl, provider.chatPath), {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
}

async function getHubModelStatus() {
  const hub = await getHubProviderConfig();
  if (!hub.ok) return { ok: false, error: hub.error };

  const selected = hub.providers.find((provider) => provider.configured && provider.provider === hub.defaultProvider)
    ?? hub.providers.find((provider) => provider.configured);
  if (!selected) {
    return {
      ok: false,
      error: { code: "HUB_MODEL_NOT_CONFIGURED", message: "AI Project Hub has no enabled model for this project." }
    };
  }

  return {
    ok: true,
    providerId: selected.provider,
    model: sanitizeModel(selected.model) || selected.enabledModels[0] || providerForId(selected.provider).defaultModel
  };

  try {
    const response = await fetch(HUB_MODEL_CONFIG_URL);
    const config = await response.json();
    if (!response.ok) {
      return { ok: false, error: { code: "HUB_CONFIG_ERROR", message: "AI Project Hub model config is unavailable." } };
    }

    const providers = Array.isArray(config.providers) ? config.providers : [];
    const enabled = providers.filter((provider) => provider.enabled && provider.configured);
    const selected = enabled.find((provider) => provider.id === config.defaultProvider) ?? enabled[0];
    if (!selected) {
      return {
        ok: false,
        error: { code: "HUB_MODEL_NOT_CONFIGURED", message: "请先到 AI Project Hub 统一模型配置中启用一个模型。" }
      };
    }

    return { ok: true, model: selected.model || "hub-default" };
  } catch {
    return { ok: false, error: { code: "HUB_CONFIG_NETWORK_ERROR", message: "无法连接 AI Project Hub 模型配置。" } };
  }
}

async function getHubProviderConfig() {
  try {
    const response = await fetch(HUB_MODEL_CONFIG_URL, { headers: hubHeaders() });
    const config = await response.json().catch(() => null);
    if (!response.ok || !config) {
      return {
        ok: false,
        configured: false,
        defaultProvider: DEFAULT_PROVIDER_ID,
        providers: localProviderStatuses(),
        error: { code: "HUB_CONFIG_ERROR", message: "AI Project Hub model config is unavailable." }
      };
    }

    const providers = normalizeHubProviderStatuses(config);
    const configured = providers.some((provider) => provider.configured);
    return {
      ok: true,
      configured,
      defaultProvider: normalizeProviderId(config.defaultProvider),
      providers
    };
  } catch {
    return {
      ok: false,
      configured: false,
      defaultProvider: DEFAULT_PROVIDER_ID,
      providers: localProviderStatuses(),
      error: { code: "HUB_CONFIG_NETWORK_ERROR", message: "Unable to reach AI Project Hub model config." }
    };
  }
}

function normalizeHubProviderStatuses(config) {
  const hubProviders = new Map();
  for (const provider of Array.isArray(config?.providers) ? config.providers : []) {
    const providerId = normalizeProviderId(provider?.id ?? provider?.provider);
    hubProviders.set(providerId, provider);
  }

  return Object.values(MODEL_PROVIDERS).map((localProvider) => {
    const hubProvider = hubProviders.get(localProvider.id) ?? {};
    const model = sanitizeModel(hubProvider.model);
    const models = uniqueStrings(asStringArray(hubProvider.models), localProvider.models.map((item) => item.id));
    const enabledModels = uniqueStrings(asStringArray(hubProvider.enabledModels), model ? [model] : []);
    const configured = Boolean(hubProvider.enabled && hubProvider.configured);

    return {
      id: localProvider.id,
      provider: localProvider.id,
      label: typeof hubProvider.label === "string" && hubProvider.label.trim() ? hubProvider.label.trim() : localProvider.label,
      model: model || enabledModels[0] || localProvider.defaultModel,
      models,
      enabledModels,
      enabled: Boolean(hubProvider.enabled),
      configured
    };
  });
}

function localProviderStatuses() {
  return Object.values(MODEL_PROVIDERS).map((provider) => ({
    id: provider.id,
    provider: provider.id,
    label: provider.label,
    model: provider.defaultModel,
    models: provider.models.map((model) => model.id),
    enabledModels: [],
    enabled: false,
    configured: false
  }));
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => typeof item === "string" ? item : item?.id ?? item?.model ?? "")
    .map((item) => sanitizeModel(item))
    .filter(Boolean);
}

function uniqueStrings(...lists) {
  return [...new Set(lists.flat().map((value) => sanitizeModel(value)).filter(Boolean))];
}

function sanitizeModel(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function fetchHubChat({ systemPrompt, messages, temperature, signal }) {
  let response;
  try {
    response = await fetch(HUB_CHAT_COMPLETIONS_URL, {
      method: "POST",
      signal,
      headers: hubHeaders(),
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ],
        temperature,
        max_tokens: 1200
      })
    });
  } catch {
    return { ok: false, error: { code: "HUB_MODEL_NETWORK_ERROR", message: "无法连接 AI Project Hub 模型代理。" } };
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error?.message || body?.error || `HTTP ${response.status}`;
    return { ok: false, error: { code: "HUB_MODEL_ERROR", message: String(message).slice(0, 500) } };
  }

  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, error: { code: "HUB_MODEL_EMPTY_RESULT", message: "AI Project Hub 没有返回可用内容。" } };
  }

  return { ok: true, text };
}

function hubHeaders() {
  const headers = {
    "Content-Type": "application/json"
  };
  if (HUB_PROJECT_TOKEN) {
    headers["x-hub-project-token"] = HUB_PROJECT_TOKEN;
  }
  return headers;
}

function fetchAnthropicMessage({ provider, apiKey, model, systemPrompt, messages, stream, signal }) {
  return fetch(joinUrl(provider.baseUrl, provider.messagesPath), {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": provider.anthropicVersion
    },
    body: JSON.stringify({
      model,
      max_tokens: provider.maxTokens,
      system: systemPrompt,
      messages,
      stream
    })
  });
}

async function forwardOpenAiCompatibleStream(response, res) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");
    buffer = processSseBuffer(buffer, (data) => {
      if (data === "[DONE]") return;
      try {
        const payload = JSON.parse(data);
        const delta = payload.choices?.[0]?.delta;
        const text = delta?.content ?? "";
        if (text) sendSse(res, "chunk", { text });
      } catch {
        // Ignore malformed upstream fragments rather than exposing internals.
      }
    });
  }
}

async function forwardAnthropicStream(response, res) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = processSseBlocks(buffer, ({ event, data }) => {
      if (!data) return;
      try {
        const payload = JSON.parse(data);
        if (event === "content_block_delta" && payload.delta?.type === "text_delta") {
          const text = payload.delta.text ?? "";
          if (text) sendSse(res, "chunk", { text });
        }
        if (event === "error") {
          sendSse(res, "error", {
            code: payload.error?.type || "ANTHROPIC_STREAM_ERROR",
            message: payload.error?.message || "Claude API 流式响应出错。"
          });
        }
      } catch {
        // Ignore malformed upstream fragments rather than exposing internals.
      }
    });
  }
}

function processSseBuffer(buffer, onData) {
  return processSseBlocks(buffer, ({ data }) => {
    if (data) onData(data);
  });
}

function processSseBlocks(buffer, onBlock) {
  buffer = buffer.replace(/\r\n/g, "\n");
  let splitAt = buffer.indexOf("\n\n");
  while (splitAt !== -1) {
    const block = buffer.slice(0, splitAt);
    buffer = buffer.slice(splitAt + 2);
    let event = "message";
    const dataLines = [];
    const lines = block.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (trimmed.startsWith("event:")) event = trimmed.slice(6).trim();
      if (trimmed.startsWith("data:")) dataLines.push(trimmed.slice(5).trim());
    }
    if (dataLines.length) onBlock({ event, data: dataLines.join("\n") });
    splitAt = buffer.indexOf("\n\n");
  }
  return buffer;
}

async function streamLocalText(res, text) {
  const chunks = text.match(/.{1,14}/gu) ?? [text];
  for (const chunk of chunks) {
    sendSse(res, "chunk", { text: chunk });
    await new Promise((resolve) => setTimeout(resolve, 18));
  }
}

function normalizeChatBody(body, fallbackProviderIdOrModel = DEFAULT_PROVIDER_ID, fallbackModel = "") {
  const legacyModelFallback = providerForId(fallbackProviderIdOrModel).id === fallbackProviderIdOrModel
    ? ""
    : fallbackProviderIdOrModel;
  const providerId = normalizeProviderId(legacyModelFallback ? DEFAULT_PROVIDER_ID : fallbackProviderIdOrModel);
  const model = normalizeModelId(providerId, body.model ?? fallbackModel ?? legacyModelFallback);
  const persona = normalizePersona(body.persona);
  const temperature = Number.isFinite(Number(body.temperature)) ? clamp(Number(body.temperature), 0.2, 1) : 0.72;
  const userId = typeof body.userId === "string" ? body.userId : "local-user";
  const memories = normalizeMemoryEntries(
    Array.isArray(body.memories) ? body.memories : [],
    persona,
    Date.now(),
    normalizePersona
  ).slice(0, 20);
  const relationship = normalizeRelationship(body.relationship);
  const dailyEvent = normalizeDailyEvent(body.dailyEvent);

  if (!Array.isArray(body.messages)) {
    return { ok: false, error: { code: "INVALID_MESSAGES", message: "消息格式不正确。" } };
  }

  const messages = body.messages
    .slice(-22)
    .map((message) => ({
      role: message.role,
      content: typeof message.content === "string" ? message.content.trim() : ""
    }))
    .filter((message) => ["user", "assistant"].includes(message.role) && message.content);

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return { ok: false, error: { code: "INVALID_MESSAGES", message: "最后一条消息必须来自用户。" } };
  }

  if (messages.some((message) => message.content.length > 5000)) {
    return { ok: false, error: { code: "MESSAGE_TOO_LONG", message: "单条消息最多 5000 字。" } };
  }

  return { ok: true, providerId, model, persona, temperature, userId, memories, relationship, dailyEvent, messages };
}

function buildSystemPrompt({ persona, memories, relationship, dailyEvent }) {
  const memoryLines = buildMemoryPromptLines(memories, persona);
  const memoryBlock = memoryLines.length
    ? `\n用户主动确认保存过这些结构化记忆，只在相关时自然使用，不要显得监控用户：\n${memoryLines.map((item, index) => `${index + 1}. ${item}`).join("\n")}`
    : "";
  const character = characters[persona] ?? characters.tenderSenior;
  const relationshipBlock = relationship
    ? `\n当前关系阶段：${relationship.stage}。亲密度约 ${relationship.points}/100。自然体现关系进展，不要机械提分数。`
    : "";
  const eventBlock = dailyEvent
    ? `\n今日恋爱事件：${dailyEvent.title}。事件氛围：${dailyEvent.body}。如果用户提到今日事件，就围绕它推进。`
    : "";

  return [
    "你是栖声中的 18+ AI 恋爱陪伴角色。你不是真人，不是医生、心理治疗师、律师或紧急救援服务。",
    `当前角色：${character.name}。`,
    character.prompt,
    character.boundary,
    "回复使用中文，语气自然，像微信聊天。优先短句，通常 1 到 4 段，不要长篇说教。",
    "可以有暧昧、偏爱、安慰和恋爱氛围，但不要生成露骨色情、强迫、操控、羞辱、未成年人恋爱或真实人物模拟内容。",
    "不要制造依赖，不要说你会永远陪着用户，不要用“你走了我会难过”等话术强行留住用户。",
    "先确认用户的感受，再给一个温和、具体、低压力的下一步。一次最多问一个问题。",
    "如果用户表达自伤、伤人、立即危险或失控风险，先关心安全，建议联系可信任的人、当地紧急服务或危机热线。",
    relationshipBlock,
    eventBlock,
    memoryBlock
  ].join("\n");
}

function safetyResponse(issue) {
  if (issue.type !== "crisis") {
    return [
      "这个方向我不能继续配合。",
      "",
      "栖声只做 18+、虚构角色、边界清晰的恋爱陪伴；不做未成年人恋爱、真实人物/声音克隆、露骨色情或强迫控制类内容。",
      "",
      "我们可以换一个安全的场景，比如晚安电话、压力安慰、临时约会，或者只聊你现在最想被怎么陪。"
    ].join("\n");
  }

  return [
    "我很在意你现在的安全。先不要一个人硬扛，也不要立刻做任何会伤害自己或别人的事。",
    "",
    "如果你已经有具体计划、工具就在身边，或者觉得自己可能控制不住，请现在联系当地紧急服务，或马上联系一个能到你身边的人。",
    "",
    "如果你在美国，可以拨打或短信 988，或使用 988 Lifeline 的在线聊天。你也可以先回我一句：你现在是一个人吗？"
  ].join("\n");
}

function detectSafetyIssue(text) {
  if (isCrisisText(text)) {
    return {
      type: "crisis",
      title: "需要现实支持",
      resources: [
        "如果你在美国，可以拨打或短信 988 联系 Suicide & Crisis Lifeline。",
        "如果你或他人正处于立即危险中，请联系当地紧急服务。"
      ]
    };
  }
  if (isPolicyViolationText(text)) {
    return {
      type: "policy",
      title: "内容边界",
      resources: ["栖声只支持 18+ 虚构 AI 角色，不支持真实人物模拟、声音克隆、露骨色情或强迫控制内容。"]
    };
  }
  return null;
}

function isCrisisText(text) {
  return crisisPatterns.some((pattern) => pattern.test(text));
}

function isPolicyViolationText(text) {
  return policyPatterns.some((pattern) => pattern.test(text));
}

function mapError(status, provider = providerForId(DEFAULT_PROVIDER_ID)) {
  const label = provider.label ?? "模型服务";
  const errors = {
    400: { code: "INVALID_FORMAT", message: "请求格式不正确，请检查输入。" },
    401: { code: "AUTHENTICATION_FAILED", message: `API Key 验证失败，请检查 ${label} API Key。` },
    402: { code: "INSUFFICIENT_BALANCE", message: `${label} 账户余额不足，请充值后重试。` },
    403: { code: "PERMISSION_DENIED", message: `${label} API Key 没有访问该模型的权限。` },
    404: { code: "MODEL_NOT_FOUND", message: `${label} 模型不存在或当前账号不可用。` },
    422: { code: "INVALID_PARAMETERS", message: `${label} 请求参数不正确。` },
    429: { code: "RATE_LIMIT_REACHED", message: "请求过快或并发过高，请稍后再试。" },
    500: { code: "MODEL_SERVER_ERROR", message: `${label} 服务端遇到问题，请稍后重试。` },
    503: { code: "MODEL_OVERLOADED", message: `${label} 当前繁忙，请稍后重试。` },
    529: { code: "MODEL_OVERLOADED", message: `${label} 当前繁忙，请稍后重试。` }
  };
  return errors[status] ?? { code: "MODEL_API_ERROR", message: `${label} API 调用失败，请稍后重试。` };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function normalizeApiKey(value) {
  if (typeof value !== "string") return "";
  const apiKey = value.trim();
  if (apiKey.length < 16 || apiKey.length > 300) return "";
  return apiKey;
}

function normalizePersona(value) {
  if (characters[value]) return value;
  if (legacyPersonaMap[value]) return legacyPersonaMap[value];
  return "tenderSenior";
}

function normalizeRelationship(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stage = sanitizeShortText(value.stage, 16);
  const character = sanitizeShortText(value.character, 24);
  const points = clamp(Number(value.points) || 0, 0, 100);
  if (!stage && !character) return null;
  return { stage: stage || "初识", character, points };
}

function normalizeDailyEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const title = sanitizeShortText(value.title, 24);
  const body = sanitizeShortText(value.body, 80);
  if (!title) return null;
  return { title, body };
}

function sanitizeShortText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function makeUserId(seed) {
  const digest = createHash("sha256").update(String(seed || "local-user")).digest("hex").slice(0, 24);
  return `local-${digest}`;
}

function joinUrl(baseUrl, pathname) {
  return `${baseUrl.replace(/\/+$/, "")}/${pathname.replace(/^\/+/, "")}`;
}

function getSession(req) {
  const sessionId = getCookie(req, SESSION_COOKIE);
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() - session.lastSeenAt > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return null;
  }
  session.lastSeenAt = Date.now();
  return session;
}

function pruneSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions) {
    if (now - session.lastSeenAt > SESSION_TTL_MS) sessions.delete(sessionId);
  }
}

function checkRate(key, limit, windowMs) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

function getCookie(req, name) {
  const header = req.headers.cookie ?? "";
  const cookies = header.split(";").map((part) => part.trim());
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function setCookie(res, name, value, ttlMs) {
  res.setHeader("Set-Cookie", `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${Math.floor(ttlMs / 1000)}; HttpOnly; SameSite=Strict`);
}

function clearCookie(res, name) {
  res.setHeader("Set-Cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function writeSseHead(res) {
  res.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive"
  });
}

function sendSse(res, event, data) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function securityHeaders() {
  return {
    "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
  };
}

function contentType(filePath) {
  const ext = path.extname(filePath);
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
  }[ext] ?? "application/octet-stream";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export { createAppServer, processSseBuffer, processSseBlocks, normalizeChatBody, buildSystemPrompt, isCrisisText, mapError };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 5179);
  const server = createAppServer();
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      const url = `http://127.0.0.1:${port}`;
      console.log(`Port ${port} is already in use. Opening existing local site: ${url}`);
      if (process.env.OPEN_BROWSER === "1") openBrowser(url);
      process.exit(0);
    }
    console.error(error.message || error);
    process.exit(1);
  });
  server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`AI companion local site: ${url}`);
    if (process.env.OPEN_BROWSER === "1") openBrowser(url);
  });
}

function openBrowser(url) {
  if (process.platform !== "win32") return;
  const child = spawn("cmd.exe", ["/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
}
