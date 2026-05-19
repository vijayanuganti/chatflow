/**
 * Client / employee chat panel drill-down via URL (?c=conversationId).
 * Flow: /chat (list) -> /chat?c=id (thread) -> full-screen sub-routes (diet, settings, medical).
 */

export const CHAT_CONVERSATION_QUERY = "c";

export function getChatConversationId(searchParams) {
  const id =
    searchParams.get(CHAT_CONVERSATION_QUERY) ||
    searchParams.get("open_conversation");
  return id && id.length > 0 ? id : null;
}

export function buildChatSearchParams({ conversationId, base } = {}) {
  const sp = new URLSearchParams(base?.toString() || "");
  if (conversationId) sp.set(CHAT_CONVERSATION_QUERY, conversationId);
  else sp.delete(CHAT_CONVERSATION_QUERY);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function chatOpenTarget(conversationId) {
  return { pathname: "/chat", search: buildChatSearchParams({ conversationId }) };
}

export function chatListTarget() {
  return { pathname: "/chat", search: "" };
}
