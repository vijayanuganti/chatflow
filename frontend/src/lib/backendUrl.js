import { Capacitor } from "@capacitor/core";

/** True when running inside the native Capacitor shell (Android / iOS). */
export function isCapacitorNative() {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

function trimUrl(value) {
  return String(value ?? "")
    .trim()
    .replace(/\/$/, "");
}

/**
 * Resolves the FastAPI base URL (no path, no trailing slash).
 *
 * - **Capacitor (native):** `REACT_APP_BACKEND_URL_MOBILE`, then `REACT_APP_BACKEND_URL`.
 * - **Browser + development:** same host as the page, port `8001` (CRA on localhost or LAN IP).
 * - **Browser + production:** `REACT_APP_BACKEND_URL` (e.g. hosted static site → public API).
 */
export function resolveBackendUrl() {
  const mobile = trimUrl(process.env.REACT_APP_BACKEND_URL_MOBILE);
  const general = trimUrl(process.env.REACT_APP_BACKEND_URL);

  if (typeof window === "undefined") {
    return general || mobile || "";
  }

  if (isCapacitorNative()) {
    if (mobile) return mobile;
    if (general) return general;
    return "";
  }

  if (process.env.NODE_ENV === "development") {
    return `${window.location.protocol}//${window.location.hostname}:8001`;
  }

  if (general) return general;
  return "";
}
