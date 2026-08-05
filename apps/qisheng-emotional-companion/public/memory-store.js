export const MEMORY_TYPE_OPTIONS = [
  { value: "nickname", label: "称呼" },
  { value: "preference", label: "偏好" },
  { value: "boundary", label: "雷区" },
  { value: "anniversary", label: "纪念日" },
  { value: "recent_event", label: "最近事件" },
  { value: "relationship_note", label: "关系备注" }
];

const MEMORY_LABELS = Object.fromEntries(MEMORY_TYPE_OPTIONS.map((option) => [option.value, option.label]));
const MEMORY_TYPE_VALUES = new Set(MEMORY_TYPE_OPTIONS.map((option) => option.value));
const PROMPT_ORDER = ["nickname", "preference", "boundary", "anniversary", "recent_event", "relationship_note"];

export function normalizeMemoryEntries(entries, currentPersona = "", now = Date.now(), normalizePersona = defaultPersona) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => normalizeMemoryEntry(entry, currentPersona, now, normalizePersona))
    .filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 50);
}

export function createMemoryEntry(input, now = Date.now(), normalizePersona = defaultPersona) {
  const type = normalizeMemoryType(input?.type);
  const text = sanitizeLongText(input?.text ?? input?.content, 300);
  if (!text) return null;
  const persona = normalizePersona(sanitizeShortText(input?.persona, 32));
  return {
    id: sanitizeShortText(input?.id, 80) || makeId("memory"),
    type,
    label: memoryTypeLabel(type),
    text,
    persona,
    sourceMessageId: sanitizeShortText(input?.sourceMessageId, 80),
    createdAt: Number(input?.createdAt) || now,
    updatedAt: Number(input?.updatedAt) || Number(input?.createdAt) || now
  };
}

export function updateMemoryEntry(entries, id, patch, now = Date.now(), normalizePersona = defaultPersona) {
  const targetId = sanitizeShortText(id, 80);
  return normalizeMemoryEntries(entries, "", now, normalizePersona).map((entry) => {
    if (entry.id !== targetId) return entry;
    const next = createMemoryEntry({
      ...entry,
      ...patch,
      id: entry.id,
      createdAt: entry.createdAt,
      updatedAt: now
    }, now, normalizePersona);
    return next ?? entry;
  });
}

export function buildMemoryPromptLines(entries, persona = "") {
  const normalized = normalizeMemoryEntries(entries).filter((memory) => {
    return !persona || !memory.persona || memory.persona === persona;
  });
  const lines = [];
  for (const type of PROMPT_ORDER) {
    const values = normalized
      .filter((memory) => memory.type === type)
      .map((memory) => memory.text)
      .filter(unique)
      .slice(0, type === "recent_event" ? 3 : 4);
    if (!values.length) continue;
    lines.push(`${memoryTypeLabel(type)}：${values.join("；")}`);
  }
  return lines.slice(0, 12);
}

export function memoryTypeLabel(type) {
  return MEMORY_LABELS[type] ?? MEMORY_LABELS.relationship_note;
}

function normalizeMemoryEntry(entry, currentPersona, now, normalizePersona) {
  if (typeof entry === "string") {
    return createMemoryEntry({
      type: "relationship_note",
      text: entry,
      persona: currentPersona,
      createdAt: now,
      updatedAt: now
    }, now, normalizePersona);
  }
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  return createMemoryEntry({
    id: entry.id,
    type: entry.type,
    text: entry.text ?? entry.content,
    persona: entry.persona || currentPersona,
    sourceMessageId: entry.sourceMessageId,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  }, now, normalizePersona);
}

function normalizeMemoryType(type) {
  return MEMORY_TYPE_VALUES.has(type) ? type : "relationship_note";
}

function defaultPersona(value) {
  return value || "";
}

function sanitizeShortText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeLongText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function unique(value, index, array) {
  return array.indexOf(value) === index;
}

function makeId(prefix) {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}
