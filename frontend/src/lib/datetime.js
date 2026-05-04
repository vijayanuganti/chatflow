/** WhatsApp-style: "last seen 9:56 pm", "last seen yesterday at 9:56 pm", etc. */
export function formatWhatsAppLastSeen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const timeStr = d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s/g, "")
    .toLowerCase();

  if (d.toDateString() === now.toDateString()) {
    return `last seen ${timeStr}`;
  }
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) {
    return `last seen yesterday at ${timeStr}`;
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  const datePart = sameYear
    ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `last seen ${datePart} at ${timeStr}`;
}
