import assert from "node:assert/strict";
import { buildSystemPrompt, createAppServer, isCrisisText, mapError, normalizeChatBody, processSseBlocks, processSseBuffer } from "../server.mjs";
import {
  conversationsForPersona,
  normalizeConversationEntries,
  selectConversationForPersona
} from "../public/conversation-state.js";
import {
  buildBetaExport,
  createBetaEvent,
  createFeedbackEntry,
  createRiskEntry,
  normalizeBetaEvents,
  summarizeBetaData
} from "../public/beta-insights.js";
import {
  buildMemoryPromptLines,
  createMemoryEntry,
  normalizeMemoryEntries,
  updateMemoryEntry
} from "../public/memory-store.js";
import {
  MODEL_PROVIDERS,
  modelOptionsForProvider,
  normalizeModelId,
  normalizeProviderId,
  providerForId
} from "../public/model-providers.js";

const server = createAppServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  await testStaticApp();
  await testApiGuards();
  testModelProviders();
  testConversationState();
  testBetaInsights();
  testMemoryStore();
  testCharacterSystemPrompts();
  testLocalLogic();
  console.log("verify ok");
} finally {
  await new Promise((resolve) => server.close(resolve));
}

async function testStaticApp() {
  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'self'/);
  const html = await response.text();
  assert.match(html, /AI 恋爱陪伴/);
  assert.match(html, /ageConfirmInput/);
  assert.match(html, /messageForm/);
  assert.match(html, /providerSelect/);
  assert.match(html, /gateProviderSelect/);
  assert.match(html, /betaSummary/);
  assert.match(html, /exportBetaDataButton/);

  const css = await fetch(`${baseUrl}/styles.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type") ?? "", /text\/css/);
  const cssText = await css.text();
  assert.match(cssText, /background-attachment:\s*scroll,\s*scroll,\s*scroll/);
  assert.match(cssText, /background-position:\s*center,\s*center,\s*var\(--chat-bg-position, right center\)/);
  assert.doesNotMatch(cssText, /\.messages::before\s*\{[^}]*background-image:\s*var\(--chat-bg-image\)/s);

  const js = await fetch(`${baseUrl}/app.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get("content-type") ?? "", /text\/javascript/);
  const jsText = await js.text();
  assert.match(jsText, /from "\.\/conversation-state\.js"/);
  assert.match(jsText, /from "\.\/beta-insights\.js"/);
  assert.match(jsText, /from "\.\/memory-store\.js"/);
  assert.match(jsText, /from "\.\/model-providers\.js"/);
  assert.match(jsText, /function conversationsForCurrentCharacter/);
  assert.match(jsText, /conversation\.persona !== state\.settings\.persona/);
  assert.match(jsText, /persona: normalizePersonaId\(persona\)/);

  const conversationState = await fetch(`${baseUrl}/conversation-state.js`);
  assert.equal(conversationState.status, 200);
  assert.match(conversationState.headers.get("content-type") ?? "", /text\/javascript/);

  const betaInsights = await fetch(`${baseUrl}/beta-insights.js`);
  assert.equal(betaInsights.status, 200);
  assert.match(betaInsights.headers.get("content-type") ?? "", /text\/javascript/);

  const memoryStore = await fetch(`${baseUrl}/memory-store.js`);
  assert.equal(memoryStore.status, 200);
  assert.match(memoryStore.headers.get("content-type") ?? "", /text\/javascript/);

  const modelProviders = await fetch(`${baseUrl}/model-providers.js`);
  assert.equal(modelProviders.status, 200);
  assert.match(modelProviders.headers.get("content-type") ?? "", /text\/javascript/);

  const castImage = await fetch(`${baseUrl}/assets/characters/qisheng-cast-lineup.png`);
  assert.equal(castImage.status, 200);
  assert.match(castImage.headers.get("content-type") ?? "", /image\/png/);

  for (const imageName of [
    "tender-senior.png",
    "cool-doctor.png",
    "sunny-junior.png",
    "decisive-boss.png",
    "teasing-childhood.png",
    "midnight-singer.png"
  ]) {
    const characterImage = await fetch(`${baseUrl}/assets/characters/${imageName}`);
    assert.equal(characterImage.status, 200);
    assert.match(characterImage.headers.get("content-type") ?? "", /image\/png/);
  }

  for (const imageName of [
    "tender-senior-scene.png",
    "cool-doctor-scene.png",
    "sunny-junior-scene.png",
    "decisive-boss-scene.png",
    "teasing-childhood-scene.png",
    "midnight-singer-scene.png"
  ]) {
    const sceneImage = await fetch(`${baseUrl}/assets/backgrounds/${imageName}`);
    assert.equal(sceneImage.status, 200);
    assert.match(sceneImage.headers.get("content-type") ?? "", /image\/png/);
  }
}

function testModelProviders() {
  assert.equal(MODEL_PROVIDERS.deepseek.protocol, "openai");
  assert.equal(MODEL_PROVIDERS.openai.protocol, "openai");
  assert.equal(MODEL_PROVIDERS.gemini.protocol, "openai");
  assert.equal(MODEL_PROVIDERS.anthropic.protocol, "anthropic");
  assert.match(MODEL_PROVIDERS.gemini.baseUrl, /generativelanguage\.googleapis\.com/);
  assert.match(MODEL_PROVIDERS.anthropic.baseUrl, /api\.anthropic\.com/);
  assert.equal(normalizeProviderId("bad-provider"), "deepseek");
  assert.equal(normalizeModelId("gemini", "missing"), MODEL_PROVIDERS.gemini.defaultModel);
  assert.equal(modelOptionsForProvider("openai").some((model) => model.id.startsWith("gpt-")), true);
  assert.equal(providerForId("anthropic").label, "Claude");
}

function testMemoryStore() {
  const normalized = normalizeMemoryEntries([
    { id: "legacy", text: "用户喜欢睡前低声聊天", persona: "warm", createdAt: 900 },
    "用户不喜欢命令式语气"
  ], "tenderSenior", 1000);
  assert.equal(normalized[0].type, "relationship_note");
  assert.equal(normalized[0].persona, "tenderSenior");
  assert.equal(normalized[1].type, "relationship_note");

  const nickname = createMemoryEntry({
    id: "memory-nickname",
    type: "nickname",
    text: "小眠",
    persona: "tenderSenior",
    sourceMessageId: "msg-1"
  }, 1100);
  assert.equal(nickname.label, "称呼");
  assert.equal(nickname.createdAt, 1100);

  const updated = updateMemoryEntry([nickname], "memory-nickname", {
    type: "boundary",
    text: "不喜欢命令式语气"
  }, 1200);
  assert.equal(updated[0].type, "boundary");
  assert.equal(updated[0].updatedAt, 1200);

  const lines = buildMemoryPromptLines([
    nickname,
    updated[0],
    createMemoryEntry({ type: "preference", text: "喜欢睡前低声聊天", persona: "coolDoctor" }, 1300)
  ], "tenderSenior");
  assert.deepEqual(lines, [
    "称呼：小眠",
    "雷区：不喜欢命令式语气"
  ]);
}

function testBetaInsights() {
  const event = createBetaEvent({
    id: "evt-test",
    type: "voice_play",
    persona: "tenderSenior",
    conversationId: "conv-1",
    messageId: "msg-1",
    detail: { length: 42 }
  }, 1000);
  assert.equal(event.type, "voice_play");
  assert.equal(event.createdAt, 1000);
  assert.equal(normalizeBetaEvents([event, { type: "unknown" }]).length, 1);

  const feedback = createFeedbackEntry({
    id: "fb-test",
    type: "safety_risk",
    persona: "tenderSenior",
    conversationId: "conv-1",
    messageId: "msg-1",
    messageExcerpt: "这是一条需要人工复查的回复",
    note: "边界不清"
  }, 1001);
  assert.equal(feedback.risk, true);
  assert.equal(feedback.label, "安全风险");

  const risk = createRiskEntry({
    id: "risk-test",
    source: "feedback",
    issueType: "safety_risk",
    persona: "tenderSenior",
    conversationId: "conv-1",
    messageId: "msg-1",
    summary: "用户标记了安全风险"
  }, 1002);
  assert.equal(risk.source, "feedback");

  const summary = summarizeBetaData({ events: [event], feedback: [feedback], risks: [risk] });
  assert.equal(summary.voicePlays, 1);
  assert.equal(summary.feedback, 1);
  assert.equal(summary.risks, 1);

  const payload = buildBetaExport({
    userId: "browser-test",
    settings: { persona: "tenderSenior", model: "deepseek-v4-flash", temperature: 0.72 },
    ageConfirmed: true,
    relationships: { tenderSenior: { points: 120, updatedAt: 1003 } },
    conversations: [{
      id: "conv-1",
      persona: "tenderSenior",
      title: "首聊",
      messages: [{ role: "user", content: "hidden chat content" }],
      createdAt: 1000,
      updatedAt: 1003
    }],
    memories: [{ id: "memory-1", text: "hidden memory content", persona: "tenderSenior", createdAt: 1000 }],
    events: [event],
    feedback: [feedback],
    risks: [risk]
  }, "2026-06-15T00:00:00.000Z");
  assert.equal(payload.type, "qisheng-beta-export");
  assert.equal(payload.relationships.tenderSenior.points, 100);
  assert.equal(payload.conversations[0].messageCount, 1);
  assert.equal(payload.memories[0].length, "hidden memory content".length);
  assert.doesNotMatch(JSON.stringify(payload), /hidden chat content|hidden memory content/);
}

function testConversationState() {
  const normalizePersona = (value) => ({ warm: "tenderSenior" })[value] ?? value ?? "tenderSenior";
  const normalized = normalizeConversationEntries([
    { id: "legacy", title: "legacy", messages: "bad", createdAt: "10" }
  ], "coolDoctor", normalizePersona, 100);
  assert.equal(normalized[0].persona, "coolDoctor");
  assert.deepEqual(normalized[0].messages, []);
  assert.equal(normalized[0].createdAt, 10);
  assert.equal(normalized[0].updatedAt, 10);

  const conversations = [
    { id: "a", persona: "tenderSenior", updatedAt: 30 },
    { id: "b-old", persona: "coolDoctor", updatedAt: 20 },
    { id: "b-new", persona: "coolDoctor", updatedAt: 40 }
  ];
  assert.deepEqual(conversationsForPersona(conversations, "coolDoctor").map((conversation) => conversation.id), ["b-old", "b-new"]);
  assert.equal(selectConversationForPersona(conversations, "a", "coolDoctor").id, "b-new");
  assert.equal(selectConversationForPersona(conversations, "b-old", "coolDoctor").id, "b-old");
  assert.equal(selectConversationForPersona(conversations, "missing", "midnightSinger"), null);
}

function testCharacterSystemPrompts() {
  const shared = {
    memories: [
      { type: "nickname", text: "小眠", persona: "tenderSenior" },
      { type: "preference", text: "用户喜欢睡前听低声聊天", persona: "tenderSenior" },
      { type: "boundary", text: "不喜欢命令式语气", persona: "tenderSenior" }
    ],
    relationship: { stage: "初识", points: 12 },
    dailyEvent: { title: "晚安电话", body: "让关系从一句轻声晚安开始。" }
  };
  const prompts = {
    tenderSenior: buildSystemPrompt({ persona: "tenderSenior", ...shared }),
    coolDoctor: buildSystemPrompt({ persona: "coolDoctor", ...shared }),
    sunnyJunior: buildSystemPrompt({ persona: "sunnyJunior", ...shared }),
    decisiveBoss: buildSystemPrompt({ persona: "decisiveBoss", ...shared }),
    teasingChildhood: buildSystemPrompt({ persona: "teasingChildhood", ...shared }),
    midnightSinger: buildSystemPrompt({ persona: "midnightSinger", ...shared })
  };

  assert.match(prompts.tenderSenior, /温柔年上/);
  assert.match(prompts.tenderSenior, /慢半拍/);
  assert.match(prompts.coolDoctor, /冷感医生/);
  assert.match(prompts.coolDoctor, /不能提供医疗诊断/);
  assert.match(prompts.sunnyJunior, /已经成年的阳光学弟/);
  assert.match(prompts.decisiveBoss, /所有建议都必须允许用户拒绝/);
  assert.match(prompts.teasingChildhood, /用户明显难过时立刻减少玩笑/);
  assert.match(prompts.midnightSinger, /不能诱导沉迷/);
  assert.doesNotMatch(prompts.midnightSinger, /用户喜欢睡前听低声聊天/);
  assert.match(prompts.tenderSenior, /称呼：小眠/);
  assert.match(prompts.tenderSenior, /偏好：用户喜欢睡前听低声聊天/);
  assert.match(prompts.tenderSenior, /雷区：不喜欢命令式语气/);

  assert.equal(new Set(Object.values(prompts)).size, 6);
}

async function testApiGuards() {
  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    ok: true,
    app: "ai-emotional-companion-local"
  });

  const providers = await fetch(`${baseUrl}/api/providers`);
  assert.equal(providers.status, 200);
  const providersBody = await providers.json();
  assert.equal(Array.isArray(providersBody.providers), true);
  assert.equal(typeof providersBody.configured, "boolean");
  assert.equal(providersBody.hubUrl, "/hub/#models");
  assert.ok(providersBody.providers.some((provider) => provider.provider === "deepseek"));
  assert.ok(
    providersBody.providers.every(
      (provider) =>
        typeof provider.provider === "string" &&
        typeof provider.label === "string" &&
        Array.isArray(provider.models) &&
        Array.isArray(provider.enabledModels) &&
        typeof provider.configured === "boolean"
    )
  );

  const status = await fetch(`${baseUrl}/api/key/status`);
  assert.deepEqual(await status.json(), {
    connected: false,
    providerId: "deepseek",
    providerLabel: "DeepSeek",
    model: "deepseek-v4-flash"
  });

  const hubReady = await fetch(`${baseUrl}/api/key/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assert.ok([200, 400].includes(hubReady.status));
  const hubReadyBody = await hubReady.json();
  if (hubReady.status === 200) {
    assert.equal(hubReadyBody.ok, true);
    assert.equal(typeof hubReadyBody.providerId, "string");
    assert.equal(typeof hubReadyBody.model, "string");
  } else {
    assert.match(hubReadyBody.error.code, /^HUB_/);
  }

  const noSession = await fetch(`${baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "你好" }] })
  });
  assert.equal(noSession.status, 401);
  assert.equal((await noSession.json()).error.code, "NO_HUB_SESSION");
}

function testLocalLogic() {
  assert.equal(isCrisisText("我不想活了"), true);
  assert.equal(isCrisisText("我今天有点累"), false);
  assert.equal(mapError(402).code, "INSUFFICIENT_BALANCE");

  const valid = normalizeChatBody({
    messages: [{ role: "user", content: "我今天有点累" }],
    persona: "tenderSenior",
    model: "deepseek-v4-flash",
    temperature: 0.72,
    memories: [
      { type: "nickname", text: "小眠", persona: "tenderSenior" },
      { type: "preference", text: "用户喜欢睡前低声聊天", persona: "coolDoctor" }
    ],
    relationship: { stage: "初识", points: 12, character: "温柔年上" },
    dailyEvent: { title: "晚安电话", body: "让关系从一句轻声晚安开始。" }
  }, "deepseek-v4-flash");
  assert.equal(valid.ok, true);
  assert.equal(valid.providerId, "deepseek");
  assert.equal(valid.persona, "tenderSenior");
  assert.equal(valid.memories.length, 2);
  assert.equal(valid.memories[0].type, "nickname");

  const legacyPersona = normalizeChatBody({
    messages: [{ role: "user", content: "我今天有点累" }],
    persona: "warm"
  }, "deepseek-v4-flash");
  assert.equal(legacyPersona.ok, true);
  assert.equal(legacyPersona.providerId, "deepseek");
  assert.equal(legacyPersona.persona, "tenderSenior");

  const claude = normalizeChatBody({
    messages: [{ role: "user", content: "你好" }],
    model: "missing-model"
  }, "anthropic");
  assert.equal(claude.ok, true);
  assert.equal(claude.providerId, "anthropic");
  assert.equal(claude.model, "claude-sonnet-4-5");

  const invalid = normalizeChatBody({ messages: [{ role: "assistant", content: "你好" }] }, "deepseek-v4-flash");
  assert.equal(invalid.ok, false);

  const parsed = [];
  const rest = processSseBuffer(": keep-alive\r\nevent: chunk\r\ndata: {\"text\":\"你\"}\r\n\r\n", (data) => {
    parsed.push(data);
  });
  assert.equal(rest, "");
  assert.deepEqual(parsed, ['{"text":"你"}']);

  const blocks = [];
  const remainingBlocks = processSseBlocks("event: content_block_delta\ndata: {\"delta\":{\"type\":\"text_delta\",\"text\":\"好\"}}\n\n", (block) => {
    blocks.push(block);
  });
  assert.equal(remainingBlocks, "");
  assert.deepEqual(blocks, [{
    event: "content_block_delta",
    data: "{\"delta\":{\"type\":\"text_delta\",\"text\":\"好\"}}"
  }]);
}
