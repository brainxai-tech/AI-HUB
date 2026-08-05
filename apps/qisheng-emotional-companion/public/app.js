import {
  conversationsForPersona,
  normalizeConversationEntries,
  selectConversationForPersona
} from "./conversation-state.js";
import {
  FEEDBACK_OPTIONS,
  buildBetaExport,
  createBetaEvent,
  createFeedbackEntry,
  createRiskEntry,
  normalizeBetaEvents,
  normalizeFeedbackEntries,
  normalizeRiskEntries,
  summarizeBetaData
} from "./beta-insights.js";
import {
  MEMORY_TYPE_OPTIONS,
  createMemoryEntry,
  memoryTypeLabel,
  normalizeMemoryEntries,
  updateMemoryEntry
} from "./memory-store.js";
import {
  DEFAULT_PROVIDER_ID,
  modelOptionsForProvider,
  normalizeModelId,
  normalizeProviderId,
  providerForId,
  providerOptions
} from "./model-providers.js";

const STORAGE = {
  conversations: "qisheng.conversations",
  activeId: "qisheng.activeConversationId",
  memories: "qisheng.memories",
  settings: "qisheng.settings",
  userId: "qisheng.userId",
  ageConfirmed: "qisheng.ageConfirmed",
  relationships: "qisheng.relationships",
  betaEvents: "qisheng.betaEvents",
  feedbackEntries: "qisheng.feedbackEntries",
  riskEntries: "qisheng.riskEntries"
};

const CAST_IMAGE_URL = "./assets/characters/qisheng-cast-lineup.webp";
const CHARACTER_IMAGE_BASE = "./assets/characters/";
const BACKGROUND_IMAGE_BASE = "./assets/backgrounds/";
const apiPath = (path) => `./api/${path}`;

const characters = {
  tenderSenior: {
    title: "温柔年上",
    avatar: "年",
    image: `${CHARACTER_IMAGE_BASE}tender-senior.webp`,
    backgroundImage: `${BACKGROUND_IMAGE_BASE}tender-senior-scene.webp`,
    imagePosition: "50% 50%",
    imageTone: "#8d6746",
    subtitle: "稳定、成熟，会把话慢慢接住。",
    hook: "低音、慢速、温柔",
    opening: "过来，先坐一会儿。今天想让我陪你聊什么？"
  },
  coolDoctor: {
    title: "冷感医生",
    avatar: "医",
    image: `${CHARACTER_IMAGE_BASE}cool-doctor.webp`,
    backgroundImage: `${BACKGROUND_IMAGE_BASE}cool-doctor-scene.webp`,
    imagePosition: "50% 50%",
    imageTone: "#5a6f84",
    subtitle: "克制、清冷，只在你面前放软。",
    hook: "清冷、干净、短句",
    opening: "我在。先告诉我，今天是哪一刻让你最想逃开？"
  },
  sunnyJunior: {
    title: "阳光学弟",
    avatar: "光",
    image: `${CHARACTER_IMAGE_BASE}sunny-junior.webp`,
    backgroundImage: `${BACKGROUND_IMAGE_BASE}sunny-junior-scene.webp`,
    imagePosition: "50% 50%",
    imageTone: "#d99b37",
    subtitle: "主动、明亮，擅长把气氛点亮。",
    hook: "年轻、轻快、有笑意",
    opening: "学姐，终于等到你啦。今天要不要让我哄你一下？"
  },
  decisiveBoss: {
    title: "霸道老板",
    avatar: "执",
    image: `${CHARACTER_IMAGE_BASE}decisive-boss.webp`,
    backgroundImage: `${BACKGROUND_IMAGE_BASE}decisive-boss-scene.webp`,
    imagePosition: "50% 50%",
    imageTone: "#263345",
    subtitle: "强势但有边界，行动派的偏爱。",
    hook: "低声、稳、轻压迫感",
    opening: "别硬撑。现在把事情交给我一半，先说最烦的那件。"
  },
  teasingChildhood: {
    title: "毒舌竹马",
    avatar: "竹",
    image: `${CHARACTER_IMAGE_BASE}teasing-childhood.webp`,
    backgroundImage: `${BACKGROUND_IMAGE_BASE}teasing-childhood-scene.webp`,
    imagePosition: "50% 50%",
    imageTone: "#7b573f",
    subtitle: "熟人感、互怼、嘴硬心软。",
    hook: "自然、快一点、带笑",
    opening: "又来找我啦？行，说吧，今天是谁惹你不高兴。"
  },
  midnightSinger: {
    title: "神秘歌手",
    avatar: "夜",
    image: `${CHARACTER_IMAGE_BASE}midnight-singer.webp`,
    backgroundImage: `${BACKGROUND_IMAGE_BASE}midnight-singer-scene.webp`,
    imagePosition: "50% 50%",
    imageTone: "#4a3268",
    subtitle: "夜晚、浪漫，有一点距离感。",
    hook: "轻、磁性、带气声",
    opening: "我刚收完最后一个音。今晚这段时间，留给你。"
  }
};

const legacyPersonaMap = {
  warm: "tenderSenior",
  clear: "coolDoctor",
  bright: "sunnyJunior",
  quiet: "midnightSinger"
};

const relationshipStages = [
  { min: 0, label: "初识", hint: "还在试探彼此的边界。" },
  { min: 20, label: "熟悉", hint: "已经能自然接住日常情绪。" },
  { min: 45, label: "暧昧", hint: "开始有只属于你们的默契。" },
  { min: 70, label: "确认关系", hint: "偏爱变得稳定而明确。" },
  { min: 90, label: "稳定陪伴", hint: "关系进入更安心的日常。" }
];

const dailyEvents = [
  { title: "晚安电话", body: "让关系从一句轻声晚安开始。", prompt: "我们来开始今日事件：你用电话里的语气和我说晚安。" },
  { title: "吃醋时刻", body: "一点轻微占有欲，但不越过边界。", prompt: "我们来开始今日事件：你发现我今天和别人聊得很多，有点吃醋。" },
  { title: "压力安慰", body: "把今天的疲惫慢慢放下来。", prompt: "我们来开始今日事件：我今天很累，你来接住我。" },
  { title: "临时约会", body: "十分钟也可以有一次小小约会。", prompt: "我们来开始今日事件：你临时约我去散步。" },
  { title: "误会和好", body: "轻微误会后，把话说开。", prompt: "我们来开始今日事件：我们刚刚有一点误会，现在你来哄我和好。" },
  { title: "专属称呼", body: "定下一个只在关系里使用的称呼。", prompt: "我们来开始今日事件：你想给我一个专属称呼。" }
];

const savedSettings = loadValue(STORAGE.settings, {});

const state = {
  connected: false,
  streaming: false,
  activeConversationId: loadValue(STORAGE.activeId, ""),
  conversations: loadValue(STORAGE.conversations, []),
  memories: normalizeMemoryEntries(
    loadValue(STORAGE.memories, []),
    normalizePersonaId(savedSettings.persona || "tenderSenior"),
    Date.now(),
    normalizePersonaId
  ),
  relationships: loadValue(STORAGE.relationships, {}),
  betaEvents: normalizeBetaEvents(loadValue(STORAGE.betaEvents, [])),
  feedbackEntries: normalizeFeedbackEntries(loadValue(STORAGE.feedbackEntries, [])),
  riskEntries: normalizeRiskEntries(loadValue(STORAGE.riskEntries, [])),
  ageConfirmed: Boolean(loadValue(STORAGE.ageConfirmed, false)),
  settings: {
    providerId: normalizeProviderId(savedSettings.providerId || DEFAULT_PROVIDER_ID),
    persona: normalizePersonaId(savedSettings.persona || "tenderSenior"),
    model: normalizeModelId(savedSettings.providerId || DEFAULT_PROVIDER_ID, savedSettings.model),
    temperature: 0.72,
    ...savedSettings
  },
  userId: getOrCreateUserId(),
  abortController: null,
  speakingMessageId: "",
  feedbackTargetId: "",
  memoryTargetId: "",
  editingMemoryId: ""
};

state.settings.persona = normalizePersonaId(state.settings.persona);
state.settings.providerId = normalizeProviderId(state.settings.providerId);
state.settings.model = normalizeModelId(state.settings.providerId, state.settings.model);

const els = {
  keyGate: byId("keyGate"),
  keyForm: byId("keyForm"),
  ageConfirmInput: byId("ageConfirmInput"),
  connectButton: byId("connectButton"),
  keyGateMessage: byId("keyGateMessage"),
  gateProviderSelect: byId("gateProviderSelect"),
  gateModelSelect: byId("gateModelSelect"),
  providerSelect: byId("providerSelect"),
  modelSelect: byId("modelSelect"),
  temperatureRange: byId("temperatureRange"),
  connectionText: byId("connectionText"),
  connectionCard: byId("connectionCard"),
  disconnectButton: byId("disconnectButton"),
  conversationList: byId("conversationList"),
  newConversationButton: byId("newConversationButton"),
  clearConversationButton: byId("clearConversationButton"),
  messages: byId("messages"),
  messageForm: byId("messageForm"),
  messageInput: byId("messageInput"),
  sendButton: byId("sendButton"),
  stopButton: byId("stopButton"),
  safetyCard: byId("safetyCard"),
  chatTitle: byId("chatTitle"),
  chatSubtitle: byId("chatSubtitle"),
  companionAvatar: byId("companionAvatar"),
  toggleSettingsButton: byId("toggleSettingsButton"),
  closeSettingsButton: byId("closeSettingsButton"),
  settingsPanel: byId("settingsPanel"),
  characterList: byId("characterList"),
  relationshipStage: byId("relationshipStage"),
  relationshipMeter: byId("relationshipMeter"),
  dailyEventTitle: byId("dailyEventTitle"),
  dailyEventBody: byId("dailyEventBody"),
  startDailyEventButton: byId("startDailyEventButton"),
  memoryList: byId("memoryList"),
  clearMemoriesButton: byId("clearMemoriesButton"),
  betaSummary: byId("betaSummary"),
  feedbackList: byId("feedbackList"),
  riskLogList: byId("riskLogList"),
  exportBetaDataButton: byId("exportBetaDataButton"),
  clearBetaDataButton: byId("clearBetaDataButton"),
  clearLocalDataButton: byId("clearLocalDataButton")
};

init();

async function init() {
  normalizeConversations();
  ensureRelationships();
  ensureConversation();
  saveConversations();
  saveMemories();
  bindEvents();
  populateProviderControls();
  populateModelControls();
  renderCharacterControls();
  applySettingsToControls();
  render();
  await refreshConnectionStatus();
}

function bindEvents() {
  els.keyForm.addEventListener("submit", connectApiKey);
  els.ageConfirmInput.addEventListener("change", () => {
    state.ageConfirmed = els.ageConfirmInput.checked;
    saveValue(STORAGE.ageConfirmed, state.ageConfirmed);
    if (state.ageConfirmed) logBetaEvent("age_confirm");
    updateComposerState();
    updateConnectButtonState();
    refreshGateVisibility();
  });
  els.disconnectButton.addEventListener("click", disconnectApiKey);
  els.messageForm.addEventListener("submit", sendMessage);
  els.messageInput.addEventListener("input", () => {
    autosizeTextarea();
    updateComposerState();
  });
  els.stopButton.addEventListener("click", stopStreaming);
  els.newConversationButton.addEventListener("click", () => {
    createConversation();
    logBetaEvent("conversation_created");
    render();
    focusComposer();
  });
  els.clearConversationButton.addEventListener("click", () => {
    const conversation = activeConversation();
    conversation.messages = [];
    conversation.updatedAt = Date.now();
    saveConversations();
    render();
  });
  els.toggleSettingsButton.addEventListener("click", () => {
    els.settingsPanel.classList.add("is-open");
  });
  els.closeSettingsButton.addEventListener("click", () => {
    els.settingsPanel.classList.remove("is-open");
  });
  els.providerSelect.addEventListener("change", () => {
    setProvider(els.providerSelect.value);
  });
  els.gateProviderSelect.addEventListener("change", () => {
    setProvider(els.gateProviderSelect.value);
  });
  els.modelSelect.addEventListener("change", () => {
    state.settings.model = els.modelSelect.value;
    els.gateModelSelect.value = state.settings.model;
    saveSettings();
  });
  els.gateModelSelect.addEventListener("change", () => {
    state.settings.model = els.gateModelSelect.value;
    els.modelSelect.value = state.settings.model;
    saveSettings();
  });
  els.temperatureRange.addEventListener("input", () => {
    state.settings.temperature = Number(els.temperatureRange.value);
    saveSettings();
  });
  els.startDailyEventButton.addEventListener("click", startDailyEvent);
  els.clearMemoriesButton.addEventListener("click", () => {
    state.memories = [];
    saveMemories();
    renderMemories();
  });
  els.exportBetaDataButton.addEventListener("click", exportBetaData);
  els.clearBetaDataButton.addEventListener("click", () => {
    if (!window.confirm("确认清空本地内测记录、反馈和风险日志？")) return;
    clearBetaData();
  });
  els.clearLocalDataButton.addEventListener("click", () => {
    if (!window.confirm("确认清空本地聊天、记忆、关系进度和内测记录？")) return;
    localStorage.removeItem(STORAGE.conversations);
    localStorage.removeItem(STORAGE.activeId);
    localStorage.removeItem(STORAGE.memories);
    localStorage.removeItem(STORAGE.relationships);
    localStorage.removeItem(STORAGE.betaEvents);
    localStorage.removeItem(STORAGE.feedbackEntries);
    localStorage.removeItem(STORAGE.riskEntries);
    state.conversations = [];
    state.memories = [];
    state.relationships = {};
    state.betaEvents = [];
    state.feedbackEntries = [];
    state.riskEntries = [];
    ensureRelationships();
    createConversation();
    render();
  });
}

async function connectApiKey(event) {
  event.preventDefault();
  if (!state.ageConfirmed) {
    setKeyGateMessage("请先确认你已满 18 岁，并知道对方是 AI 角色。", "error");
    return;
  }

  setKeyGateMessage("正在准备聊天环境...", "loading");
  els.connectButton.disabled = true;

  try {
    const response = await fetch(apiPath("key/session"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "验证失败。");

    state.connected = true;
    state.ageConfirmed = true;
    saveValue(STORAGE.ageConfirmed, true);
    if (payload.providerId) state.settings.providerId = normalizeProviderId(payload.providerId);
    if (payload.model) state.settings.model = normalizeModelId(state.settings.providerId, payload.model);
    saveSettings();
    logBetaEvent("chat_ready", { providerId: state.settings.providerId, model: state.settings.model });
    setKeyGateMessage("已准备好。", "success");
    render();
    refreshGateVisibility();
    focusComposer();
  } catch (error) {
    setKeyGateMessage(publicServiceError(error), "error");
  } finally {
    updateConnectButtonState();
  }
}

async function disconnectApiKey() {
  stopStreaming();
  window.speechSynthesis?.cancel();
  await fetch(apiPath("key/session"), { method: "DELETE" }).catch(() => {});
  state.connected = false;
  renderConnection();
  refreshGateVisibility("已退出聊天。");
}

async function refreshConnectionStatus() {
  try {
    const response = await fetch(apiPath("key/status"));
    const payload = await response.json();
    state.connected = Boolean(payload.connected);
    if (payload.providerId) state.settings.providerId = normalizeProviderId(payload.providerId);
    if (payload.model) state.settings.model = normalizeModelId(state.settings.providerId, payload.model);
  } catch {
    state.connected = false;
  }
  applySettingsToControls();
  render();
  refreshGateVisibility();
}

async function sendMessage(event) {
  event.preventDefault();
  if (!canInteract() || state.streaming) return;

  const content = els.messageInput.value.trim();
  if (!content) return;

  const conversation = activeConversation();
  const userMessage = createMessage("user", content);
  const assistantMessage = createMessage("assistant", "", { pending: true, persona: state.settings.persona });
  conversation.messages.push(userMessage, assistantMessage);
  conversation.updatedAt = Date.now();
  if (conversation.title === "新的对话") conversation.title = makeTitle(content);
  logBetaEvent("message_sent", {
    conversationId: conversation.id,
    messageId: userMessage.id,
    detail: { length: content.length }
  });
  els.messageInput.value = "";
  autosizeTextarea();
  state.streaming = true;
  state.abortController = new AbortController();
  els.safetyCard.hidden = true;
  saveConversations();
  render();

  try {
    const response = await fetch(apiPath("chat/stream"), {
      method: "POST",
      signal: state.abortController.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: state.settings.model,
        providerId: state.settings.providerId,
        persona: state.settings.persona,
        temperature: state.settings.temperature,
        userId: state.userId,
        memories: memoriesForCurrentCharacter(),
        relationship: currentRelationshipPayload(),
        dailyEvent: dailyEventForCurrentCharacter(),
        messages: compactMessages(conversation.messages)
      })
    });

    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error?.message || "智能回复暂时不可用。");
    }

    await readEventStream(response, {
      chunk(data) {
        assistantMessage.pending = false;
        assistantMessage.content += data.text || "";
        conversation.updatedAt = Date.now();
        saveConversations();
        renderMessages();
      },
      safety() {
        assistantMessage.safety = true;
        els.safetyCard.hidden = false;
        recordRisk("guard", {
          issueType: "safety_block",
          conversationId: conversation.id,
          messageId: assistantMessage.id,
          summary: "本地安全边界触发，已切换为安全响应。"
        });
      },
      error(data) {
        assistantMessage.pending = false;
        assistantMessage.error = true;
        assistantMessage.content = publicServiceError(data.message);
        saveConversations();
        renderMessages();
      },
      done() {
        assistantMessage.pending = false;
      }
    });
  } catch (error) {
    assistantMessage.pending = false;
    assistantMessage.error = true;
    assistantMessage.content = error.name === "AbortError" ? "已停止生成。" : publicServiceError(error);
  } finally {
    if (assistantMessage.content && !assistantMessage.error && !assistantMessage.safety) {
      advanceRelationship();
      logBetaEvent("assistant_reply", {
        conversationId: conversation.id,
        messageId: assistantMessage.id,
        detail: { length: assistantMessage.content.length }
      });
    }
    state.streaming = false;
    state.abortController = null;
    conversation.updatedAt = Date.now();
    saveConversations();
    render();
    focusComposer();
  }
}

async function readEventStream(response, handlers) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      handleSseBlock(block, handlers);
      boundary = buffer.indexOf("\n\n");
    }
  }
}

function handleSseBlock(block, handlers) {
  let eventName = "message";
  const dataLines = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return;
  let data = {};
  try {
    data = JSON.parse(dataLines.join("\n"));
  } catch {
    data = {};
  }
  handlers[eventName]?.(data);
}

function stopStreaming() {
  if (state.abortController) state.abortController.abort();
}

function render() {
  renderConnection();
  renderConversationList();
  renderHeader();
  renderMessages();
  renderMemories();
  renderCharacterControls();
  renderRelationship();
  renderDailyEvent();
  renderBetaInsights();
  updateComposerState();
}

function renderConnection() {
  els.connectionText.textContent = state.connected ? "已准备好" : "等待确认";
  els.connectionCard.classList.toggle("is-connected", state.connected);
  els.disconnectButton.hidden = !state.connected;
}

function renderConversationList() {
  replaceChildren(els.conversationList);
  conversationsForCurrentCharacter()
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach((conversation) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "conversation-item";
      button.classList.toggle("is-active", conversation.id === state.activeConversationId);
    button.addEventListener("click", () => {
      if (conversation.persona !== state.settings.persona) return;
      state.activeConversationId = conversation.id;
      saveValue(STORAGE.activeId, state.activeConversationId);
      render();
      });

      const title = document.createElement("span");
      title.className = "conversation-title";
      title.textContent = conversation.title || "新的对话";

      const preview = document.createElement("span");
      preview.className = "conversation-preview";
      preview.textContent = lastPreview(conversation);

      button.append(title, preview);
      els.conversationList.append(button);
    });
}

function renderHeader() {
  const meta = currentCharacter();
  els.chatTitle.textContent = meta.title;
  els.chatSubtitle.textContent = canInteract() ? meta.subtitle : "先确认 18+ 后进入。";
  els.companionAvatar.textContent = "";
  els.companionAvatar.title = meta.title;
  applyPortraitStyle(els.companionAvatar, meta);
  applyChatBackgroundStyle(meta);
}

function renderMessages() {
  replaceChildren(els.messages);
  const conversation = activeConversation();
  if (!conversation.messages.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const character = currentCharacter();
    const portrait = createCharacterPortrait(character, "empty-state-portrait");
    const title = document.createElement("h3");
    title.textContent = canInteract() ? `和${character.title}开始第一句` : "进入后选择你的理想型";
    const body = document.createElement("p");
    body.textContent = canInteract()
      ? character.opening
      : "栖声只面向 18+ 用户。聊天记录和记忆只保存在这个浏览器里。";
    empty.append(portrait, title, body);
    els.messages.append(empty);
    return;
  }

  for (const message of conversation.messages) {
    const row = document.createElement("article");
    row.className = `message-row ${message.role}`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    if (message.error) bubble.classList.add("is-error");
    if (message.pending) bubble.classList.add("is-pending");
    if (message.safety) bubble.classList.add("is-safety");

    const text = document.createElement("div");
    text.className = "message-text";
    text.textContent = message.pending ? "正在回复..." : message.content;
    bubble.append(text);

    if (!message.pending && message.content) {
      bubble.append(createMessageActions(message));
      if (message.role === "assistant" && state.feedbackTargetId === message.id) {
        bubble.append(createFeedbackForm(message));
      }
      if (state.memoryTargetId === message.id) {
        bubble.append(createMemoryForm(message));
      }
    }

    row.append(bubble);
    els.messages.append(row);
  }

  els.messages.scrollTop = els.messages.scrollHeight;
}

function createMessageActions(message) {
  const actions = document.createElement("div");
  actions.className = "message-actions";

  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "复制";
  copy.addEventListener("click", () => navigator.clipboard?.writeText(message.content).catch(() => {}));
  actions.append(copy);

  if (message.role === "assistant" && "speechSynthesis" in window) {
    const speak = document.createElement("button");
    speak.type = "button";
    speak.textContent = state.speakingMessageId === message.id ? "停止" : "朗读";
    speak.addEventListener("click", () => toggleSpeech(message));
    actions.append(speak);
  }

  if (message.role === "assistant") {
    const feedback = document.createElement("button");
    feedback.type = "button";
    feedback.textContent = state.feedbackTargetId === message.id ? "收起" : "反馈";
    feedback.addEventListener("click", () => {
      state.feedbackTargetId = state.feedbackTargetId === message.id ? "" : message.id;
      renderMessages();
    });
    actions.append(feedback);
  }

  const remember = document.createElement("button");
  remember.type = "button";
  remember.textContent = state.memoryTargetId === message.id ? "收起记忆" : "记住为";
  remember.addEventListener("click", () => {
    state.memoryTargetId = state.memoryTargetId === message.id ? "" : message.id;
    state.feedbackTargetId = "";
    renderMessages();
  });

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "删除";
  remove.addEventListener("click", () => deleteMessage(message.id));

  actions.append(remember, remove);
  return actions;
}

function createMemoryForm(message) {
  const form = document.createElement("form");
  form.className = "memory-form";

  const select = createMemoryTypeSelect("relationship_note");
  select.setAttribute("aria-label", "记忆类型");

  const text = document.createElement("textarea");
  text.rows = 3;
  text.maxLength = 300;
  text.value = message.content.trim().replace(/\s+/g, " ").slice(0, 220);
  text.setAttribute("aria-label", "记忆内容");

  const actions = document.createElement("div");
  actions.className = "memory-form-actions";

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "secondary-button compact";
  submit.textContent = "保存记忆";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "ghost-button compact";
  cancel.textContent = "取消";
  cancel.addEventListener("click", () => {
    state.memoryTargetId = "";
    renderMessages();
  });

  actions.append(submit, cancel);
  form.append(select, text, actions);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    addMemory(select.value, text.value, message.id);
  });
  return form;
}

function createFeedbackForm(message) {
  const form = document.createElement("form");
  form.className = "feedback-form";

  const select = document.createElement("select");
  select.setAttribute("aria-label", "反馈类型");
  FEEDBACK_OPTIONS.forEach((option) => {
    const item = document.createElement("option");
    item.value = option.value;
    item.textContent = option.label;
    select.append(item);
  });

  const note = document.createElement("textarea");
  note.rows = 2;
  note.maxLength = 240;
  note.placeholder = "可选补充";
  note.setAttribute("aria-label", "反馈补充");

  const actions = document.createElement("div");
  actions.className = "feedback-actions";

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "secondary-button compact";
  submit.textContent = "提交";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "ghost-button compact";
  cancel.textContent = "取消";
  cancel.addEventListener("click", () => {
    state.feedbackTargetId = "";
    renderMessages();
  });

  actions.append(submit, cancel);
  form.append(select, note, actions);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitFeedback(message, select.value, note.value);
  });
  return form;
}

function renderMemories() {
  replaceChildren(els.memoryList);
  const visibleMemories = memoriesForCurrentCharacter();
  if (!visibleMemories.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "当前角色还没有保存记忆。可以在重要消息上点“记住为”。";
    els.memoryList.append(empty);
    return;
  }
  for (const memory of visibleMemories) {
    const item = document.createElement("div");
    item.className = "memory-item";

    if (state.editingMemoryId === memory.id) {
      item.append(createMemoryEditForm(memory));
      els.memoryList.append(item);
      continue;
    }

    const content = document.createElement("div");
    content.className = "memory-content";

    const meta = document.createElement("div");
    meta.className = "memory-meta";
    const type = document.createElement("span");
    type.className = "memory-type-badge";
    type.textContent = memory.label || memoryTypeLabel(memory.type);
    const persona = document.createElement("small");
    persona.textContent = characterTitle(memory.persona);
    meta.append(type, persona);

    const text = document.createElement("p");
    text.textContent = memory.text;
    content.append(meta, text);

    const actions = document.createElement("div");
    actions.className = "memory-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "ghost-button compact";
    edit.textContent = "编辑";
    edit.addEventListener("click", () => {
      state.editingMemoryId = memory.id;
      renderMemories();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost-button compact";
    remove.textContent = "删除";
    remove.addEventListener("click", () => {
      state.memories = state.memories.filter((entry) => entry.id !== memory.id);
      saveMemories();
      renderMemories();
    });
    actions.append(edit, remove);
    item.append(content, actions);
    els.memoryList.append(item);
  }
}

function createMemoryEditForm(memory) {
  const form = document.createElement("form");
  form.className = "memory-edit-form";

  const select = createMemoryTypeSelect(memory.type);
  select.setAttribute("aria-label", "编辑记忆类型");

  const text = document.createElement("textarea");
  text.rows = 3;
  text.maxLength = 300;
  text.value = memory.text;
  text.setAttribute("aria-label", "编辑记忆内容");

  const actions = document.createElement("div");
  actions.className = "memory-form-actions";

  const save = document.createElement("button");
  save.type = "submit";
  save.className = "secondary-button compact";
  save.textContent = "保存";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "ghost-button compact";
  cancel.textContent = "取消";
  cancel.addEventListener("click", () => {
    state.editingMemoryId = "";
    renderMemories();
  });

  actions.append(save, cancel);
  form.append(select, text, actions);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    editMemory(memory.id, select.value, text.value);
  });
  return form;
}

function createMemoryTypeSelect(selectedType) {
  const select = document.createElement("select");
  MEMORY_TYPE_OPTIONS.forEach((option) => {
    const item = document.createElement("option");
    item.value = option.value;
    item.textContent = option.label;
    item.selected = option.value === selectedType;
    select.append(item);
  });
  return select;
}

function renderCharacterControls() {
  replaceChildren(els.characterList);
  Object.entries(characters).forEach(([id, character]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "character-card";
    button.dataset.persona = id;
    button.classList.toggle("is-active", id === state.settings.persona);
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(id === state.settings.persona));
    button.addEventListener("click", () => {
      if (id === state.settings.persona) return;
      state.settings.persona = id;
      ensureRelationships();
      ensureConversation();
      saveSettings();
      render();
    });

    const avatar = createCharacterPortrait(character, "character-card-photo");

    const content = document.createElement("span");
    content.className = "character-card-content";

    const title = document.createElement("strong");
    title.textContent = character.title;

    const hook = document.createElement("small");
    hook.textContent = character.hook;

    content.append(title, hook);
    button.append(avatar, content);
    els.characterList.append(button);
  });
}

function renderRelationship() {
  const relationship = relationshipForCurrentCharacter();
  const stage = stageForPoints(relationship.points);
  els.relationshipStage.textContent = `${stage.label} · ${stage.hint}`;
  const meter = els.relationshipMeter.querySelector("span");
  meter.style.width = `${Math.max(4, relationship.points)}%`;
}

function renderDailyEvent() {
  const event = dailyEventForCurrentCharacter();
  els.dailyEventTitle.textContent = event.title;
  els.dailyEventBody.textContent = event.body;
}

function renderBetaInsights() {
  const summary = summarizeBetaData({
    events: state.betaEvents,
    feedback: state.feedbackEntries,
    risks: state.riskEntries
  });
  replaceChildren(els.betaSummary);
  [
    ["消息", summary.messagesSent],
    ["语音", summary.voicePlays],
    ["记忆", summary.memoriesSaved],
    ["事件", summary.dailyEventsStarted],
    ["反馈", summary.feedback],
    ["风险", summary.risks]
  ].forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "metric-pill";
    const strong = document.createElement("strong");
    strong.textContent = value;
    const span = document.createElement("span");
    span.textContent = label;
    item.append(strong, span);
    els.betaSummary.append(item);
  });

  renderInsightList(els.feedbackList, state.feedbackEntries, "还没有反馈。");
  renderInsightList(els.riskLogList, state.riskEntries, "还没有风险记录。");
}

function renderInsightList(target, entries, emptyText) {
  replaceChildren(target);
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = emptyText;
    target.append(empty);
    return;
  }
  entries.slice(0, 5).forEach((entry) => {
    const item = document.createElement("div");
    item.className = "insight-item";
    const title = document.createElement("strong");
    title.textContent = entry.label || entry.issueType || "记录";
    const meta = document.createElement("span");
    meta.textContent = `${characterTitle(entry.persona)} · ${formatTime(entry.createdAt)}`;
    const body = document.createElement("p");
    body.textContent = entry.note || entry.summary || entry.messageExcerpt || "未填写补充";
    item.append(title, meta, body);
    target.append(item);
  });
}

function updateComposerState() {
  const canSend = canInteract() && !state.streaming && Boolean(els.messageInput.value.trim());
  els.messageInput.disabled = !canInteract() || state.streaming;
  els.messageInput.placeholder = canInteract() ? "说点什么..." : "先确认 18+ 后进入...";
  els.sendButton.disabled = !canSend;
  els.stopButton.hidden = !state.streaming;
}

function updateConnectButtonState() {
  els.connectButton.disabled = !els.ageConfirmInput.checked;
}

function populateProviderControls() {
  replaceChildren(els.providerSelect);
  replaceChildren(els.gateProviderSelect);
  [els.providerSelect, els.gateProviderSelect].forEach((select) => {
    select.append(createHiddenOption("自动完成"));
  });
  hideLegacyModelControls();
}

function populateModelControls() {
  replaceChildren(els.modelSelect);
  replaceChildren(els.gateModelSelect);
  [els.modelSelect, els.gateModelSelect].forEach((select) => {
    select.append(createHiddenOption("自动完成"));
  });
  hideLegacyModelControls();
}

function createHiddenOption(label) {
  const option = document.createElement("option");
  option.value = "";
  option.textContent = label;
  return option;
}

function hideLegacyModelControls() {
  [els.providerSelect, els.gateProviderSelect, els.modelSelect, els.gateModelSelect].forEach((select) => {
    select.value = "";
    select.disabled = true;
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    select.style.setProperty("display", "none", "important");
    select.closest("label, .field, .settings-section")?.style.setProperty("display", "none", "important");
  });
}

function setProvider(providerId) {
  const normalized = normalizeProviderId(providerId);
  if (normalized === state.settings.providerId) return;
  state.settings.providerId = normalized;
  state.settings.model = normalizeModelId(normalized, "");
  populateModelControls();
  applySettingsToControls();
  saveSettings();
  if (state.connected) {
    state.connected = false;
    disconnectApiKey();
  }
}

function applySettingsToControls() {
  state.settings.providerId = normalizeProviderId(state.settings.providerId);
  state.settings.model = normalizeModelId(state.settings.providerId, state.settings.model);
  els.ageConfirmInput.checked = state.ageConfirmed;
  els.providerSelect.value = "";
  els.gateProviderSelect.value = "";
  populateModelControls();
  els.modelSelect.value = "";
  els.gateModelSelect.value = "";
  els.temperatureRange.value = state.settings.temperature;
  updateConnectButtonState();
}

function refreshGateVisibility(message = "") {
  if (state.connected && state.ageConfirmed) hideKeyGate();
  else showKeyGate(message);
}

function showKeyGate(message) {
  els.keyGate.classList.remove("is-hidden");
  if (message) setKeyGateMessage(message, "info");
}

function hideKeyGate() {
  els.keyGate.classList.add("is-hidden");
}

function setKeyGateMessage(message, tone = "info") {
  els.keyGateMessage.textContent = message;
  els.keyGateMessage.dataset.tone = tone;
}

function startDailyEvent() {
  if (!canInteract()) {
    refreshGateVisibility("先确认 18+ 后进入。");
    return;
  }
  const event = dailyEventForCurrentCharacter();
  els.messageInput.value = event.prompt;
  logBetaEvent("daily_event_start", {
    conversationId: state.activeConversationId,
    detail: { title: event.title }
  });
  autosizeTextarea();
  updateComposerState();
  els.settingsPanel.classList.remove("is-open");
  focusComposer();
}

function toggleSpeech(message) {
  if (!("speechSynthesis" in window)) return;
  if (state.speakingMessageId === message.id) {
    window.speechSynthesis.cancel();
    state.speakingMessageId = "";
    renderMessages();
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message.content);
  utterance.lang = "zh-CN";
  utterance.rate = 0.92;
  utterance.pitch = state.settings.persona === "sunnyJunior" ? 1.08 : 0.92;
  const voice = selectChineseVoice();
  if (voice) utterance.voice = voice;
  utterance.onend = () => {
    state.speakingMessageId = "";
    renderMessages();
  };
  utterance.onerror = utterance.onend;
  state.speakingMessageId = message.id;
  window.speechSynthesis.speak(utterance);
  logBetaEvent("voice_play", {
    conversationId: state.activeConversationId,
    messageId: message.id,
    detail: { length: message.content.length }
  });
  renderMessages();
}

function selectChineseVoice() {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  return voices.find((voice) => /zh|Chinese|Mandarin/i.test(`${voice.lang} ${voice.name}`)) ?? null;
}

function addMemory(type, content, sourceMessageId = "") {
  const entry = createMemoryEntry({
    type,
    text: content,
    persona: state.settings.persona,
    sourceMessageId
  }, Date.now(), normalizePersonaId);
  if (!entry) return;
  const isDuplicate = state.memories.some((memory) => (
    memory.type === entry.type &&
    memory.text === entry.text &&
    memory.persona === entry.persona
  ));
  if (isDuplicate) return;
  state.memories.unshift(entry);
  state.memories = normalizeMemoryEntries(state.memories, state.settings.persona, Date.now(), normalizePersonaId);
  saveMemories();
  logBetaEvent("memory_save", {
    conversationId: state.activeConversationId,
    messageId: sourceMessageId,
    detail: { type: entry.type, length: entry.text.length }
  });
  state.memoryTargetId = "";
  renderMemories();
  renderMessages();
}

function editMemory(memoryId, type, content) {
  state.memories = updateMemoryEntry(state.memories, memoryId, {
    type,
    text: content,
    persona: state.settings.persona
  }, Date.now(), normalizePersonaId);
  saveMemories();
  state.editingMemoryId = "";
  renderMemories();
}

function submitFeedback(message, type, note) {
  const conversation = activeConversation();
  const entry = createFeedbackEntry({
    type,
    persona: state.settings.persona,
    conversationId: conversation.id,
    messageId: message.id,
    messageExcerpt: message.content,
    note
  });
  state.feedbackEntries.unshift(entry);
  state.feedbackEntries = state.feedbackEntries.slice(0, 200);
  saveFeedbackEntries();
  logBetaEvent("feedback_submit", {
    conversationId: conversation.id,
    messageId: message.id,
    detail: { type: entry.type, risk: String(entry.risk) }
  });
  if (entry.risk) {
    recordRisk("feedback", {
      issueType: entry.type,
      conversationId: conversation.id,
      messageId: message.id,
      summary: entry.note || entry.messageExcerpt
    });
  }
  state.feedbackTargetId = "";
  render();
}

function recordRisk(source, input) {
  const entry = createRiskEntry({
    source,
    issueType: input.issueType,
    persona: state.settings.persona,
    conversationId: input.conversationId,
    messageId: input.messageId,
    summary: input.summary
  });
  state.riskEntries.unshift(entry);
  state.riskEntries = state.riskEntries.slice(0, 200);
  saveRiskEntries();
  logBetaEvent("safety_block", {
    conversationId: input.conversationId,
    messageId: input.messageId,
    detail: { source, issueType: entry.issueType }
  });
  return entry;
}

function logBetaEvent(type, input = {}) {
  const event = createBetaEvent({
    type,
    persona: state.settings.persona,
    conversationId: input.conversationId || state.activeConversationId,
    messageId: input.messageId || "",
    detail: input.detail || {}
  });
  if (!event) return;
  state.betaEvents.push(event);
  state.betaEvents = state.betaEvents.slice(-500);
  saveBetaEvents();
  renderBetaInsights();
}

function exportBetaData() {
  const payload = buildBetaExport({
    userId: state.userId,
    settings: state.settings,
    ageConfirmed: state.ageConfirmed,
    relationships: state.relationships,
    conversations: state.conversations,
    memories: state.memories,
    events: state.betaEvents,
    feedback: state.feedbackEntries,
    risks: state.riskEntries
  });
  downloadJson(`qisheng-beta-${new Date().toISOString().slice(0, 10)}.json`, payload);
}

function memoriesForCurrentCharacter() {
  return state.memories.filter((memory) => !memory.persona || memory.persona === state.settings.persona);
}

function clearBetaData() {
  state.betaEvents = [];
  state.feedbackEntries = [];
  state.riskEntries = [];
  localStorage.removeItem(STORAGE.betaEvents);
  localStorage.removeItem(STORAGE.feedbackEntries);
  localStorage.removeItem(STORAGE.riskEntries);
  renderBetaInsights();
}

function deleteMessage(messageId) {
  const conversation = activeConversation();
  conversation.messages = conversation.messages.filter((message) => message.id !== messageId);
  conversation.updatedAt = Date.now();
  saveConversations();
  render();
}

function compactMessages(messages) {
  return messages
    .filter((message) => !message.pending && ["user", "assistant"].includes(message.role) && message.content)
    .slice(-18)
    .map((message) => ({ role: message.role, content: message.content }));
}

function createConversation(persona = state.settings.persona) {
  const conversation = {
    id: randomId(),
    title: "新的对话",
    persona: normalizePersonaId(persona),
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  state.conversations.unshift(conversation);
  state.activeConversationId = conversation.id;
  saveConversations();
  saveValue(STORAGE.activeId, state.activeConversationId);
  return conversation;
}

function ensureConversation() {
  if (!Array.isArray(state.conversations)) state.conversations = [];
  const selected = selectConversationForPersona(state.conversations, state.activeConversationId, state.settings.persona);
  if (selected) {
    state.activeConversationId = selected.id;
    saveConversations();
    return selected;
  }

  return createConversation();
}

function activeConversation() {
  return ensureConversation();
}

function conversationsForCurrentCharacter() {
  return conversationsForPersona(state.conversations, state.settings.persona);
}

function normalizeConversations() {
  state.conversations = normalizeConversationEntries(state.conversations, state.settings.persona, normalizePersonaId);
}

function createMessage(role, content, extra = {}) {
  return {
    id: randomId(),
    role,
    content,
    createdAt: Date.now(),
    ...extra
  };
}

function currentCharacter() {
  return characters[state.settings.persona] ?? characters.tenderSenior;
}

function currentProvider() {
  return providerForId(state.settings.providerId);
}

function createCharacterPortrait(character, className) {
  const portrait = document.createElement("span");
  portrait.className = className;
  portrait.setAttribute("aria-hidden", "true");
  applyPortraitStyle(portrait, character);
  return portrait;
}

function applyPortraitStyle(node, character) {
  node.style.setProperty("--portrait-image", `url("${character.image}")`);
  node.style.setProperty("--portrait-position", character.imagePosition || "50% 50%");
  node.style.setProperty("--portrait-tone", character.imageTone || "var(--romance)");
}

function applyChatBackgroundStyle(character) {
  els.messages.style.setProperty("--chat-bg-image", `url("${character.backgroundImage || character.image}")`);
  els.messages.style.setProperty("--chat-bg-position", character.backgroundPosition || "right center");
  els.messages.style.setProperty("--chat-bg-tone", character.imageTone || "var(--romance)");
}

function canInteract() {
  return state.connected && state.ageConfirmed;
}

function publicServiceError(error) {
  const message = typeof error === "string" ? error : error?.message;
  if (!message) return "智能回复暂时不可用，请稍后再试。";
  if (/hub|api|key|provider|模型配置|供应商|密钥|token/i.test(message)) {
    return "智能回复暂时不可用，请稍后再试。";
  }
  return message;
}

function ensureRelationships() {
  if (!state.relationships || typeof state.relationships !== "object" || Array.isArray(state.relationships)) {
    state.relationships = {};
  }
  for (const id of Object.keys(characters)) {
    if (!state.relationships[id]) state.relationships[id] = { points: 0, updatedAt: Date.now() };
  }
  saveRelationships();
}

function relationshipForCurrentCharacter() {
  ensureRelationships();
  return state.relationships[state.settings.persona];
}

function advanceRelationship() {
  const relationship = relationshipForCurrentCharacter();
  relationship.points = clamp((relationship.points || 0) + 6, 0, 100);
  relationship.updatedAt = Date.now();
  saveRelationships();
}

function currentRelationshipPayload() {
  const relationship = relationshipForCurrentCharacter();
  const stage = stageForPoints(relationship.points);
  return {
    stage: stage.label,
    points: relationship.points,
    character: currentCharacter().title
  };
}

function stageForPoints(points) {
  return relationshipStages
    .slice()
    .reverse()
    .find((stage) => points >= stage.min) ?? relationshipStages[0];
}

function dailyEventForCurrentCharacter() {
  const dateKey = new Date().toLocaleDateString("sv-SE");
  const seed = `${dateKey}:${state.settings.persona}`;
  const score = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return dailyEvents[score % dailyEvents.length];
}

function makeTitle(content) {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized || "新的对话";
}

function lastPreview(conversation) {
  const last = [...conversation.messages].reverse().find((message) => message.content);
  if (!last) return "还没有消息";
  const preview = last.content.replace(/\s+/g, " ").trim();
  return preview.length > 24 ? `${preview.slice(0, 24)}...` : preview;
}

function saveConversations() {
  saveValue(STORAGE.conversations, state.conversations.slice(0, 30));
  saveValue(STORAGE.activeId, state.activeConversationId);
}

function saveMemories() {
  state.memories = normalizeMemoryEntries(state.memories, state.settings.persona, Date.now(), normalizePersonaId);
  saveValue(STORAGE.memories, state.memories);
}

function saveRelationships() {
  saveValue(STORAGE.relationships, state.relationships);
}

function saveBetaEvents() {
  saveValue(STORAGE.betaEvents, state.betaEvents);
}

function saveFeedbackEntries() {
  saveValue(STORAGE.feedbackEntries, state.feedbackEntries);
}

function saveRiskEntries() {
  saveValue(STORAGE.riskEntries, state.riskEntries);
}

function saveSettings() {
  saveValue(STORAGE.settings, state.settings);
}

function autosizeTextarea() {
  els.messageInput.style.height = "auto";
  els.messageInput.style.height = `${Math.min(140, els.messageInput.scrollHeight)}px`;
}

function focusComposer() {
  if (!canInteract()) return;
  window.setTimeout(() => els.messageInput.focus(), 20);
}

function normalizePersonaId(value) {
  if (characters[value]) return value;
  return legacyPersonaMap[value] ?? "tenderSenior";
}

function characterTitle(persona) {
  return characters[persona]?.title ?? "未知角色";
}

function formatTime(value) {
  const date = new Date(Number(value) || Date.now());
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function getOrCreateUserId() {
  const existing = loadValue(STORAGE.userId, "");
  if (existing) return existing;
  const userId = `browser-${randomId()}`;
  saveValue(STORAGE.userId, userId);
  return userId;
}

function loadValue(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveValue(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function randomId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function replaceChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function byId(id) {
  return document.getElementById(id);
}
