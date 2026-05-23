import { Capacitor, registerPlugin } from "@capacitor/core";
import { SHARE_MAX_BYTES } from "./constants";
import { isSupportedShareMime } from "./categories";

const ChatFlowShare = registerPlugin("ChatFlowShare");

export function isShareIntentSupported() {
  return Capacitor.isNativePlatform();
}

/**
 * @typedef {Object} NativeShareItem
 * @property {string} id
 * @property {string} [path]
 * @property {string} [name]
 * @property {string} [mimeType]
 * @property {number} [size]
 * @property {string} [text]
 */

/**
 * @returns {Promise<NativeShareItem[]>}
 */
export async function fetchPendingNativeShares() {
  if (!isShareIntentSupported()) return [];
  try {
    const res = await ChatFlowShare.getPendingShares();
    const items = res?.items;
    if (!Array.isArray(items)) return [];
    return items.map((raw) => ({
      id: String(raw.id || ""),
      path: raw.path ? String(raw.path) : undefined,
      name: raw.name ? String(raw.name) : undefined,
      mimeType: raw.mimeType ? String(raw.mimeType) : undefined,
      size: raw.size != null ? Number(raw.size) : undefined,
      text: raw.text ? String(raw.text) : undefined,
    }));
  } catch (err) {
    console.warn("[shareIntent] getPendingShares failed:", err);
    return [];
  }
}

export async function clearPendingNativeShares() {
  if (!isShareIntentSupported()) return;
  try {
    await ChatFlowShare.clearPendingShares();
  } catch {
    /* ignore */
  }
}

/**
 * @param {NativeShareItem} item
 * @returns {Promise<File | null>}
 */
export async function nativeShareItemToFile(item) {
  if (!item?.path) return null;
  const url = Capacitor.convertFileSrc(item.path);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not read shared file");
  const blob = await res.blob();
  const name = item.name || "shared-file";
  const type = item.mimeType || blob.type || "application/octet-stream";
  return new File([blob], name, { type });
}

/**
 * @param {NativeShareItem[]} items
 * @returns {{ ok: true, files: File[], texts: string[] } | { ok: false, error: string }}
 */
export async function prepareSharePayload(items) {
  const files = [];
  const texts = [];

  for (const item of items) {
    const mime = item.mimeType || "";
    if (!isSupportedShareMime(mime)) {
      return { ok: false, error: "This file type is not supported." };
    }
    if (item.text && mime === "text/plain") {
      texts.push(item.text.trim());
      continue;
    }
    if (item.size != null && item.size > SHARE_MAX_BYTES) {
      return { ok: false, error: "File too large. Max size is 50MB." };
    }
    if (!item.path) continue;
    const file = await nativeShareItemToFile(item);
    if (!file) continue;
    if (file.size > SHARE_MAX_BYTES) {
      return { ok: false, error: "File too large. Max size is 50MB." };
    }
    files.push(file);
  }

  if (!files.length && !texts.length) {
    return { ok: false, error: "No shareable content received." };
  }

  return { ok: true, files, texts };
}

/**
 * @param {(items: NativeShareItem[]) => void} handler
 * @returns {Promise<() => void>}
 */
export async function addShareReceivedListener(handler) {
  if (!isShareIntentSupported()) return () => {};
  const handle = await ChatFlowShare.addListener("shareReceived", async () => {
    const items = await fetchPendingNativeShares();
    if (items.length) handler(items);
  });
  return () => {
    try {
      handle.remove();
    } catch {
      /* ignore */
    }
  };
}
