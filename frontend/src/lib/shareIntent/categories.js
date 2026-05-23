/** @typedef {'photos' | 'videos' | 'documents' | 'links'} ShareFolderCategory */

/**
 * @param {string} [mimeType]
 * @returns {ShareFolderCategory}
 */
export function getFileCategory(mimeType) {
  const m = (mimeType || "").toLowerCase();
  if (m.startsWith("image/")) return "photos";
  if (m.startsWith("video/")) return "videos";
  if (m === "text/plain") return "links";
  return "documents";
}

/**
 * @param {string} [mimeType]
 */
export function isSupportedShareMime(mimeType) {
  const m = (mimeType || "").toLowerCase();
  if (!m) return true;
  if (m.startsWith("image/") || m.startsWith("video/") || m.startsWith("audio/")) return true;
  if (m === "text/plain") return true;
  if (m.startsWith("application/")) return true;
  if (m === "application/octet-stream") return true;
  return false;
}

/**
 * @param {{ mimeType?: string, text?: string }} item
 */
export function isTextShareItem(item) {
  return (item?.mimeType || "") === "text/plain" && !!(item?.text || "").trim();
}
