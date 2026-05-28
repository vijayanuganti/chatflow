import { Capacitor } from "@capacitor/core";
import { fileUrl, getMediaAuthHeaders, mediaFetchUrl } from "@/lib/api";
import { safeMediaFileName } from "@/lib/mediaHandler";

const CACHE_DIR = "chatflow-media";
const webBlobCache = new Map();
const activeDownloads = new Map();

function cacheKey(url, fileName) {
  const resolved = (fileUrl(url) || url || "").trim();
  const name = safeMediaFileName(fileName, "file");
  let h = 0;
  const s = `${resolved}|${name}`;
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return `${CACHE_DIR}/${Math.abs(h).toString(36)}_${name}`;
}

/** Relative path under Directory.Cache for a cached media file. */
export function getChatMediaCacheRelativePath(url, fileName) {
  return cacheKey(url, fileName);
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
  const fetchUrl = mediaFetchUrl(url);
  const headers = getMediaAuthHeaders();
  if (!headers.Authorization) {
    throw new Error("Not authenticated");
  }
  const response = await fetch(fetchUrl, { signal, headers });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
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

async function readNativeCachedUri(relativePath) {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  try {
    await Filesystem.stat({ path: relativePath, directory: Directory.Cache });
  } catch {
    return null;
  }
  const { uri } = await Filesystem.getUri({ path: relativePath, directory: Directory.Cache });
  return uri;
}

async function writeBlobToNativeCache(relativePath, blob) {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const base64 = await blobToBase64(blob);
  const written = await Filesystem.writeFile({
    path: relativePath,
    data: base64,
    directory: Directory.Cache,
  });
  return written.uri;
}

/**
 * @param {string} url
 * @param {string} [fileName]
 */
export async function isChatMediaCached(url, fileName) {
  const key = cacheKey(url, fileName);
  if (!Capacitor.isNativePlatform()) {
    return webBlobCache.has(key);
  }
  const uri = await readNativeCachedUri(key);
  return !!uri;
}

/**
 * @returns {Promise<string|null>} local uri (native) or blob object URL (web)
 */
export async function getChatMediaLocalUri(url, fileName) {
  const key = cacheKey(url, fileName);
  if (!Capacitor.isNativePlatform()) {
    return webBlobCache.get(key) || null;
  }
  return readNativeCachedUri(key);
}

/**
 * @param {Object} opts
 * @param {string} opts.url
 * @param {string} [opts.fileName]
 * @param {(n: number) => void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 */
export async function downloadChatMedia({ url, fileName, onProgress, signal }) {
  const resolved = fileUrl(url) || url;
  if (!resolved) throw new Error("Missing media URL");
  const key = cacheKey(url, fileName);

  const cached = await isChatMediaCached(url, fileName);
  if (cached) {
    onProgress?.(100);
    return getChatMediaLocalUri(url, fileName);
  }

  const existing = activeDownloads.get(key);
  if (existing) {
    return existing.promise;
  }

  const controller = new AbortController();
  const combinedSignal = signal
    ? (() => {
        const onAbort = () => controller.abort();
        if (signal.aborted) controller.abort();
        else signal.addEventListener("abort", onAbort, { once: true });
        return controller.signal;
      })()
    : controller.signal;

  const promise = (async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const fetchUrl = mediaFetchUrl(url);
        const headers = getMediaAuthHeaders();
        if (!headers.Authorization) {
          throw new Error("Not authenticated");
        }
        await Filesystem.downloadFile({
          url: fetchUrl,
          path: key,
          directory: Directory.Cache,
          headers,
          recursive: true,
          progress: Boolean(onProgress),
        });
        onProgress?.(100);
        const uri = await readNativeCachedUri(key);
        if (!uri) throw new Error("Download failed");
        return uri;
      }

      const blob = await fetchBlobWithProgress(url, {
        signal: combinedSignal,
        onProgress,
      });
      const objectUrl = URL.createObjectURL(blob);
      const prev = webBlobCache.get(key);
      if (prev && prev.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(prev);
        } catch {
          /* ignore */
        }
      }
      webBlobCache.set(key, objectUrl);
      return objectUrl;
    } finally {
      activeDownloads.delete(key);
    }
  })();

  activeDownloads.set(key, { promise, abort: () => controller.abort() });
  return promise;
}

export function cancelChatMediaDownload(url, fileName) {
  const key = cacheKey(url, fileName);
  const active = activeDownloads.get(key);
  if (active) {
    active.abort();
    activeDownloads.delete(key);
  }
}
