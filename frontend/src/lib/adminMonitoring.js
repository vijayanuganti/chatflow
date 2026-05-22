/** True when any participant in a conversation is an admin (exclude from monitoring list). */
export function conversationIncludesAdmin(conv) {
  const infos = conv?.participants_info;
  if (Array.isArray(infos) && infos.length > 0) {
    return infos.some((p) => String(p?.role || "").toLowerCase() === "admin");
  }
  return false;
}

/** Monitoring tab: employee↔employee and employee↔client only. */
export function filterMonitoringConversations(conversations) {
  return (conversations || []).filter((c) => !conversationIncludesAdmin(c));
}

/** Admin must not open direct chats with clients (UI only). */
export function adminCanChatWithUser(otherUser) {
  if (!otherUser) return false;
  return String(otherUser.role || "").toLowerCase() !== "client";
}

export function filterAdminMyChatConversations(conversations) {
  return (conversations || []).filter((c) => {
    if (c.type === "group") return true;
    return adminCanChatWithUser(c.other_user);
  });
}
