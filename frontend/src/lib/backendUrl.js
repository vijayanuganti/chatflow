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

/** Origin only — strips trailing `/api` so paths are not doubled (…/api/api/…). */
export function normalizeBackendOrigin(url) {
  let origin = trimUrl(url);
  if (origin.toLowerCase().endsWith("/api")) {
    origin = origin.slice(0, -4);
  }
  return origin;
}

/** Join origin + path segments without duplicate slashes (preserves `https://`). */
export function joinBackendPath(origin, ...segments) {
  const base = normalizeBackendOrigin(origin);
  if (!base) return "";
  const tail = segments
    .map((s) => String(s ?? "").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
  return tail ? `${base}/${tail}` : base;
}

function isBlockedNativeHost(hostname) {
  const h = (hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function isValidHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Resolves the FastAPI base URL (no path, no trailing slash).
 *
 * Priority (all platforms): `REACT_APP_BASE_URL` → mobile/general env pair.
 *
 * - **Capacitor (native):** `REACT_APP_BACKEND_URL_MOBILE`, then `REACT_APP_BACKEND_URL`.
 *   Never uses localhost — set your PC LAN IP (e.g. http://192.168.1.13:8000).
 * - **Browser + development:** same host as the page, port `8001`.
 * - **Browser + production:** `REACT_APP_BACKEND_URL`.
 */
export function resolveBackendUrl() {
  const explicit = trimUrl(process.env.REACT_APP_BASE_URL);
  const mobile = trimUrl(process.env.REACT_APP_BACKEND_URL_MOBILE);
  const general = trimUrl(process.env.REACT_APP_BACKEND_URL);

  if (typeof window === "undefined") {
    return explicit || general || mobile || "";
  }

  if (isCapacitorNative()) {
    const candidate = normalizeBackendOrigin(explicit || mobile || general || "");
    if (!candidate) {
      console.error(
        "[api] Native app has no BASE_URL. Set REACT_APP_BACKEND_URL_MOBILE " +
          "(e.g. http://192.168.1.13:8000) in frontend/.env and rebuild: npm run build:mobile",
      );
      return "";
    }
    if (!isValidHttpUrl(candidate)) {
      console.error("[api] Invalid BASE_URL for native:", candidate);
      return "";
    }
    const host = new URL(candidate).hostname;
    if (isBlockedNativeHost(host)) {
      console.error(
        "[api] Native app cannot use localhost. Set REACT_APP_BACKEND_URL_MOBILE to your PC LAN IP " +
          "(e.g. http://192.168.1.13:8000), then rebuild.",
      );
      return "";
    }
    return candidate;
  }

  if (explicit) return explicit;

  if (process.env.NODE_ENV === "development") {
    return `${window.location.protocol}//${window.location.hostname}:8001`;
  }

  if (general) return general;
  return "";
}

/**
 * Native-only: URL from REACT_APP_BACKEND_URL_MOBILE (baked at build time).
 * Used for FCM token registration so the POST always targets the mobile env var.
 */
export function getMobileBackendUrlFromEnv() {
  const explicit = normalizeBackendOrigin(process.env.REACT_APP_BASE_URL);
  const mobile = normalizeBackendOrigin(process.env.REACT_APP_BACKEND_URL_MOBILE);
  return explicit || mobile || "";
}
