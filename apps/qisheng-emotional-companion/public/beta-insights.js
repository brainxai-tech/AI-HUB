export const BETA_EVENT_TYPES = new Set([
  "age_confirm",
  "api_connected",
  "conversation_created",
  "message_sent",
  "assistant_reply",
  "voice_play",
  "memory_save",
  "daily_event_start",
  "safety_block",
  "feedback_submit"
]);

export const FEEDBACK_OPTIONS = [
  { value: "persona_break", label: "人设不稳", risk: false },
  { value: "too_greasy", label: "太油腻", risk: false },
  { value: "voice_mismatch", label: "语音不合适", risk: false },
  { value: "memory_wrong", label: "记忆错误", risk: false },
  { value: "safety_risk", label: "安全风险", risk: true }
];

const FEEDBACK_VALUES = new Set(FEEDBACK_OPTIONS.map((option) => option.value));

export function normalizeBetaEvents(entries) {
  return Array.isArray(entries)
    ? entries.filter(isObject).map(normalizeBetaEvent).filter(Boolean).slice(-500)
    : [];
}

export function normalizeFeedbackEntries(entries) {
  return Array.isArray(entries)
    ? entries.filter(isObject).map(normalizeFeedbackEntry).filter(Boolean).slice(0, 200)
    : [];
}

export function normalizeRiskEntries(entries) {
  return Array.isArray(entries)
    ? entries.filter(isObject).map(normalizeRiskEntry).filter(Boolean).slice(0, 200)
    : [];
}

export function createBetaEvent(input, now = Date.now()) {
  const type = BETA_EVENT_TYPES.has(input?.type) ? input.type : "";
  if (!type) return null;
  return {
    id: input.id || makeId("evt"),
    type,
    persona: sanitizeShortText(input.persona, 32),
    conversationId: sanitizeShortText(input.conversationId, 80),
    messageId: sanitizeShortText(input.messageId, 80),
    detail: sanitizeDetail(input.detail),
    createdAt: Number(input.createdAt) || now
  };
}

export function createFeedbackEntry(input, now = Date.now()) {
  const type = FEEDBACK_VALUES.has(input?.type) ? input.type : "persona_break";
  const option = FEEDBACK_OPTIONS.find((item) => item.value === type) ?? FEEDBACK_OPTIONS[0];
  return {
    id: input.id || makeId("fb"),
    type,
    label: option.label,
    risk: option.risk,
    persona: sanitizeShortText(input.persona, 32),
    conversationId: sanitizeShortText(input.conversationId, 80),
    messageId: sanitizeShortText(input.messageId, 80),
    messageExcerpt: sanitizeLongText(input.messageExcerpt, 180),
    note: sanitizeLongText(input.note, 240),
    createdAt: Number(input.createdAt) || now
  };
}

export function createRiskEntry(input, now = Date.now()) {
  return {
    id: input.id || makeId("risk"),
    source: sanitizeShortText(input.source, 32) || "manual",
    issueType: sanitizeShortText(input.issueType, 40) || "safety_risk",
    persona: sanitizeShortText(input.persona, 32),
    conversationId: sanitizeShortText(input.conversationId, 80),
    messageId: sanitizeShortText(input.messageId, 80),
    summary: sanitizeLongText(input.summary, 240),
    createdAt: Number(input.createdAt) || now
  };
}

export function summarizeBetaData({ events = [], feedback = [], risks = [] }) {
  return {
    events: events.length,
    feedback: feedback.length,
    risks: risks.length,
    voicePlays: countEvents(events, "voice_play"),
    messagesSent: countEvents(events, "message_sent"),
    memoriesSaved: countEvents(events, "memory_save"),
    dailyEventsStarted: countEvents(events, "daily_event_start")
  };
}

export function buildBetaExport(input, exportedAt = new Date().toISOString()) {
  const events = normalizeBetaEvents(input.events);
  const feedback = normalizeFeedbackEntries(input.feedback);
  const risks = normalizeRiskEntries(input.risks);
  return {
    type: "qisheng-beta-export",
    version: 1,
    exportedAt,
    userId: sanitizeShortText(input.userId, 120),
    app: {
      persona: sanitizeShortText(input.settings?.persona, 32),
      model: sanitizeShortText(input.settings?.model, 40),
      temperature: Number(input.settings?.temperature) || 0.72,
      ageConfirmed: Boolean(input.ageConfirmed)
    },
    summary: {
      ...summarizeBetaData({ events, feedback, risks }),
      memoryTypes: summarizeMemoryTypes(input.memories)
    },
    relationships: sanitizeRelationshipMap(input.relationships),
    conversations: summarizeConversations(input.conversations),
    memories: summarizeMemories(input.memories),
    events,
    feedback,
    risks
  };
}

function normalizeBetaEvent(entry) {
  return createBetaEvent(entry, Number(entry.createdAt) || Date.now());
}

function normalizeFeedbackEntry(entry) {
  return createFeedbackEntry(entry, Number(entry.createdAt) || Date.now());
}

function normalizeRiskEntry(entry) {
  return createRiskEntry(entry, Number(entry.createdAt) || Date.now());
}

function summarizeConversations(conversations) {
  if (!Array.isArray(conversations)) return [];
  return conversations.slice(0, 30).map((conversation) => ({
    id: sanitizeShortText(conversation?.id, 80),
    persona: sanitizeShortText(conversation?.persona, 32),
    title: sanitizeLongText(conversation?.title, 80),
    messageCount: Array.isArray(conversation?.messages) ? conversation.messages.length : 0,
    createdAt: Number(conversation?.createdAt) || 0,
    updatedAt: Number(conversation?.updatedAt) || 0
  }));
}

function summarizeMemories(memories) {
  if (!Array.isArray(memories)) return [];
  return memories.slice(0, 50).map((memory) => ({
    id: sanitizeShortText(memory?.id, 80),
    type: sanitizeShortText(memory?.type, 40),
    label: sanitizeShortText(memory?.label, 40),
    persona: sanitizeShortText(memory?.persona, 32),
    length: memoryTextLength(memory),
    createdAt: Number(memory?.createdAt) || 0
  }));
}

function summarizeMemoryTypes(memories) {
  if (!Array.isArray(memories)) return {};
  return memories.reduce((counts, memory) => {
    const type = sanitizeShortText(memory?.type, 40) || "relationship_note";
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});
}

function memoryTextLength(memory) {
  if (typeof memory?.text === "string") return memory.text.length;
  if (typeof memory?.content === "string") return memory.content.length;
  return 0;
}

function sanitizeRelationshipMap(relationships) {
  if (!relationships || typeof relationships !== "object" || Array.isArray(relationships)) return {};
  return Object.fromEntries(Object.entries(relationships).map(([key, value]) => [
    sanitizeShortText(key, 32),
    {
      points: clamp(Number(value?.points) || 0, 0, 100),
      updatedAt: Number(value?.updatedAt) || 0
    }
  ]));
}

function sanitizeDetail(detail) {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return {};
  const entries = Object.entries(detail)
    .slice(0, 12)
    .map(([key, value]) => [sanitizeShortText(key, 32), sanitizeLongText(String(value ?? ""), 160)])
    .filter(([key]) => key);
  return Object.fromEntries(entries);
}

function countEvents(events, type) {
  return events.filter((event) => event.type === type).length;
}

function sanitizeShortText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeLongText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function makeId(prefix) {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
