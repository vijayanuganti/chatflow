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
