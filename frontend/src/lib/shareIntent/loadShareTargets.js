import { api } from "@/lib/api";
import { isClientPortalUser } from "@/lib/clientChat";

/**
 * Conversations the user can send a shared file to.
 * @param {object} user
 */
export async function loadShareConversations(user) {
  if (!user?.id) return [];
  if (isClientPortalUser(user)) {
    const res = await api.get("/conversations/assigned-employee");
    const conv = res.data?.conversation;
    return conv ? [conv] : [];
  }
  const res = await api.get("/conversations");
  return Array.isArray(res.data) ? res.data : [];
}
