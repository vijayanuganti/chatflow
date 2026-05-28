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

/**
 * Admin monitoring bubble alignment: client messages left, employee messages right
 * (WhatsApp-style). Employee↔employee threads: first employee left, second right.
 */
export function monitoringBubbleAlignRight(message, conversation) {
  const senderId = String(message?.sender_id ?? "");
  if (!senderId) return false;

  const infos = conversation?.participants_info || [];
  if (infos.length > 0) {
    const client = infos.find((p) => String(p?.role || "").toLowerCase() === "client");
    const employees = infos.filter((p) => String(p?.role || "").toLowerCase() === "employee");

    if (client?.id && senderId === String(client.id)) return false;
    if (employees.some((e) => String(e.id) === senderId)) {
      if (employees.length >= 2) {
        return senderId === String(employees[employees.length - 1].id);
      }
      return true;
    }
  }

  const participants = conversation?.participants || [];
  if (participants.length > 0) {
    return senderId === String(participants[participants.length - 1]);
  }
  return false;
}
