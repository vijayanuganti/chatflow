const storageKey = (userId) => `cf_starred_${userId || "anon"}`;

export function getStarredIds(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const list = JSON.parse(raw || "[]");
    return new Set(Array.isArray(list) ? list.map(String) : []);
  } catch {
    return new Set();
  }
}

export function persistStarredIds(userId, idsSet) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify([...idsSet]));
  } catch {
    /* quota */
  }
}

export function toggleStarredMessage(userId, messageId) {
  const set = getStarredIds(userId);
  const id = String(messageId);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  persistStarredIds(userId, set);
  return set.has(id);
}

export function isMessageStarred(userId, messageId) {
  return getStarredIds(userId).has(String(messageId));
}
