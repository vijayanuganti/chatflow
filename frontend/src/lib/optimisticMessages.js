let tempIdCounter = 0;

/** True when the payload was sent by the logged-in user. */
export function isOwnMessage(message, userId) {
  if (!message || userId == null) return false;
  return String(message.sender_id) === String(userId);
}

/** Skip banners, toasts, and foreground tones for self-sent echoes. */
export function shouldNotifyForMessage(message, userId) {
  return !isOwnMessage(message, userId);
}

/** Whether the open thread matches this conversation id. */
export function isViewingConversation(conversationId, activeConversationId) {
  if (!conversationId || activeConversationId == null) return false;
  return String(activeConversationId) === String(conversationId);
}

/** ISO timestamp for new optimistic rows (matches backend `created_at`). */
export function createOptimisticTimestamp() {
  return new Date().toISOString();
}

/** Normalize `created_at` / legacy keys so sort never treats a row as epoch 0. */
export function ensureMessageTimestamp(message) {
  if (!message) return message;
  const raw = message.created_at ?? message.createdAt ?? message.timestamp;
  let created_at;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    created_at = new Date(raw).toISOString();
  } else if (typeof raw === "string" && raw.trim()) {
    const t = new Date(raw).getTime();
    created_at = Number.isFinite(t) ? new Date(t).toISOString() : createOptimisticTimestamp();
  } else {
    created_at = createOptimisticTimestamp();
  }
  const { createdAt, timestamp, ...rest } = message;
  return { ...rest, created_at };
}

/** Milliseconds for chronological ordering. */
export function getMessageTimeMs(message) {
  if (!message) return 0;
  const raw = message.created_at ?? message.createdAt ?? message.timestamp;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const t = new Date(raw || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Strict ascending sort by time; pending/temp rows tie-break to the bottom at equal ms.
 */
export function sortMessagesChronologically(list) {
  return [...(list || [])].sort((a, b) => {
    const ta = getMessageTimeMs(a);
    const tb = getMessageTimeMs(b);
    if (ta !== tb) return ta - tb;
    const aPending = a?.__pending || isOptimisticMessageId(a?.id) ? 1 : 0;
    const bPending = b?.__pending || isOptimisticMessageId(b?.id) ? 1 : 0;
    if (aPending !== bPending) return aPending - bPending;
    return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
  });
}

/** Force a new array reference and keep timeline order locked. */
export function appendToMessageList(prev, message) {
  return sortMessagesChronologically([
    ...(prev || []),
    ensureMessageTimestamp(message),
  ]);
}

/** Client-side optimistic message id (prefixed for dedup with WebSocket echoes). */
export function makeOptimisticMessageId() {
  const base = `temp-${Date.now()}`;
  tempIdCounter += 1;
  return tempIdCounter === 1 ? base : `${base}-${tempIdCounter}`;
}

export function isOptimisticMessageId(id) {
  if (id == null) return false;
  const s = String(id);
  return s.startsWith("temp-") || s.startsWith("tmp-");
}

function parseTime(iso) {
  const t = new Date(iso || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * True when `incoming` is likely the server echo of a local optimistic row.
 */
export function isOptimisticCounterpart(optimistic, incoming, currentUserId) {
  if (!optimistic || !incoming) return false;
  if (String(incoming.sender_id) !== String(currentUserId)) return false;
  if (optimistic.conversation_id !== incoming.conversation_id) return false;
  if (optimistic.message_type !== incoming.message_type) return false;

  const clientId = incoming.client_message_id || incoming.client_temp_id;
  if (clientId) {
    if (String(optimistic.id) === String(clientId)) return true;
    if (String(optimistic.__tempId) === String(clientId)) return true;
  }

  if (optimistic.__tempId && String(optimistic.__tempId) === String(incoming.id)) return true;

  const oContent = (optimistic.content || "").trim();
  const iContent = (incoming.content || "").trim();
  if (oContent && iContent && oContent === iContent) return true;

  if ((optimistic.file_url || "") && (optimistic.file_url || "") === (incoming.file_url || "")) {
    return true;
  }

  if (
    optimistic.file_name
    && incoming.file_name
    && optimistic.file_name === incoming.file_name
  ) {
    return Math.abs(parseTime(optimistic.created_at) - parseTime(incoming.created_at)) < 120_000;
  }

  const isPendingRow = Boolean(
    optimistic.__pending
    || isOptimisticMessageId(optimistic.id)
    || isOptimisticMessageId(optimistic.__tempId),
  );
  if (!isPendingRow) return false;

  const deltaMs = Math.abs(parseTime(optimistic.created_at) - parseTime(incoming.created_at));
  if (deltaMs > 120_000) return false;

  if (optimistic.message_type === "text") {
    return oContent === iContent;
  }

  if (optimistic.file_name && incoming.file_name) {
    return optimistic.file_name === incoming.file_name;
  }

  return deltaMs < 20_000;
}

/**
 * Replace an optimistic row with the authenticated server message while keeping a stable React key.
 */
export function finalizeOptimisticMessage(optimistic, serverMessage) {
  const stableKey = optimistic?.__tempId
    || (isOptimisticMessageId(optimistic?.id) ? optimistic.id : undefined);

  return {
    ...serverMessage,
    ...(stableKey ? { __tempId: stableKey } : {}),
    __pending: undefined,
    __error: undefined,
    __uploadProgress: undefined,
    __localPreview: undefined,
  };
}

/**
 * Find index of an optimistic row that matches an incoming server message from the current user.
 */
export function findOptimisticCounterpartIndex(messages, incoming, currentUserId) {
  if (!Array.isArray(messages) || !incoming || String(incoming.sender_id) !== String(currentUserId)) {
    return -1;
  }

  return messages.findIndex((m) => isOptimisticCounterpart(m, incoming, currentUserId));
}

/**
 * Merge a live WebSocket/API message into the thread without duplicate bubbles.
 * @returns {{ next: object[], changed: boolean }}
 */
export function mergeIncomingLiveMessage(prev, incoming, currentUserId) {
  if (!Array.isArray(prev) || !incoming?.id) {
    return { next: prev, changed: false };
  }

  if (prev.some((m) => String(m.id) === String(incoming.id))) {
    return { next: prev, changed: false };
  }

  if (String(incoming.sender_id) === String(currentUserId)) {
    const idx = findOptimisticCounterpartIndex(prev, incoming, currentUserId);
    if (idx !== -1) {
      const next = prev.slice();
      next[idx] = finalizeOptimisticMessage(prev[idx], incoming);
      return { next: sortMessagesChronologically(next), changed: true };
    }
    // Own echo with no optimistic row: merge quietly (POST may have already applied).
    if (prev.some((m) => String(m.id) === String(incoming.id))) {
      return { next: prev, changed: false };
    }
    return { next: appendToMessageList(prev, incoming), changed: true };
  }

  return { next: appendToMessageList(prev, incoming), changed: true };
}

/**
 * Replace or append after a successful POST /messages response.
 */
export function mergeSentMessageResponse(prev, tempId, serverMessage) {
  if (!Array.isArray(prev) || !serverMessage?.id) return prev;

  if (prev.some((m) => String(m.id) === String(serverMessage.id) && String(m.__tempId || "") !== String(tempId))) {
    return sortMessagesChronologically(
      prev.filter((m) => String(m.__tempId) !== String(tempId) && String(m.id) !== String(tempId)),
    );
  }

  const idx = prev.findIndex((m) => String(m.__tempId) === String(tempId) || String(m.id) === String(tempId));
  if (idx === -1) {
    if (prev.some((m) => String(m.id) === String(serverMessage.id))) {
      return sortMessagesChronologically(
        prev.filter((m) => String(m.__tempId) !== String(tempId) && String(m.id) !== String(tempId)),
      );
    }
    return appendToMessageList(prev, finalizeOptimisticMessage({ __tempId: tempId }, serverMessage));
  }

  const next = prev.slice();
  next[idx] = finalizeOptimisticMessage(next[idx], serverMessage);
  return sortMessagesChronologically(next);
}
