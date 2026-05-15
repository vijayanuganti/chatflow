import React from "react";
import { Check, CheckCheck, Clock, AlertCircle, FileText, Download } from "lucide-react";
import { fileUrl } from "@/lib/api";
import VoiceNotePlayer, { parseVoiceNoteDurationLabel } from "@/components/VoiceNotePlayer";

function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** Resolve WhatsApp-style tick state from `status` or legacy `read_by`. */
function resolveMessageStatus(message, readByOthers, readByAll) {
  const raw = (message.status || "").toLowerCase();
  if (raw === "seen" || readByAll) return "seen";
  if (raw === "delivered" || readByOthers.length > 0) return "delivered";
  if (raw === "sent") return "sent";
  return "sent";
}

/**
 * Props:
 *  - message: message doc
 *  - mine: true if current viewer is the sender (right-align + green)
 *  - showSenderName: whether to show sender label (for groups + admin monitor)
 *  - totalRecipients: for read receipts (group: double-tick when read by everyone)
 */
export default function MessageBubble({
  message,
  mine,
  showSenderName,
  totalRecipients,
  showReceipts = true,
  onImageClick,
}) {
  const time = formatTime(message.created_at);
  const bubbleClass = mine ? "bubble-sent" : "bubble-received";
  const align = mine ? "items-end" : "items-start";

  const readByOthers = (message.read_by || []).filter((uid) => uid !== message.sender_id);
  const readByAll = totalRecipients > 0 && readByOthers.length >= totalRecipients;
  const tickStatus = resolveMessageStatus(message, readByOthers, readByAll);

  const wrapperClass = message.__error ? "opacity-90" : "";

  return (
    <div
      className={`flex flex-col ${align} animate-in-up ${wrapperClass}`}
      data-testid={`message-${message.id}`}
      data-status={message.__pending ? "pending" : message.__error ? "error" : tickStatus}
    >
      <div className={`${bubbleClass} max-w-[82%] md:max-w-[65%] px-3 py-2 shadow-sm`}>
        {showSenderName && !mine && (
          <div className="text-[11px] font-semibold text-emerald-800 mb-0.5" data-testid={`sender-name-${message.id}`}>
            {message.sender_name || "User"}
          </motion.div>
        )}
        {message.message_type === "image" && message.file_url && (
          <button
            type="button"
            className="block p-0 border-0 bg-transparent cursor-pointer rounded-xl overflow-hidden mb-1 max-w-full"
            onClick={() => onImageClick?.(fileUrl(message.file_url), message.file_name || "image")}
            data-testid={`message-image-${message.id}`}
          >
            <img
              src={fileUrl(message.file_url)}
              alt={message.file_name || "image"}
              className="rounded-xl max-h-80 w-full object-cover pointer-events-none"
            />
          </button>
        )}
        {message.message_type === "video" && message.file_url && (
          <video src={fileUrl(message.file_url)} controls className="rounded-xl max-h-80 mb-1 w-full" />
        )}
        {message.message_type === "audio" && message.file_url && (
          <div className="mb-1" data-testid={`audio-player-${message.id}`}>
            <VoiceNotePlayer
              src={fileUrl(message.file_url)}
              durationLabel={parseVoiceNoteDurationLabel(message.content)}
              mine={mine}
            />
          </div>
        )}
        {message.message_type === "file" && message.file_url && (
          <a
            href={fileUrl(message.file_url)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-white/60 rounded-lg mb-1 border border-gray-100 hover:bg-white"
          >
            <FileText className="h-5 w-5 text-emerald-800" strokeWidth={1.5} />
            <span className="text-sm truncate max-w-[200px]">{message.file_name || "file"}</span>
            <Download className="h-4 w-4 text-gray-500 ml-auto" strokeWidth={1.5} />
          </a>
        )}
        {message.content && message.message_type !== "audio" ? (
          <p className="whitespace-pre-wrap break-words text-sm text-gray-900 dark:text-gray-100 leading-relaxed">{message.content}</p>
        ) : null}
        <div className="flex items-center justify-end gap-1 mt-1">
          <span className="text-[10px] text-gray-500">{time}</span>
          {mine && showReceipts && (() => {
            if (message.__pending) {
              return <Clock className="h-3.5 w-3.5 text-gray-400" strokeWidth={2} aria-label="Sending" />;
            }
            if (message.__error) {
              return <AlertCircle className="h-3.5 w-3.5 text-rose-500" strokeWidth={2} aria-label="Failed to send" />;
            }
            if (tickStatus === "seen") {
              return <CheckCheck className="h-3.5 w-3.5 text-sky-500" strokeWidth={2} aria-label="Read" />;
            }
            if (tickStatus === "delivered") {
              return <CheckCheck className="h-3.5 w-3.5 text-gray-400" strokeWidth={2} aria-label="Delivered" />;
            }
            return <Check className="h-3.5 w-3.5 text-gray-400" strokeWidth={2} aria-label="Sent" />;
          })()}
        </div>
      </div>
    </div>
  );
}
