import i18n from "@/i18n";

/** WhatsApp-style date label for message dividers. */
export function formatChatDateDivider(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return i18n.t("date.today");
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return i18n.t("date.yesterday");
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Chronological messages with a date pill before each day (standard chat order). */
export function groupMessagesByDate(messages) {
  const groups = [];
  let lastKey = null;
  for (const m of messages || []) {
    const key = formatChatDateDivider(m.created_at);
    if (key && key !== lastKey) {
      groups.push({ type: "divider", key: `div-${key}-${m.id}`, label: key });
      lastKey = key;
    }
    groups.push({ type: "message", message: m });
  }
  return groups;
}
