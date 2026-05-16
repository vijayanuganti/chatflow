import { api } from "./api";

export const MESSAGE_STATUS_ORDER = { sent: 0, delivered: 1, seen: 2 };

export function mergeMessageStatus(current, next) {
  const a = (current || "sent").toLowerCase();
  const b = (next || "sent").toLowerCase();
  return (MESSAGE_STATUS_ORDER[b] ?? 0) >= (MESSAGE_STATUS_ORDER[a] ?? 0) ? b : a;
}

function collectUnseenOpponentIds(messages, userId, inflight) {
  const pending = inflight || new Set();
  const ids = [];
  for (const m of messages || []) {
    if (!m?.id) continue;
    if (String(m.sender_id) === String(userId)) continue;
    const status = (m.status || "").toLowerCase();
    if (status === "seen") continue;
    const id = String(m.id);
    if (pending.has(id)) continue;
    ids.push(id);
  }
  return ids;
}

let batchQueue = new Set();
let batchTimer = null;
let batchInflight = false;

function flushSeenBatch(inflight) {
  const ids = [...batchQueue];
  batchQueue = new Set();
  batchTimer = null;
  if (!ids.length || batchInflight) return;

  batchInflight = true;
  ids.forEach((id) => inflight?.add(id));

  console.log("ChatFlowSeen -> batch update-status", ids.length, "messages");

  api
    .post("/notifications/update-status-batch", { message_ids: ids, status: "seen" })
    .catch((err) => {
      console.warn("ChatFlowSeen -> batch failed", err);
    })
    .finally(() => {
      batchInflight = false;
      ids.forEach((id) => inflight?.delete(id));
      if (batchQueue.size) scheduleSeenBatch(inflight);
    });
}

function scheduleSeenBatch(inflight) {
  if (batchTimer) window.clearTimeout(batchTimer);
  batchTimer = window.setTimeout(() => flushSeenBatch(inflight), 48);
}

/**
 * Queue message IDs for a single batched seen POST (debounced).
 * @param {string[]} messageIds
 * @param {Set<string>} [inflight]
 */
export function markMessagesSeenBatch(messageIds, inflight) {
  if (!messageIds?.length) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

  const pending = inflight || new Set();
  for (const raw of messageIds) {
    const id = String(raw);
    if (!id || pending.has(id)) continue;
    batchQueue.add(id);
  }
  if (batchQueue.size) scheduleSeenBatch(pending);
}

/**
 * Mark all unseen opponent messages in the open thread (one batch request).
 */
export function markOpponentMessagesSeen({ userId, conversationId, messages, inflight }) {
  if (!userId || !conversationId || !Array.isArray(messages)) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

  const ids = collectUnseenOpponentIds(messages, userId, inflight);
  if (!ids.length) return;

  console.log("ChatFlowSeen -> marking opponent messages seen", conversationId, ids.length);
  markMessagesSeenBatch(ids, inflight);
}

/** Single live message while chat is open — coalesces into the same batch. */
export function markMessageSeen(messageId, inflight) {
  if (!messageId) return;
  markMessagesSeenBatch([String(messageId)], inflight);
}
