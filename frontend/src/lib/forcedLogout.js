import { api, clearAuthSession, getStoredAccessToken } from "./api";
import { clearStoredActiveConversationId } from "./activeConversationStorage";
import { executeLogout } from "./logoutFlow";
import { runLoggedOutNotificationGuard } from "./logoutCleanup";

export const LOGOUT_REASON_ANOTHER_DEVICE = "logged_in_on_another_device";

export const FORCE_LOGOUT_PENDING_KEY = "cf_force_logout_pending";
export const FORCE_LOGOUT_MESSAGE_KEY = "cf_force_logout_message";

export { registerLogoutCleanup, runLogoutRegistryCleanup as runCleanup } from "./logoutRegistry";

export { getForceLogoutMessage, consumeForceLogoutPending } from "./logoutFlow";

/** Parse 401 response for single-session invalidation (not browser-id or generic auth errors). */
export function get401LogoutReason(err) {
  if (err?.response?.status !== 401) return null;
  const detail = err?.response?.data?.detail;
  if (detail === LOGOUT_REASON_ANOTHER_DEVICE) return LOGOUT_REASON_ANOTHER_DEVICE;
  if (detail && typeof detail === "object" && detail.code === LOGOUT_REASON_ANOTHER_DEVICE) {
    return LOGOUT_REASON_ANOTHER_DEVICE;
  }
  if (typeof detail === "string" && detail === "token_expired") {
    return LOGOUT_REASON_ANOTHER_DEVICE;
  }
  return null;
}

/**
 * Immediate logout: tear down notifications, clear storage, navigate to login.
 */
export function performForcedLogout({
  reason = LOGOUT_REASON_ANOTHER_DEVICE,
  showModal = true,
} = {}) {
  void executeLogout({
    mode: "force",
    reason,
    showModal,
    navigateToLogin: true,
  });
}

export async function validateSessionQuick() {
  const token = getStoredAccessToken();
  if (!token) {
    await runLoggedOutNotificationGuard();
    return { valid: false, reason: "no_token" };
  }
  try {
    const res = await api.get("/auth/session/validate");
    return res.data || { valid: false };
  } catch (err) {
    const reason = get401LogoutReason(err);
    if (reason) return { valid: false, reason };
    throw err;
  }
}

/** Legacy path when verify fails without force-logout reason. */
export function clearSessionLocally() {
  clearAuthSession();
  clearStoredActiveConversationId();
}
