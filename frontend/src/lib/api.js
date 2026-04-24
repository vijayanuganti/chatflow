import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("chatflow_token");
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
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

export function getWsUrl() {
  const token = localStorage.getItem("chatflow_token");
  if (!token) return null;
  const url = new URL(BACKEND_URL);
  const wsProto = url.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProto}//${url.host}/api/ws?token=${encodeURIComponent(token)}`;
}

export function fileUrl(path) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${BACKEND_URL}${path}`;
}
