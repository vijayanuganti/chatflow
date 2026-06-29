import { api } from "@/lib/api";

/** Resolve a user's avatar URL from conversation / participant data. */

export function avatarUrlForUser(userId, { conversation, usersById, fallbackUrl } = {}) {
  if (fallbackUrl) return fallbackUrl;
  const uid = String(userId || "");
  if (!uid) return null;

  if (conversation?.other_user && String(conversation.other_user.id) === uid) {
    return conversation.other_user.avatar_url || null;
  }

  const fromParticipants = (conversation?.participants_info || []).find(
    (p) => p?.id && String(p.id) === uid,
  );
  if (fromParticipants?.avatar_url) return fromParticipants.avatar_url;

  if (usersById?.[uid]?.avatar_url) return usersById[uid].avatar_url;

  return null;
}

export function buildAvatarMapFromConversations(conversations) {
  const map = {};
  (conversations || []).forEach((c) => {
    if (c.other_user?.id) map[c.other_user.id] = c.other_user.avatar_url || null;
    (c.participants_info || []).forEach((p) => {
      if (p?.id) map[p.id] = p.avatar_url || null;
    });
  });
  return map;
}

export function buildAvatarMapFromUsers(users) {
  const map = {};
  (users || []).forEach((u) => {
    if (u?.id) map[u.id] = u.avatar_url || null;
  });
  return map;
}

/** Remote party ids from call logs (for avatar hydration). */
export function remoteUserIdsFromCallLogs(logs, currentUserId) {
  const uid = String(currentUserId || "");
  const ids = new Set();
  (logs || []).forEach((log) => {
    if (String(log.caller_id) === uid) {
      if (log.callee_id) ids.add(String(log.callee_id));
    } else if (log.caller_id) {
      ids.add(String(log.caller_id));
    }
  });
  return [...ids];
}

/** Fetch `/users/{id}/public` for ids missing from the map. */
export async function fetchAvatarMapForUserIds(userIds, existingMap = {}) {
  const map = { ...existingMap };
  const toFetch = (userIds || []).filter((id) => id && !map[String(id)]);
  await Promise.all(
    toFetch.map(async (id) => {
      try {
        const res = await api.get(`/users/${id}/public`);
        map[id] = res.data?.avatar_url || null;
      } catch {
        map[id] = null;
      }
    }),
  );
  return map;
}
