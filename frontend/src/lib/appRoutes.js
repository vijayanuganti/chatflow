/** Role-aware full-screen page paths and navigation state helpers. */

export function panelBase(role) {
  return role === "admin" ? "/admin" : "/chat";
}

export function adminTabPath(tab) {
  if (!tab || tab === "overview") return "/admin";
  return `/admin/${tab}`;
}

/** Back target when leaving a screen opened from an admin chat tab. */
export function adminChatTabBackTo(tab) {
  if (tab === "chats") return "/admin/chats";
  if (tab === "mychats") return "/admin/mychats";
  if (tab === "batches") return "/admin/batches";
  return adminTabPath(tab);
}

/** Restore admin pane state after returning from profile / diet / medical. */
export function buildPendingChatState({
  tab,
  conversation,
  mobileChatStep = "chat",
  mobileBatchesStep = "chat",
}) {
  if (!conversation?.id) return undefined;
  const base = { selectedConv: conversation };
  if (tab === "batches") {
    return { ...base, tab: "batches", mobileBatchesStep };
  }
  return {
    ...base,
    tab: tab === "chats" ? "chats" : "mychats",
    mobileChatStep,
  };
}

export function resolveBackTo(locationState, fallback) {
  const fromState = locationState?.backTo;
  return typeof fromState === "string" && fromState.length > 0 ? fromState : fallback;
}

/** Push notification tap / cold-start open target. */
export function notificationNavigationTarget(role, conversationId) {
  if (role === "admin") {
    if (conversationId) {
      return {
        pathname: "/admin/mychats",
        search: `?c=${encodeURIComponent(conversationId)}`,
      };
    }
    return { pathname: "/admin/mychats" };
  }
  if (conversationId) {
    return {
      pathname: "/chat",
      search: `?c=${encodeURIComponent(conversationId)}`,
    };
  }
  return { pathname: "/chat" };
}

/** `location.state` for the new-conversation full-screen flow. */
export function newConversationState(role, adminTab = "mychats") {
  if (role === "admin") {
    return { backTo: adminChatTabBackTo(adminTab), panel: "admin" };
  }
  return { backTo: "/chat", panel: "chat" };
}

export function profilePath(role) {
  return `${panelBase(role)}/profile`;
}

export function createAccountPath(role) {
  return `${panelBase(role)}/create-account`;
}

/** Client self-view or employee viewing a client in chat. */
export function medicalPath(role, userId) {
  if (role === "admin" && userId) {
    return `/admin/users/${userId}/medical`;
  }
  if (userId) {
    return `/chat/medical/${userId}`;
  }
  return "/chat/medical";
}

export function resetPasswordPath(userId) {
  return `/admin/users/${userId}/reset-password`;
}

export function userAccountPath(userId) {
  return `/admin/users/${userId}`;
}

export function employeeDetailPath(userId) {
  return `/admin/users/${userId}/employee`;
}

export function employeeBatchClientsPath(userId, batchId) {
  return `/admin/users/${userId}/employee/batches/${batchId}`;
}

export function newConversationPath() {
  return "/chat/new-conversation";
}

/** Client raise-complaint full-screen page (from chats menu). */
export function raiseComplaintPath() {
  return "/chat/complaint";
}

/** Employee / client call history (voice). */
export function callHistoryPath() {
  return "/chat/calls";
}

export function ringtoneSettingsPath(role) {
  return `${panelBase(role)}/settings/ringtone`;
}

export function adminCallLogsPath() {
  return "/admin/calllogs";
}

/** Contact info page for a user in a direct chat. */
export function userProfilePath(role, userId) {
  if (role === "admin") {
    return `/admin/contact/${userId}`;
  }
  return `/chat/contact/${userId}`;
}

export function dietPlanPath(role, clientId) {
  if (role === "admin" && clientId) {
    return `/admin/users/${clientId}/diet-plan`;
  }
  if (clientId) {
    return `/chat/diet-plan/${clientId}`;
  }
  return "/chat/diet-plan";
}
