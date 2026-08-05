export function conversationsForPersona(conversations, persona) {
  if (!Array.isArray(conversations)) return [];
  return conversations.filter((conversation) => conversation?.persona === persona);
}

export function normalizeConversationEntries(conversations, currentPersona, normalizePersonaId, now = Date.now()) {
  if (!Array.isArray(conversations)) return [];
  return conversations
    .filter((conversation) => conversation && typeof conversation === "object")
    .map((conversation) => ({
      ...conversation,
      persona: normalizePersonaId(conversation.persona || currentPersona),
      messages: Array.isArray(conversation.messages) ? conversation.messages : [],
      createdAt: Number(conversation.createdAt) || now,
      updatedAt: Number(conversation.updatedAt) || Number(conversation.createdAt) || now
    }));
}

export function selectConversationForPersona(conversations, activeConversationId, persona) {
  const scopedConversations = conversationsForPersona(conversations, persona);
  const active = scopedConversations.find((conversation) => conversation.id === activeConversationId);
  if (active) return active;
  return scopedConversations.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}
