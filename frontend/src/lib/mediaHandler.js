import { Capacitor } from "@capacitor/core";
import { fileUrl } from "@/lib/api";
import {
  downloadChatMedia,
  getChatMediaCacheRelativePath,
  getChatMediaLocalUri,
  isChatMediaCached,
} from "@/lib/chatMediaCache";
import {
  classifyMediaForFolder,
  saveFromCacheToChatFlowFolder,
} from "@/utils/fileSystem";

const CACHE_DIR = "chatflow-media";

/** @typedef {'idle'|'preparing'|'downloading'|'opening'} MediaOpenPhase */

/**
 * @typedef {Object} MediaOpenProgressState
 * @property {boolean} open
 * @property {string} fileName
 * @property {number} percent
 * @property {MediaOpenPhase} phase
 * @property {() => void} [onCancel]
 */

/** @type {Set<(s: MediaOpenProgressState) => void>} */
const progressListeners = new Set();

let activeAbort = null;

function emitProgress(partial) {
  const base = {
    open: false,
    fileName: "",
    percent: 0,
    phase: "idle",
    onCancel: undefined,
  };
  const next = { ...base, ...partial };
  progressListeners.forEach((fn) => {
    try {
      fn(next);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeMediaOpenProgress(listener) {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

export function guessMimeType(fileName, mimeType, mediaKind) {
  if (mimeType) return mimeType;
  const n = (fileName || "").toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".doc")) return "application/msword";
  if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (n.endsWith(".xls")) return "application/vnd.ms-excel";
  if (n.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (n.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
  if (n.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (n.endsWith(".txt")) return "text/plain";
  if (n.endsWith(".mp4")) return "video/mp4";
  if (n.endsWith(".webm")) return "video/webm";
  if (n.endsWith(".mov")) return "video/quicktime";
  if (n.endsWith(".mkv")) return "video/x-matroska";
  if (mediaKind === "video") return "video/*";
  return "application/octet-stream";
}

export function safeMediaFileName(name, fallback = "file") {
  const base = (name || fallback).replace(/[/\\?%*:|"<>]/g, "_").trim() || fallback;
  return base.slice(0, 120);
}

function cacheRelativePath(fileName) {
  return `${CACHE_DIR}/${safeMediaFileName(fileName)}`;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") {
        reject(new Error("Could not read file"));
        return;
      }
      resolve(dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl);
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(blob);
  });
}

async function fetchBlobWithProgress(url, { onProgress, signal }) {
  const response = await fetch(url, { credentials: "include", signal });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  const total = Number(response.headers.get("content-length")) || 0;
  if (!response.body || !total) {
    const blob = await response.blob();
    onProgress?.(100);
    return blob;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    chunks.push(value);
    received += value.length;
    onProgress?.(Math.min(99, Math.round((received / total) * 100)));
  }
  onProgress?.(100);
  return new Blob(chunks, { type: response.headers.get("content-type") || undefined });
}

async function readCachedUri(relativePath) {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  try {
    await Filesystem.stat({ path: relativePath, directory: Directory.Cache });
  } catch {
    return null;
  }
  const { uri } = await Filesystem.getUri({
    path: relativePath,
    directory: Directory.Cache,
  });
  return uri;
}

async function writeBlobToCache(relativePath, blob) {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const base64 = await blobToBase64(blob);
  const written = await Filesystem.writeFile({
    path: relativePath,
    data: base64,
    directory: Directory.Cache,
  });
  return written.uri;
}

async function openNativeUri(uri, contentType) {
  const { FileOpener } = await import("@capacitor-community/file-opener");
  await FileOpener.open({
    filePath: uri,
    contentType,
    openWithDefault: false,
  });
}

function triggerBrowserFileDownload(href, fileName) {
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Ensure file name has a sensible extension (folder items may omit it in title).
 */
export function resolveMediaFileName(fileName, mimeType, mediaKind = "document") {
  const fallback =
    mediaKind === "video" ? "video.mp4" : mediaKind === "photo" ? "photo.jpg" : "file";
  const base = safeMediaFileName(fileName, fallback);
  if (/\.[a-z0-9]{2,8}$/i.test(base)) return base;
  const mime = (mimeType || "").toLowerCase();
  const extByMime = {
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/x-matroska": ".mkv",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  };
  const ext = extByMime[mime];
  return ext ? `${base}${ext}` : base;
}

function mapNativeOpenError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  if (msg.includes("abort")) return null;
  if (msg.includes("no app") || msg.includes("no activity") || msg.includes("no application")) {
    return "No app found to open this file. Please install a compatible viewer.";
  }
  if (msg.includes("network") || msg.includes("failed to fetch") || msg.includes("download failed")) {
    return "Download failed. Please check your connection.";
  }
  if (msg.includes("not authenticated")) {
    return "Please sign in again and retry.";
  }
  if (msg.includes("403") || msg.includes("access denied")) {
    return "You do not have access to this file.";
  }
  if (msg.includes("404") || msg.includes("file not found")) {
    return "File not found.";
  }
  return "Could not open file. Please try again.";
}

function openOnWeb(url, fileName) {
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }
}

function cancelActiveDownload() {
  if (activeAbort) {
    activeAbort.abort();
    activeAbort = null;
  }
  emitProgress({ open: false, phase: "idle" });
}

/**
 * Open video or document in the device native player/viewer (Capacitor) or system browser (web).
 * @param {Object} params
 * @param {string} params.url - Path or absolute URL
 * @param {string} [params.fileName]
 * @param {string} [params.mimeType]
 * @param {'video'|'document'} [params.mediaKind]
 * @param {(msg: string) => void} [params.onError]
 */
export async function openMediaInNativeApp({
  url,
  fileName,
  mimeType,
  mediaKind = "document",
  onError,
}) {
  const resolvedUrl = fileUrl(url) || url;
  if (!resolvedUrl) {
    onError?.("Could not open file. Please try again.");
    return;
  }

  const name = resolveMediaFileName(
    fileName,
    mimeType,
    mediaKind === "video" ? "video" : "document",
  );
  const contentType = guessMimeType(name, mimeType, mediaKind);

  if (!Capacitor.isNativePlatform()) {
    const webCached = await getChatMediaLocalUri(url, name);
    if (webCached) {
      openOnWeb(webCached, name);
      return;
    }
    openOnWeb(resolvedUrl, name);
    return;
  }

  const relativePath = cacheRelativePath(name);
  let showedProgress = false;

  const reportError = (err) => {
    const message = mapNativeOpenError(err);
    if (message) onError?.(message);
  };

  try {
    const cachedUri = await getChatMediaLocalUri(url, name);
    if (cachedUri) {
      emitProgress({ open: true, fileName: name, percent: 100, phase: "opening" });
      await openNativeUri(cachedUri, contentType);
      emitProgress({ open: false, phase: "idle" });
      return;
    }

    activeAbort = new AbortController();
    const signal = activeAbort.signal;

    emitProgress({
      open: true,
      fileName: name,
      percent: 0,
      phase: "preparing",
      onCancel: cancelActiveDownload,
    });
    showedProgress = true;

    const uri = await downloadChatMedia({
      url,
      fileName: name,
      signal,
      onProgress: (pct) => {
        emitProgress({
          open: true,
          fileName: name,
          percent: pct,
          phase: "downloading",
          onCancel: cancelActiveDownload,
        });
      },
    });

    emitProgress({
      open: true,
      fileName: name,
      percent: 100,
      phase: "opening",
      onCancel: undefined,
    });

    await openNativeUri(uri, contentType);
  } catch (err) {
    reportError(err);
  } finally {
    activeAbort = null;
    if (showedProgress) emitProgress({ open: false, phase: "idle" });
  }
}

/** Open a Blob (e.g. report PDF) in the native viewer. */
export async function openBlobInNativeApp({ blob, fileName, mimeType, onError }) {
  const name = safeMediaFileName(fileName, "file");
  const contentType = guessMimeType(name, mimeType, "document");

  if (!Capacitor.isNativePlatform()) {
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
    return;
  }

  try {
    emitProgress({ open: true, fileName: name, percent: 100, phase: "opening" });
    const uri = await writeBlobToCache(cacheRelativePath(name), blob);
    await openNativeUri(uri, contentType);
  } catch (err) {
    const message = mapNativeOpenError(err);
    if (message) onError?.(message);
  } finally {
    emitProgress({ open: false, phase: "idle" });
  }
}

export async function openVideoInNativeApp(url, fileName, mimeType, onError) {
  return openMediaInNativeApp({
    url,
    fileName,
    mimeType,
    mediaKind: "video",
    onError,
  });
}

export async function openDocumentInNativeApp(url, fileName, mimeType, onError) {
  return openMediaInNativeApp({
    url,
    fileName,
    mimeType,
    mediaKind: "document",
    onError,
  });
}

/**
 * Save media to device storage (Downloads/Documents on native, file save on web).
 * Does not open a viewer — use open*InNativeApp for that.
 */
export async function downloadMediaToDevice({
  url,
  fileName,
  mimeType,
  mediaKind = "document",
  messageType,
  onProgress,
  onError,
  onSuccess,
}) {
  const name = resolveMediaFileName(fileName, mimeType, mediaKind);
  try {
    await downloadChatMedia({ url, fileName: name, onProgress });
    if (Capacitor.isNativePlatform()) {
      const relativePath = getChatMediaCacheRelativePath(url, name);
      const category = classifyMediaForFolder(
        name,
        mimeType,
        messageType || (mediaKind === "video" ? "video" : mediaKind === "photo" ? "image" : ""),
      );
      const { label } = await saveFromCacheToChatFlowFolder(relativePath, name, category);
      onSuccess?.(`Saved to ${label}`);
      return;
    }
    const local = await getChatMediaLocalUri(url, name);
    if (!local) throw new Error("Download failed");
    triggerBrowserFileDownload(local, name);
    onSuccess?.("Download started");
  } catch (err) {
    const msg = mapNativeOpenError(err) || "Could not download file. Please try again.";
    onError?.(msg);
  }
}
