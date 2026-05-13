import axios from "axios";

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

/** JWT `bid` must match this install (invalidates tokens from another browser / profile). */
function tokenMatchesThisInstall(token) {
  const p = decodeJwtPayload(token);
  if (!p) return false;
  const bid = p.bid;
  if (bid == null || String(bid).trim() === "") return false;
  const install = getOrCreateBrowserId();
  if (!install) return false;
  return String(bid) === install;
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
      if (!tokenMatchesThisInstall(st)) {
        clearAuthSession();
        return null;
      }
      return st;
    }

    const remember = (localStorage.getItem(AUTH_REMEMBER_KEY) || "").trim();
    const lt = (localStorage.getItem(AUTH_TOKEN_KEY) || "").trim();
    if (!lt) return null;
    if (!tokenMatchesThisInstall(lt)) {
      clearAuthSession();
      return null;
    }
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

function resolveBackendUrl() {
  const fromEnv = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8001`;
  }
  return "";
}

export const BACKEND_URL = resolveBackendUrl();
export const API = BACKEND_URL ? `${BACKEND_URL}/api` : "/api";

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
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
  return config;
});

export function formatApiError(err) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .join(" ");
  }
  if (detail && typeof detail.msg === "string") return detail.msg;
  return err?.message || "Something went wrong";
}

/**
 * Web clients send the JWT in the query string (localStorage token is not visible
 * to WebSocket). Pass explicitToken for mobile; otherwise the tab token is used.
 */
export function getWsUrl(explicitToken) {
  if (!BACKEND_URL) return null;
  const url = new URL(BACKEND_URL);
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

export function fileUrl(path) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${BACKEND_URL}${path}`;
}
