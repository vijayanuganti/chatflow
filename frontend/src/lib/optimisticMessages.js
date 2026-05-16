let tempIdCounter = 0;

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
      return { next, changed: true };
    }
  }

  return { next: [...prev, incoming], changed: true };
}

/**
 * Replace or append after a successful POST /messages response.
 */
export function mergeSentMessageResponse(prev, tempId, serverMessage) {
  if (!Array.isArray(prev) || !serverMessage?.id) return prev;

  if (prev.some((m) => String(m.id) === String(serverMessage.id) && String(m.__tempId || "") !== String(tempId))) {
    return prev.filter((m) => String(m.__tempId) !== String(tempId) && String(m.id) !== String(tempId));
  }

  const idx = prev.findIndex((m) => String(m.__tempId) === String(tempId) || String(m.id) === String(tempId));
  if (idx === -1) {
    return prev.some((m) => String(m.id) === String(serverMessage.id))
      ? prev
      : [...prev, finalizeOptimisticMessage({ __tempId: tempId }, serverMessage)];
  }

  const next = prev.slice();
  next[idx] = finalizeOptimisticMessage(next[idx], serverMessage);
  return next;
}
