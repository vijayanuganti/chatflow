import { Capacitor } from "@capacitor/core";

/** @typedef {'images'|'videos'|'documents'|'audio'} ChatFlowMediaCategory */

export const CHATFLOW_ROOT = "ChatFlow";
export const CHATFLOW_FOLDERS = {
  images: "ChatFlow Images",
  videos: "ChatFlow Videos",
  documents: "ChatFlow Documents",
  audio: "ChatFlow Audio",
};

/**
 * Base directory + relative path prefix for ChatFlow media on device.
 * Android: public Documents/ChatFlow (visible in file managers for app-created files).
 * iOS: app Documents/ChatFlow.
 */
export function getChatFlowStorageLayout() {
  const platform = Capacitor.getPlatform();
  if (platform === "android") {
    return {
      directory: "DOCUMENTS",
      basePath: `${CHATFLOW_ROOT}`,
      label: "Documents/ChatFlow",
    };
  }
  if (platform === "ios") {
    return {
      directory: "DOCUMENTS",
      basePath: CHATFLOW_ROOT,
      label: "Files/ChatFlow",
    };
  }
  return null;
}

/**
 * Request storage permissions needed before writing public folders (Android).
 * @returns {Promise<boolean>}
 */
export async function requestChatFlowStoragePermissions() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return true;
  }
  try {
    const { Filesystem } = await import("@capacitor/filesystem");
    const status = await Filesystem.checkPermissions();
    if (status.publicStorage === "granted") return true;
    const req = await Filesystem.requestPermissions();
    return req.publicStorage === "granted" || req.publicStorage === "limited";
  } catch {
    return true;
  }
}

/**
 * Create ChatFlow/ChatFlow Images|Videos|Documents|Audio if missing.
 */
export async function ensureChatFlowFoldersExist() {
  if (!Capacitor.isNativePlatform()) return;

  const layout = getChatFlowStorageLayout();
  if (!layout) return;

  await requestChatFlowStoragePermissions();

  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const directory = Directory[layout.directory] ?? Directory.Documents;

  const paths = [
    layout.basePath,
    ...Object.values(CHATFLOW_FOLDERS).map((name) => `${layout.basePath}/${name}`),
  ];

  for (const path of paths) {
    try {
      await Filesystem.mkdir({ path, directory, recursive: true });
    } catch {
      /* already exists or mkdir unsupported */
    }
  }
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v|3gp|mkv|avi)$/i;
const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|aac|flac|opus|amr)$/i;

/**
 * @param {string} fileName
 * @param {string} [mimeType]
 * @param {string} [messageType]
 * @returns {ChatFlowMediaCategory}
 */
export function classifyMediaForFolder(fileName, mimeType = "", messageType = "") {
  const mime = (mimeType || "").toLowerCase();
  const mt = (messageType || "").toLowerCase();
  const name = (fileName || "").toLowerCase();

  if (mime.startsWith("image/") || mt === "image" || IMAGE_EXT.test(name)) return "images";
  if (mime.startsWith("video/") || mt === "video" || VIDEO_EXT.test(name)) return "videos";
  if (mime.startsWith("audio/") || mt === "audio" || AUDIO_EXT.test(name)) return "audio";
  return "documents";
}

/**
 * Relative path under Documents for a saved attachment.
 * @param {string} fileName
 * @param {ChatFlowMediaCategory} category
 */
export function getChatFlowSaveRelativePath(fileName, category) {
  const layout = getChatFlowStorageLayout();
  if (!layout) return `ChatFlow/${fileName}`;
  const folder = CHATFLOW_FOLDERS[category] || CHATFLOW_FOLDERS.documents;
  return `${layout.basePath}/${folder}/${fileName}`;
}

/**
 * Human-readable save location for toasts.
 */
export function getChatFlowSaveLocationLabel(category) {
  const layout = getChatFlowStorageLayout();
  if (!layout) return "Downloads";
  const folder = CHATFLOW_FOLDERS[category] || CHATFLOW_FOLDERS.documents;
  return `${layout.label}/${folder}`;
}

/**
 * Copy from cache relative path into the typed ChatFlow subfolder.
 * @param {string} cacheRelativePath
 * @param {string} fileName
 * @param {ChatFlowMediaCategory} category
 */
export async function saveFromCacheToChatFlowFolder(cacheRelativePath, fileName, category) {
  const layout = getChatFlowStorageLayout();
  if (!layout) throw new Error("Not on native device");

  await ensureChatFlowFoldersExist();

  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const directory = Directory[layout.directory] ?? Directory.Documents;
  const destPath = getChatFlowSaveRelativePath(fileName, category);

  await Filesystem.copy({
    from: cacheRelativePath,
    to: destPath,
    directory: Directory.Cache,
    toDirectory: directory,
  });

  return { destPath, label: getChatFlowSaveLocationLabel(category) };
}
