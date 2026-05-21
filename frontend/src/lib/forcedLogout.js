import { abortPendingApiRequests, api, clearAuthSession, getStoredAccessToken } from "./api";
import { clearStoredActiveConversationId } from "./activeConversationStorage";

export const LOGOUT_REASON_ANOTHER_DEVICE = "logged_in_on_another_device";

export const FORCE_LOGOUT_PENDING_KEY = "cf_force_logout_pending";
export const FORCE_LOGOUT_MESSAGE_KEY = "cf_force_logout_message";

const DEFAULT_MESSAGE =
  "Your account has been logged out because it was opened on another device.";

let logoutInProgress = false;
const cleanupFns = new Set();

/** Register interval/timeout cleanup (called on force logout). */
export function registerLogoutCleanup(fn) {
  if (typeof fn === "function") cleanupFns.add(fn);
  return () => cleanupFns.delete(fn);
}

function runCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function getForceLogoutMessage(reason) {
  if (reason === LOGOUT_REASON_ANOTHER_DEVICE) return DEFAULT_MESSAGE;
  return DEFAULT_MESSAGE;
}

/** Parse 401 response for single-session invalidation. */
export function get401LogoutReason(err) {
  if (err?.response?.status !== 401) return null;
  const detail = err?.response?.data?.detail;
  if (detail === LOGOUT_REASON_ANOTHER_DEVICE) return LOGOUT_REASON_ANOTHER_DEVICE;
  if (detail && typeof detail === "object" && detail.code === LOGOUT_REASON_ANOTHER_DEVICE) {
    return LOGOUT_REASON_ANOTHER_DEVICE;
  }
  if (typeof detail === "string") {
    const lower = detail.toLowerCase();
    if (
      lower.includes("session expired")
      || lower.includes("session is not valid")
      || lower.includes("sign in again")
    ) {
      return LOGOUT_REASON_ANOTHER_DEVICE;
    }
  }
  return null;
}

export function consumeForceLogoutPending() {
  try {
    const pending = sessionStorage.getItem(FORCE_LOGOUT_PENDING_KEY);
    if (!pending) return false;
    sessionStorage.removeItem(FORCE_LOGOUT_PENDING_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Immediate logout: clear storage, stop timers, hard-navigate to login, show modal there.
 */
export function performForcedLogout({
  reason = LOGOUT_REASON_ANOTHER_DEVICE,
  showModal = true,
} = {}) {
  if (logoutInProgress) return;
  logoutInProgress = true;

  abortPendingApiRequests();
  runCleanup();
  clearAuthSession();
  clearStoredActiveConversationId();

  if (showModal) {
    try {
      sessionStorage.setItem(FORCE_LOGOUT_PENDING_KEY, "1");
      sessionStorage.setItem(FORCE_LOGOUT_MESSAGE_KEY, getForceLogoutMessage(reason));
    } catch {
      /* ignore */
    }
  }

  try {
    window.dispatchEvent(
      new CustomEvent("chatflow:force_logout", { detail: { reason } }),
    );
  } catch {
    /* ignore */
  }

  const path = window.location?.pathname || "";
  if (!path.startsWith("/login")) {
    window.location.replace("/login");
  } else {
    logoutInProgress = false;
  }
}

export async function validateSessionQuick() {
  const token = getStoredAccessToken();
  if (!token) return { valid: false, reason: "no_token" };
  try {
    const res = await api.get("/auth/session/validate");
    return res.data || { valid: false };
  } catch (err) {
    const reason = get401LogoutReason(err);
    if (reason) return { valid: false, reason };
    throw err;
  }
}
