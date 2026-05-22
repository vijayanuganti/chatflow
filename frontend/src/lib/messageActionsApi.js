import { api } from "@/lib/api";

export async function editMessageContent(messageId, content) {
  const res = await api.patch(`/messages/${messageId}`, { content });
  return res.data;
}

export async function starMessage(messageId) {
  const res = await api.post(`/messages/${messageId}/star`);
  return res.data;
}

export async function unstarMessage(messageId) {
  const res = await api.delete(`/messages/${messageId}/star`);
  return res.data;
}

export async function fetchStarredMessages(conversationId) {
  const res = await api.get(`/conversations/${conversationId}/starred`);
  return res.data || [];
}
