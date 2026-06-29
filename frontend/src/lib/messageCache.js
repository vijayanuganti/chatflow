/**
 * Per-conversation message cache — in-memory (primary) + localStorage (best-effort).
 * Memory survives WebView localStorage slowness/resets during the session.
 */

import { mergeMessageStatus } from "./messageSeen";
import {
  isOptimisticMessageId,
  ensureMessageTimestamp,
  sortMessagesChronologically,
  collapseCallMessagesByCallId,
} from "./optimisticMessages";

const memory = new Map();
const MAX_CONVERSATIONS = 40;
const MAX_MESSAGES_PER_CONV = 500;

/** Session guards — survive React StrictMode remounts (duplicate effects). */
let storageHydratedForUser = null;
let lastCacheLogConvId = null;
let inflightConvLoadId = null;
let inflightConvLoadPromise = null;

function storageKey(userId) {
  return `cf_msg_cache_${userId || "anon"}`;
}

function sortMessages(list) {
  return sortMessagesChronologically(list);
}

function uniqueReadBy(a, b) {
  const set = new Set([...(a || []), ...(b || [])].map(String));
  return [...set];
}

function mergeMessageRecord(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  return {
    ...existing,
    ...incoming,
    status: mergeMessageStatus(existing.status, incoming.status),
    read_by: uniqueReadBy(existing.read_by, incoming.read_by),
  };
}

/**
 * Merge cached + server lists; server fields win except status only moves forward.
 */
export function mergeMessageLists(cached, fresh) {
  const byId = new Map();
  const pending = [];

  for (const m of cached || []) {
    if (m?.__pending && (m?.__tempId || isOptimisticMessageId(m?.id))) {
      pending.push(ensureMessageTimestamp(m));
      continue;
    }
    if (m?.id) byId.set(String(m.id), m);
  }

  for (const m of fresh || []) {
    if (!m?.id) continue;
    const key = String(m.id);
    byId.set(key, mergeMessageRecord(byId.get(key), m));
  }

  const merged = collapseCallMessagesByCallId(sortMessages([...byId.values(), ...pending]));
  return merged.slice(-MAX_MESSAGES_PER_CONV);
}

export function loadCacheFromStorage(userId) {
  hydrateMessageCacheFromStorage(userId);
}

/** Load localStorage into memory once per user per page session. */
export function hydrateMessageCacheFromStorage(userId) {
  if (!userId || typeof localStorage === "undefined") return;
  if (storageHydratedForUser === userId) return;
  storageHydratedForUser = userId;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    Object.entries(parsed).forEach(([convId, messages]) => {
      if (Array.isArray(messages) && messages.length) {
        memory.set(convId, messages);
      }
    });
    console.log("ChatFlowCache -> Hydrated memory from localStorage", Object.keys(parsed).length, "conversations");
  } catch (err) {
    console.warn("ChatFlowCache -> localStorage hydrate failed", err);
  }
}

/**
 * Coalesce parallel / duplicate network loads for the same conversation.
 * @template T
 * @param {string} convId
 * @param {() => Promise<T>} loader
 * @returns {Promise<T|undefined>}
 */
export function runConversationMessageLoad(convId, loader) {
  if (!convId) return Promise.resolve(undefined);
  if (inflightConvLoadId === convId && inflightConvLoadPromise) {
    return inflightConvLoadPromise;
  }
  inflightConvLoadId = convId;
  inflightConvLoadPromise = Promise.resolve()
    .then(loader)
    .finally(() => {
      if (inflightConvLoadId === convId) {
        inflightConvLoadId = null;
        inflightConvLoadPromise = null;
      }
    });
  return inflightConvLoadPromise;
}

function resetSessionLoadGuards() {
  storageHydratedForUser = null;
  lastCacheLogConvId = null;
  inflightConvLoadId = null;
  inflightConvLoadPromise = null;
}

/** Allow cache-load log again when leaving a thread (e.g. back to list). */
export function resetCacheLoadLog() {
  lastCacheLogConvId = null;
}

function persistToStorage(userId) {
  if (!userId || typeof localStorage === "undefined") return;
  try {
    const payload = {};
    let count = 0;
    for (const [convId, messages] of memory.entries()) {
      if (count >= MAX_CONVERSATIONS) break;
      if (messages?.length) {
        payload[convId] = messages.slice(-MAX_MESSAGES_PER_CONV);
        count += 1;
      }
    }
    localStorage.setItem(storageKey(userId), JSON.stringify(payload));
  } catch (err) {
    console.warn("ChatFlowCache -> localStorage persist failed", err);
  }
}

let persistTimer = null;

function schedulePersist(userId) {
  if (!userId) return;
  if (persistTimer) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    persistToStorage(userId);
  }, 400);
}

/**
 * @param {string} convId
 * @param {{ log?: boolean }} [opts]
 */
export function getCachedMessages(convId, opts = {}) {
  if (!convId) return null;
  const hit = memory.get(convId);
  if (opts.log && lastCacheLogConvId !== convId) {
    lastCacheLogConvId = convId;
    console.log(
      "ChatFlowCache -> Loading from cache:",
      convId,
      hit?.length ? `(${hit.length} messages, memory)` : "(miss)",
    );
  }
  return hit?.length ? hit : null;
}

export function setCachedMessages(userId, convId, messages) {
  if (!convId || !Array.isArray(messages)) return;
  memory.set(convId, messages.slice(-MAX_MESSAGES_PER_CONV));
  schedulePersist(userId);
}

export function patchCachedMessageStatus(userId, convId, messageId, status) {
  if (!convId || !messageId) return;
  const list = memory.get(convId);
  if (!list?.length) return;
  const next = list.map((m) => (
    String(m.id) === String(messageId)
      ? { ...m, status: mergeMessageStatus(m.status, status) }
      : m
  ));
  memory.set(convId, next);
  schedulePersist(userId);
}

export function patchCachedMessageStatuses(userId, convId, messageIds, status) {
  if (!convId || !messageIds?.length) return;
  const idSet = new Set(messageIds.map(String));
  const list = memory.get(convId);
  if (!list?.length) return;
  const next = list.map((m) => (
    idSet.has(String(m.id))
      ? { ...m, status: mergeMessageStatus(m.status, status) }
      : m
  ));
  memory.set(convId, next);
  schedulePersist(userId);
}

export function clearMessageCacheForUser(userId) {
  memory.clear();
  resetSessionLoadGuards();
  if (userId && typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(storageKey(userId));
    } catch {
      /* ignore */
    }
  }
}
