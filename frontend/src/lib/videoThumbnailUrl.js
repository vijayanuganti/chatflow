import { Capacitor } from "@capacitor/core";
import { fileUrl, getOrCreateBrowserId, getStoredAccessToken } from "@/lib/api";
import { sanitizeProductionMediaUrl } from "@/lib/mediaPlaybackUrl";

/**
 * Extract storage file id from chat/folder media URLs (e.g. `abc123.mp4` or `folders/{id}/file.mp4`).
 * @param {string} fileUrl
 * @returns {string|null}
 */
export function extractMediaFileId(fileUrl) {
  if (!fileUrl || typeof fileUrl !== "string") return null;
  const u = fileUrl.trim();
  if (u.startsWith("blob:") || u.startsWith("data:")) return null;

  const filesMatch = u.match(/\/api\/files\/([^?#]+)/i);
  if (filesMatch?.[1]) {
    try {
      return decodeURIComponent(filesMatch[1]);
    } catch {
      return filesMatch[1];
    }
  }

  const uploadsIdx = u.indexOf("uploads/");
  if (uploadsIdx >= 0) {
    let rest = u.slice(uploadsIdx + "uploads/".length);
    rest = rest.split("?")[0].split("#")[0];
    return rest || null;
  }

  return null;
}

/**
 * Backend-generated video poster (JWT via query on native / video elements).
 * @param {string} fileUrl - message.file_url or S3 URL
 * @param {{ attachToken?: boolean }} [opts]
 * @returns {string} empty when not a server-stored video
 */
export function getVideoThumbnailUrl(fileUrl, opts = {}) {
  const fileId = extractMediaFileId(fileUrl);
  if (!fileId) return "";
  const attachToken = opts.attachToken ?? Capacitor.isNativePlatform();
  let path = `/api/media/thumbnail/${encodeURIComponent(fileId)}`;
  if (attachToken) {
    const q = new URLSearchParams();
    const token = getStoredAccessToken();
    if (token) q.set("token", token);
    const bid = getOrCreateBrowserId();
    if (bid) q.set("bid", bid);
    const qs = q.toString();
    if (qs) path = `${path}?${qs}`;
  }
  return sanitizeProductionMediaUrl(fileUrl(path) || path);
}

/**
 * Resolve poster for a video message: local upload preview, then server thumbnail.
 * @param {{ file_url?: string, __videoPoster?: string }} message
 */
export function resolveVideoPosterUrl(message) {
  if (!message) return "";
  if (message.__videoPoster) return message.__videoPoster;
  if (message.file_url) return getVideoThumbnailUrl(message.file_url, { attachToken: true });
  return "";
}
