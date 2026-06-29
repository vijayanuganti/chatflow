import React from "react";
import i18n from "@/i18n";
import { formatCallBubbleDuration } from "@/lib/callHistoryFormat";

/** Sidebar / list preview for call messages (viewer perspective). */
export function getCallMessagePreview(conv, currentUserId) {
  const subtype = conv?.last_message_call_subtype;
  if (!subtype) return conv?.last_message || "📞 Voice call";
  const isOutgoing = String(conv?.last_message_sender_id) === String(currentUserId);
  const duration = conv?.last_message_duration_seconds;

  if (subtype === "call_answered") {
    const dur = formatCallBubbleDuration(duration);
    return dur ? `📞 ${dur}` : "📞 Voice call";
  }
  if (subtype === "call_missed") {
    return isOutgoing ? "📵 No answer" : "📵 Missed call";
  }
  if (subtype === "call_declined") {
    return isOutgoing ? "📵 Declined" : "📵 Declined call";
  }
  return conv?.last_message || "📞 Voice call";
}

export function isUnreadMissedCall(conv, currentUserId) {
  if (!conv || Number(conv.unread_count || 0) <= 0) return false;
  if (conv.last_message_type !== "call") return false;
  const subtype = conv.last_message_call_subtype;
  if (subtype !== "call_missed" && subtype !== "call_declined") return false;
  return String(conv.last_message_sender_id) !== String(currentUserId);
}

export function getLastMsgPreview(msgOrConv, currentUserId) {
  const msg = msgOrConv;
  const type = msg.message_type || msg.last_message_type;
  if (type === "call") {
    if (currentUserId != null && (msg.last_message_call_subtype || msg.call_subtype)) {
      return getCallMessagePreview(msg, currentUserId);
    }
    return msg.content || msg.last_message || "📞 Voice call";
  }
  if (type === "image") return i18n.t("preview.photo");
  if (type === "video") return i18n.t("preview.video");
  if (type === "file" || type === "document") {
    return msg.file_name ? `📄 ${msg.file_name}` : i18n.t("preview.document");
  }
  if (type === "audio") return i18n.t("preview.voice");
  const text = (msg.content || msg.last_message || "").trim();
  return text;
}

/** sent | delivered | seen — for messages sent by the current user. */
export function resolveLastMessageTickStatus(conv, currentUserId) {
  if (!conv || !currentUserId) return null;
  const senderId = conv.last_message_sender_id;
  if (!senderId || String(senderId) !== String(currentUserId)) return null;

  const readBy = Array.isArray(conv.last_message_read_by) ? conv.last_message_read_by : [];
  const othersRead = readBy.filter((id) => String(id) !== String(currentUserId));
  if (othersRead.length === 0) return "sent";

  let required = 1;
  if (conv.type === "group") {
    const parts = conv.participants || (conv.participants_info || []).map((p) => p?.id).filter(Boolean);
    required = Math.max(1, parts.filter((id) => String(id) !== String(currentUserId)).length);
  }

  if (othersRead.length >= required) return "seen";
  return "delivered";
}

export function lastMessageFieldsFromMsg(msg, conv, userId) {
  const rawPreview = getLastMsgPreview(msg, userId);
  const previewText =
    conv?.type === "group" && msg.sender_name
      ? `${msg.sender_name}: ${rawPreview}`
      : rawPreview;
  return {
    last_message: previewText,
    last_message_at: msg.created_at,
    last_message_sender_id: msg.sender_id,
    last_message_type: msg.message_type || "text",
    last_message_call_subtype: msg.call_subtype || null,
    last_message_duration_seconds: msg.duration_seconds ?? null,
    last_message_read_by: msg.read_by || (msg.sender_id ? [msg.sender_id] : []),
  };
}

export function SingleTick({ className }) {
  return (
    <svg viewBox="0 0 16 11" className={className} fill="none" aria-hidden>
      <path
        d="M1.5 5.5L5.5 9.5L14.5 1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DoubleTick({ className }) {
  return (
    <svg viewBox="0 0 18 11" className={className} fill="none" aria-hidden>
      <path
        d="M1 5.5L5 9.5L13 1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 9.5L13 1.5M9 9.5L17 1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LastMessageTicks({ conv, currentUserId }) {
  const status = resolveLastMessageTickStatus(conv, currentUserId);
  if (!status) return null;
  if (status === "sent") {
    return <SingleTick className="h-3.5 w-3.5 text-gray-400 shrink-0" />;
  }
  if (status === "seen") {
    return <DoubleTick className="h-3.5 w-3.5 text-sky-500 shrink-0" />;
  }
  return <DoubleTick className="h-3.5 w-3.5 text-gray-400 shrink-0" />;
}
