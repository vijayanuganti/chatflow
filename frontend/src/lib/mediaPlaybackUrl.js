import { Capacitor } from "@capacitor/core";
import { fileUrl, mediaFetchUrl } from "@/lib/api";

const OCI_HOST_SUFFIX = "sslip.io";

/**
 * Production OCI serves HTTPS on 443 via Nginx — never expose :8000 in playback URLs.
 */
export function sanitizeProductionMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";

  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "https://140-245-209-196.sslip.io";
    const u = new URL(trimmed, base);
    if (u.hostname.includes(OCI_HOST_SUFFIX) && u.port === "8000") {
      u.port = "";
    }
    if (u.protocol === "http:" && u.hostname.includes(OCI_HOST_SUFFIX)) {
      u.protocol = "https:";
    }
    return u.href;
  } catch {
    return trimmed.replace(/:8000(?=\/|$)/g, "");
  }
}

/**
 * Authenticated URL for in-app video/PDF/image streaming (Capacitor + web).
 */
export function getMediaPlaybackUrl(pathOrUrl, opts = {}) {
  if (!pathOrUrl) return "";
  const attachToken = opts.attachToken ?? Capacitor.isNativePlatform();
  const resolved = mediaFetchUrl(pathOrUrl, { attachToken });
  return sanitizeProductionMediaUrl(fileUrl(resolved) || resolved);
}

export function isPdfAttachment(fileName, mimeType) {
  const mime = (mimeType || "").toLowerCase();
  const name = (fileName || "").toLowerCase();
  return mime.includes("pdf") || name.endsWith(".pdf");
}
