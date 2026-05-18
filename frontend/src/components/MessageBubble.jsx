import React, { useRef, memo } from "react";
import { Check, CheckCheck, Clock, AlertCircle, Star } from "lucide-react";
import { fileUrl } from "@/lib/api";
import { NO_SELECT_STYLE } from "@/lib/noSelectStyles";
import VoiceNotePlayer, { parseVoiceNoteDurationLabel } from "@/components/VoiceNotePlayer";
import UploadProgressRing from "@/components/chat/UploadProgressRing";
import DocumentMessageBlock from "@/components/chat/DocumentMessageBlock";

function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function resolveMessageStatus(message, readByOthers, readByAll) {
  const raw = (message.status || "").toLowerCase();
  if (raw === "seen") return "seen";
  if (raw === "delivered") return "delivered";
  if (raw === "sent") return "sent";
  if (readByAll) return "seen";
  if (readByOthers.length > 0) return "delivered";
  return "sent";
}

function highlightText(text, query) {
  if (!text || !query?.trim()) return text;
  const q = query.trim();
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-200/90 dark:bg-amber-500/40 text-inherit rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function MessageBubble({
  message,
  mine,
  showSenderName,
  totalRecipients,
  showReceipts = true,
  onImageClick,
  selected = false,
  starred = false,
  searchQuery = "",
  onLongPress,
  dimmed = false,
  onRetry,
  bubbleRef,
}) {
  const longPressRef = useRef(null);
  const time = formatTime(message.created_at);
  const bubbleClass = mine ? "bubble-sent" : "bubble-received";
  const align = mine ? "items-end" : "items-start";

  const readByOthers = (message.read_by || []).filter((uid) => uid !== message.sender_id);
  const readByAll = totalRecipients > 0 && readByOthers.length >= totalRecipients;
  const tickStatus = resolveMessageStatus(message, readByOthers, readByAll);

  const mediaSrc = fileUrl(message.file_url);
  const uploading = message.__uploadProgress != null && message.__uploadProgress < 100 && !message.__error;
  const uploadPct = message.__uploadProgress ?? (message.__pending ? 0 : 100);

  const wrapperClass = message.__error ? "opacity-90" : "";

  const handlePointerDown = () => {
    if (!onLongPress || !message.id) return;
    clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => onLongPress(message), 450);
  };

  return (
    <div
      className={`flex flex-col w-fit max-w-full ${align} animate-in-up ${wrapperClass} ${dimmed && !selected ? "opacity-45" : ""} ${selected ? "message-row-selected px-1 py-0.5" : ""}`}
      style={NO_SELECT_STYLE}
      data-testid={`message-${message.id}`}
      data-status={message.__pending ? "pending" : message.__error ? "error" : tickStatus}
      onPointerDown={handlePointerDown}
      onPointerUp={() => clearTimeout(longPressRef.current)}
      onPointerLeave={() => clearTimeout(longPressRef.current)}
      onPointerCancel={() => clearTimeout(longPressRef.current)}
    >
      <div
        ref={bubbleRef}
        className={`${bubbleClass} message-bubble relative w-fit min-w-0 max-w-[75%] md:max-w-[70%] px-3 py-2 shadow-sm`}
        style={NO_SELECT_STYLE}
      >
        {starred && (
          <Star className="absolute -top-1 -right-1 h-3.5 w-3.5 text-amber-500 fill-amber-400 z-10" aria-hidden />
        )}
        {showSenderName && !mine && (
          <div className="message-sender-name text-[11px] font-semibold text-emerald-800 dark:text-emerald-400 mb-0.5" data-testid={`sender-name-${message.id}`}>
            {message.sender_name || "User"}
          </div>
        )}

        {(message.reply_to_id || message.reply_to_snippet) && (
          <div
            className={`mb-1.5 rounded-lg border-l-[3px] px-2 py-1.5 text-xs ${
              mine
                ? "border-emerald-300/90 bg-emerald-950/20 text-emerald-50/90"
                : "border-sky-500/80 bg-gray-100/90 dark:bg-gray-800/80 text-gray-600 dark:text-gray-300"
            }`}
            data-testid={`message-reply-quote-${message.id}`}
          >
            {message.reply_to_sender ? (
              <p className="font-semibold truncate opacity-90">{message.reply_to_sender}</p>
            ) : null}
            <p className="line-clamp-2 opacity-85">{message.reply_to_snippet || ""}</p>
          </div>
        )}

        {message.message_type === "image" && message.file_url && (
          <button
            type="button"
            className="relative block p-0 border-0 bg-transparent cursor-pointer rounded-xl overflow-hidden mb-1 max-w-full"
            onClick={() => !uploading && onImageClick?.(mediaSrc, message.file_name || "image")}
            data-testid={`message-image-${message.id}`}
          >
            <img
              src={mediaSrc}
              alt={message.file_name || "image"}
              className="rounded-xl max-h-80 w-full object-cover pointer-events-none"
            />
            <UploadProgressRing progress={uploadPct} visible={uploading || (message.__pending && uploadPct < 100)} />
          </button>
        )}

        {message.message_type === "video" && message.file_url && (
          <div className="relative mb-1">
            <video src={mediaSrc} controls className="rounded-xl max-h-80 w-full" poster={message.__videoPoster || undefined} />
            <UploadProgressRing progress={uploadPct} visible={uploading || (message.__pending && uploadPct < 100)} />
          </div>
        )}

        {message.message_type === "audio" && message.file_url && (
          <div className="mb-1" data-testid={`audio-player-${message.id}`}>
            <VoiceNotePlayer
              src={mediaSrc}
              durationLabel={parseVoiceNoteDurationLabel(message.content)}
              mine={mine}
            />
            <UploadProgressRing progress={uploadPct} visible={uploading} />
          </div>
        )}

        {message.message_type === "file" && message.file_url && (
          <div className="relative mb-1">
            <DocumentMessageBlock
              href={message.file_url}
              fileName={message.file_name}
              fileSize={message.file_size}
              mimeType={message.__mimeType}
              mine={mine}
            />
            <UploadProgressRing progress={uploadPct} visible={uploading} />
          </div>
        )}

        {message.content && message.message_type !== "audio" ? (
          <div className="min-w-0" style={{ minWidth: 0 }}>
            <p
              className="message-text whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100 leading-relaxed"
              style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
            >
              {highlightText(message.content, searchQuery)}
            </p>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-1 mt-1">
          {mine && message.__error && onRetry ? (
            <button
              type="button"
              onClick={() => onRetry(message)}
              className="text-[10px] font-medium text-rose-600 dark:text-rose-400 mr-auto touch-manipulation"
              data-testid={`message-retry-${message.id}`}
            >
              ⚠ Retry
            </button>
          ) : null}
          <span className="message-timestamp text-[10px] text-gray-500 dark:text-gray-400">{time}</span>
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

function messageBubblePropsEqual(prev, next) {
  if (prev.mine !== next.mine) return false;
  if (prev.showSenderName !== next.showSenderName) return false;
  if (prev.selected !== next.selected) return false;
  if (prev.starred !== next.starred) return false;
  if (prev.dimmed !== next.dimmed) return false;
  if (prev.searchQuery !== next.searchQuery) return false;
  if (prev.totalRecipients !== next.totalRecipients) return false;
  if (prev.showReceipts !== next.showReceipts) return false;
  const a = prev.message;
  const b = next.message;
  if (a === b) return true;
  if ((a?.__tempId || a?.id) !== (b?.__tempId || b?.id)) return false;
  if (a?.status !== b?.status) return false;
  if (a?.__pending !== b?.__pending) return false;
  if (a?.__error !== b?.__error) return false;
  if (a?.__uploadProgress !== b?.__uploadProgress) return false;
  if (a?.content !== b?.content) return false;
  if (a?.reply_to_id !== b?.reply_to_id) return false;
  if (a?.reply_to_snippet !== b?.reply_to_snippet) return false;
  if (a?.file_url !== b?.file_url) return false;
  if ((a?.read_by?.length || 0) !== (b?.read_by?.length || 0)) return false;
  return true;
}

export default memo(MessageBubble, messageBubblePropsEqual);
