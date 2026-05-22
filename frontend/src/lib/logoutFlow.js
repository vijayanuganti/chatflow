import { abortPendingApiRequests } from "./api";
import { runLogoutRegistryCleanup } from "./logoutRegistry";
import {
  finalizeClientLogout,
  postServerLogout,
  runLoggedOutNotificationGuard,
  runLogoutNotificationCleanup,
} from "./logoutCleanup";

export const FORCE_LOGOUT_PENDING_KEY = "cf_force_logout_pending";
export const FORCE_LOGOUT_MESSAGE_KEY = "cf_force_logout_message";

const DEFAULT_MESSAGE =
  "Your account has been logged out because it was opened on another device.";

let logoutInProgress = false;

export function getForceLogoutMessage(reason) {
  if (reason === "logged_in_on_another_device") return DEFAULT_MESSAGE;
  return DEFAULT_MESSAGE;
}

/**
 * Unified logout: notifications first, then auth clear, then navigate.
 */
export async function executeLogout({
  mode = "manual",
  reason = "logged_in_on_another_device",
  showModal = false,
  navigateToLogin = true,
} = {}) {
  if (logoutInProgress) return;
  logoutInProgress = true;

  try {
    await runLogoutNotificationCleanup({ skipServer: false });

    if (mode === "manual") {
      await postServerLogout();
    }

    abortPendingApiRequests();
    runLogoutRegistryCleanup();
    await finalizeClientLogout();

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
    if (navigateToLogin && !path.startsWith("/login")) {
      window.location.replace("/login");
    }
  } finally {
    if (!navigateToLogin || (window.location?.pathname || "").startsWith("/login")) {
      logoutInProgress = false;
    }
  }
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

export async function guardNotificationsOnLaunch() {
  await runLoggedOutNotificationGuard();
}
