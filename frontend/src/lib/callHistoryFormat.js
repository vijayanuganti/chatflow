import { format, isToday, isYesterday, parseISO } from "date-fns";

export function formatCallDuration(totalSeconds) {
  const sec = Math.max(0, Number(totalSeconds) || 0);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Connected overlay timer: "04 : 23" */
export function formatConnectedCallTimer(totalSeconds) {
  const sec = Math.max(0, Number(totalSeconds) || 0);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")} : ${String(s).padStart(2, "0")}`;
}

/** WhatsApp-style duration for in-chat call bubbles: "4m 23s", "12m 07s" */
export function formatCallBubbleDuration(seconds) {
  if (!seconds || seconds < 1) return null;
  const total = Math.floor(Number(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function formatDuration(seconds) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function formatCallDate(isoString) {
  if (!isoString) return "—";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `Today ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function formatCallHistoryDuration(seconds, status) {
  const sec = Number(seconds) || 0;
  if (status === "missed" || sec <= 0) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

export function formatCallHistoryDate(iso) {
  if (!iso) return "—";
  try {
    const d = parseISO(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const time = format(d, "h:mm a");
    if (isToday(d)) return `Today, ${time}`;
    if (isYesterday(d)) return "Yesterday";
    return format(d, "EEE, d MMM");
  } catch {
    return "—";
  }
}

const GRADIENTS = [
  ["#6366f1", "#8b5cf6"],
  ["#0ea5e9", "#6366f1"],
  ["#10b981", "#059669"],
  ["#f59e0b", "#ef4444"],
  ["#ec4899", "#8b5cf6"],
  ["#14b8a6", "#3b82f6"],
  ["#a855f7", "#6366f1"],
  ["#22c55e", "#0d9488"],
];

export function avatarGradientForKey(key) {
  const s = String(key || "?");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const [a, b] = GRADIENTS[h % GRADIENTS.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

export function callHistoryDirection(log, currentUserId) {
  const uid = String(currentUserId || "");
  if (log.status === "declined") return "declined";
  if (log.status === "missed" && String(log.callee_id) === uid) return "missed";
  if (String(log.caller_id) === uid) return "outgoing";
  if (String(log.callee_id) === uid) return "incoming";
  return "incoming";
}

export function callHistoryRemoteUser(log, currentUserId) {
  const uid = String(currentUserId || "");
  if (String(log.caller_id) === uid) {
    return { id: log.callee_id, name: log.callee_name || log.callee_id };
  }
  return { id: log.caller_id, name: log.caller_name || log.caller_id };
}

export function downloadCallLogsCsv(logs, filenamePrefix = "call-logs") {
  const headers = ["Date", "Caller", "Callee", "Duration", "Status"];
  const rows = logs.map((l) => [
    l.started_at ? new Date(l.started_at).toLocaleString("en-IN") : "",
    l.caller_name || l.caller_id || "",
    l.callee_name || l.callee_id || "",
    l.duration_seconds
      ? `${Math.floor(l.duration_seconds / 60)}m ${l.duration_seconds % 60}s`
      : "—",
    l.status || "",
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `${filenamePrefix}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
