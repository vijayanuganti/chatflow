/** Role-aware full-screen page paths (no modals). */

export function panelBase(role) {
  return role === "admin" ? "/admin" : "/chat";
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

export function newConversationPath() {
  return "/chat/new-conversation";
}

/** Diet plan for self (client) or a specific client in chat. */
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
