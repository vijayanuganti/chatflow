import axios from "axios";

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
 * Web clients authenticate via HttpOnly cookie.
 * Mobile (Expo) can pass an explicit token as query param if needed.
 */
export function getWsUrl(explicitToken) {
  if (!BACKEND_URL) return null;
  const url = new URL(BACKEND_URL);
  const wsProto = url.protocol === "https:" ? "wss:" : "ws:";
  const base = `${wsProto}//${url.host}/api/ws`;
  if (explicitToken) return `${base}?token=${encodeURIComponent(explicitToken)}`;
  return base;
}

export function fileUrl(path) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${BACKEND_URL}${path}`;
}