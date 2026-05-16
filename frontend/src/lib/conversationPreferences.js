import { api } from "@/lib/api";

/** Apply a preference patch locally on the conversations array. */
export function patchConversationPrefs(conversations, convId, patch) {
  return conversations.map((c) => (c.id === convId ? { ...c, ...patch } : c));
}

export async function updateConversationPreferences(convId, patch) {
  const res = await api.patch(`/conversations/${convId}/preferences`, patch);
  return res.data;
}

/** Split active vs archived; pinned order is preserved from the API. */
export function partitionConversations(conversations, { archived = false } = {}) {
  const list = conversations || [];
  if (archived) {
    return list.filter((c) => c.is_archived);
  }
  return list.filter((c) => !c.is_archived);
}
