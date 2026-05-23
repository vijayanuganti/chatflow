import axios from "axios";

import { get401LogoutReason, performForcedLogout } from "./forcedLogout";

let apiAbortController = new AbortController();

/** Abort in-flight HTTP requests (force logout). */
export function abortPendingApiRequests() {
  apiAbortController.abort();
  apiAbortController = new AbortController();
}
import {
  getMobileBackendUrlFromEnv,
  isCapacitorNative,
  joinBackendPath,
  normalizeBackendOrigin,
  resolveBackendUrl,
} from "./backendUrl";

/**
 * Auth material:
 * - `sessionStorage`: always used for the active tab copy (so each tab has an explicit copy).
 * - `localStorage`: only when "Stay signed in" is enabled (`cf_remember_auth === '1'`).
 *   Then new tabs/windows in the *same Chrome profile* can restore the session.
 * - Different Chrome **profiles** always have separate storage; they never share tokens.
 *   Switching Gmail inside the same Chrome user is *not* a separate profile.
 */
export const AUTH_TOKEN_KEY = "cf_access_token";
export const AUTH_USER_KEY = "cf_user";
export const AUTH_REMEMBER_KEY = "cf_remember_auth";

/** Stable per Chrome profile / origin — sent with API + WS so JWTs cannot be replayed from another install. */
export const BROWSER_ID_KEY = "cf_browser_id";
export const BROWSER_ID_HEADER = "X-ChatFlow-Browser-Id";

export function getOrCreateBrowserId() {
  if (typeof window === "undefined") return "";
  try {
    let id = (localStorage.getItem(BROWSER_ID_KEY) || "").trim();
    if (!id) {
      id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `b-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem(BROWSER_ID_KEY, id);
    }
    return id;
  } catch {
    try {
      let sid = (sessionStorage.getItem(BROWSER_ID_KEY) || "").trim();
      if (!sid) {
        sid =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `b-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        sessionStorage.setItem(BROWSER_ID_KEY, sid);
      }
      return sid;
    } catch {
      return "";
    }
  }
}

/** @param {string} token */
function decodeJwtPayload(token) {
  try {
    const parts = String(token).split(".");
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad) b64 += "=".repeat(4 - pad);
    const json = atob(b64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Persist JWT browser id locally so the next request sends a matching header. */
export function syncBrowserIdFromToken(token) {
  const p = decodeJwtPayload(token);
  const bid = p?.bid != null ? String(p.bid).trim() : "";
  if (!bid) return false;
  try {
    localStorage.setItem(BROWSER_ID_KEY, bid);
    sessionStorage.setItem(BROWSER_ID_KEY, bid);
  } catch {
    return false;
  }
  return true;
}

/** JWT `bid` must match this install; align storage from the token when possible. */
function tokenMatchesThisInstall(token) {
  const p = decodeJwtPayload(token);
  if (!p) return false;
  const bid = p.bid;
  if (bid == null || String(bid).trim() === "") return false;
  const bidStr = String(bid).trim();
  const install = getOrCreateBrowserId();
  if (install === bidStr) return true;
  return syncBrowserIdFromToken(token);
}

let didMigrateSessionToLocal = false;

/** One-time: legacy installs had a token in localStorage without `cf_remember_auth`. */
export function migrateAuthFromSessionStorage() {
  if (didMigrateSessionToLocal || typeof window === "undefined") return;
  didMigrateSessionToLocal = true;
  try {
    const lt = (localStorage.getItem(AUTH_TOKEN_KEY) || "").trim();
    if (lt && !localStorage.getItem(AUTH_REMEMBER_KEY)) {
      localStorage.setItem(AUTH_REMEMBER_KEY, "1");
    }
  } catch {
    /* ignore */
  }
}

export function getStoredAccessToken() {
  migrateAuthFromSessionStorage();
  try {
    const st = (sessionStorage.getItem(AUTH_TOKEN_KEY) || "").trim();
    if (st) {
      if (!tokenMatchesThisInstall(st)) return null;
      return st;
    }

    const remember = (localStorage.getItem(AUTH_REMEMBER_KEY) || "").trim();
    const lt = (localStorage.getItem(AUTH_TOKEN_KEY) || "").trim();
    if (!lt) return null;
    if (!tokenMatchesThisInstall(lt)) return null;
    // Explicit "this browser is not remembered" — do not hydrate from localStorage.
    if (remember === "0") return null;

    if (remember === "1" || remember === "") {
      if (remember === "") {
        try {
          localStorage.setItem(AUTH_REMEMBER_KEY, "1");
        } catch {
          /* ignore */
        }
      }
      try {
        sessionStorage.setItem(AUTH_TOKEN_KEY, lt);
      } catch {
        /* ignore */
      }
      return lt;
    }
    return null;
  } catch {
    return null;
  }
}

/** @param {string|null|undefined} token @param {boolean} [remember=true] */
export function setStoredAccessToken(token, remember = true) {
  try {
    if (token) {
      syncBrowserIdFromToken(token);
      sessionStorage.setItem(AUTH_TOKEN_KEY, token);
      if (remember) {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
        localStorage.setItem(AUTH_REMEMBER_KEY, "1");
      } else {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.setItem(AUTH_REMEMBER_KEY, "0");
      }
    } else {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_REMEMBER_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function getStoredUser() {
  try {
    const st = sessionStorage.getItem(AUTH_USER_KEY);
    if (st) return JSON.parse(st);

    const remember = (localStorage.getItem(AUTH_REMEMBER_KEY) || "").trim();
    const lu = localStorage.getItem(AUTH_USER_KEY);
    if (!lu) return null;
    if (remember === "0") return null;

    if (remember === "1" || remember === "") {
      try {
        sessionStorage.setItem(AUTH_USER_KEY, lu);
      } catch {
        /* ignore */
      }
      return JSON.parse(lu);
    }
    return null;
  } catch {
    return null;
  }
}

/** @param {object|null} user @param {boolean} [remember=true] */
export function setStoredUser(user, remember = true) {
  try {
    if (user) {
      const raw = JSON.stringify(user);
      sessionStorage.setItem(AUTH_USER_KEY, raw);
      if (remember) {
        localStorage.setItem(AUTH_USER_KEY, raw);
        localStorage.setItem(AUTH_REMEMBER_KEY, "1");
      } else {
        localStorage.removeItem(AUTH_USER_KEY);
        localStorage.setItem(AUTH_REMEMBER_KEY, "0");
      }
    } else {
      sessionStorage.removeItem(AUTH_USER_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
      localStorage.removeItem(AUTH_REMEMBER_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function clearAuthSession() {
  try {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_USER_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(AUTH_REMEMBER_KEY);
  } catch {
    /* ignore */
  }
}

/** FastAPI origin without `/api` suffix (baked at build time from .env). */
export const BASE_URL = resolveBackendUrl();
/** @deprecated Use BASE_URL */
export const BACKEND_URL = BASE_URL;

/** Full REST prefix, e.g. http://192.168.1.13:8000/api — resolved per request on native. */
export function getApiBaseUrl() {
  const backend = normalizeBackendOrigin(resolveBackendUrl());
  if (backend) return joinBackendPath(backend, "api");
  if (isCapacitorNative()) {
    console.error("[api] getApiBaseUrl: missing REACT_APP_BACKEND_URL_MOBILE — requests will fail");
  }
  return "/api";
}

export const API = getApiBaseUrl();

/**
 * Full URL for FCM token registration on native (REACT_APP_BACKEND_URL_MOBILE only).
 * @returns {string|null}
 */
export function getFcmTokenPostUrl() {
  if (isCapacitorNative()) {
    const backend = normalizeBackendOrigin(resolveBackendUrl());
    if (!backend) return null;
    return joinBackendPath(backend, "api", "users", "me", "fcm-token");
  }
  const base = normalizeBackendOrigin(resolveBackendUrl());
  return base ? joinBackendPath(base, "api", "users", "me", "fcm-token") : null;
}

/** API base used for FCM POST on native — always from REACT_APP_BACKEND_URL_MOBILE. */
export function getFcmApiBaseUrl() {
  if (isCapacitorNative()) {
    const backend = normalizeBackendOrigin(resolveBackendUrl());
    return backend ? joinBackendPath(backend, "api") : null;
  }
  return getApiBaseUrl();
}

export const api = axios.create({
  baseURL: API,
  // JWT is in Authorization; cookies are unused. Credentials force CORS preflights
  // that Android WebView often mishandles — native uses CapacitorHttp instead.
  withCredentials: !isCapacitorNative(),
});

if (typeof window !== "undefined" && isCapacitorNative()) {
  const base = getApiBaseUrl();
  if (base) console.info("[api] Native API base:", base);
  else console.error("[api] Native API base missing — set REACT_APP_BACKEND_URL_MOBILE and rebuild");
}

/**
 * Resolves when a JWT is stored and passes browser-id binding (post-login / session restore).
 */
export function waitUntilAuthenticated({ maxWaitMs = 20000, intervalMs = 250 } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const token = getStoredAccessToken();
      if (token) {
        resolve(token);
        return;
      }
      if (Date.now() - started >= maxWaitMs) {
        reject(new Error("Authentication token not available"));
        return;
      }
      window.setTimeout(tick, intervalMs);
    };
    tick();
  });
}

api.interceptors.request.use((config) => {
  const url = config.url || "";
  const isAbsolute = /^https?:\/\//i.test(url);
  if (!isAbsolute) {
    config.baseURL = getApiBaseUrl();
  }

  const headers = config.headers ?? {};
  config.headers = headers;
  const set = (key, value) => {
    if (typeof headers.set === "function") headers.set(key, value);
    else headers[key] = value;
  };
  const bid = getOrCreateBrowserId();
  if (bid) set(BROWSER_ID_HEADER, bid);
  const token = getStoredAccessToken();
  if (token) set("Authorization", `Bearer ${token}`);
  if (!config.signal) config.signal = apiAbortController.signal;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (typeof window !== "undefined") {
      const reason = get401LogoutReason(err);
      if (reason) {
        const url = String(err?.config?.url || "");
        const skip = url.includes("/auth/login") || url.includes("/auth/logout");
        if (!skip) {
          performForcedLogout({ reason, showModal: true });
        }
      }
    }
    return Promise.reject(err);
  },
);

export function formatApiError(err) {
  if (err?.response?.status === 413) {
    return "File is too large for the server upload limit. Try a smaller video or contact your administrator.";
  }
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .join(" ");
  }
  if (detail && typeof detail.msg === "string") return detail.msg;
  const msg = err?.message || "";
  if (!err?.response && /network error/i.test(msg)) {
    const base = getApiBaseUrl();
    if (base) {
      return `Cannot reach the server (${base}). Check mobile data/Wi‑Fi and that the API is online.`;
    }
    return "Cannot reach the server. Rebuild the app with REACT_APP_BACKEND_URL_MOBILE set.";
  }
  return msg || "Something went wrong";
}

/**
 * Web clients send the JWT in the query string (localStorage token is not visible
 * to WebSocket). Pass explicitToken for mobile; otherwise the tab token is used.
 */
export function getWsUrl(explicitToken) {
  const backend = resolveBackendUrl();
  if (!backend) return null;
  const url = new URL(backend);
  const wsProto = url.protocol === "https:" ? "wss:" : "ws:";
  const base = `${wsProto}//${url.host}/api/ws`;
  const token =
    explicitToken != null && String(explicitToken).trim()
      ? String(explicitToken).trim()
      : typeof window !== "undefined"
        ? getStoredAccessToken()
        : null;
  if (token) {
    const bid = typeof window !== "undefined" ? getOrCreateBrowserId() : "";
    const q = new URLSearchParams();
    q.set("token", token);
    if (bid) q.set("bid", bid);
    return `${base}?${q.toString()}`;
  }
  return base;
}

/** True when URL points at S3 (or similar) and must be fetched via /api/media/stream. */
export function isCrossOriginStoredMediaUrl(url) {
  if (!url || typeof url !== "string") return false;
  const u = url.trim();
  if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
  if (u.includes(".amazonaws.com/")) return true;
  const backend = normalizeBackendOrigin(resolveBackendUrl());
  if (backend && u.startsWith(backend)) return false;
  return false;
}

/**
 * URL safe for fetch() / download (same-origin proxy for S3; passthrough for /api/files and blobs).
 * @param {string} pathOrUrl - message.file_url or absolute URL
 * @param {{ attachToken?: boolean }} [opts] - append JWT query for video/img (no Authorization header)
 */
export function mediaFetchUrl(pathOrUrl, opts = {}) {
  if (!pathOrUrl) return "";
  if (pathOrUrl.startsWith("blob:") || pathOrUrl.startsWith("data:")) return pathOrUrl;
  if (pathOrUrl.startsWith("/api/files/") || pathOrUrl.startsWith("/api/media/")) {
    return fileUrl(pathOrUrl);
  }
  if (isCrossOriginStoredMediaUrl(pathOrUrl)) {
    const apiBase = getApiBaseUrl();
    const q = new URLSearchParams({ url: pathOrUrl });
    if (opts.attachToken) {
      const token = getStoredAccessToken();
      if (token) q.set("token", token);
    }
    return `${apiBase}/media/stream?${q.toString()}`;
  }
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  return fileUrl(pathOrUrl);
}

export function fileUrl(path) {
  if (!path) return "";
  if (path.startsWith("blob:") || path.startsWith("data:")) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const backend = resolveBackendUrl();
  return backend ? `${backend}${path}` : path;
}
