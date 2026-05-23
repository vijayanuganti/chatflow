import React, { useRef, memo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Check, CheckCheck, Clock, AlertCircle, Star } from "lucide-react";
import { fileUrl } from "@/lib/api";
import { NO_SELECT_STYLE } from "@/lib/noSelectStyles";
import VoiceNotePlayer, { parseVoiceNoteDurationLabel } from "@/components/VoiceNotePlayer";
import UploadProgressRing from "@/components/chat/UploadProgressRing";
import DocumentMessageBlock from "@/components/chat/DocumentMessageBlock";
import { openVideoInNativeApp } from "@/lib/mediaHandler";
import { toast } from "sonner";

function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatVideoDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
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

function ReceiptTicks({ mine, showReceipts, message, tickStatus }) {
  const { t } = useTranslation();
  if (!mine || !showReceipts) return null;
  if (message.__pending) {
    return <Clock className="h-3 w-3 text-gray-400 shrink-0" strokeWidth={2} aria-label={t("message.sending")} />;
  }
  if (message.__error) {
    return <AlertCircle className="h-3 w-3 text-rose-500 shrink-0" strokeWidth={2} aria-label={t("message.failed")} />;
  }
  if (tickStatus === "seen") {
    return <CheckCheck className="h-3 w-3 text-sky-500 shrink-0" strokeWidth={2} aria-label={t("message.read")} />;
  }
  if (tickStatus === "delivered") {
    return <CheckCheck className="h-3 w-3 text-gray-400 shrink-0" strokeWidth={2} aria-label={t("message.delivered")} />;
  }
  return <Check className="h-3 w-3 text-gray-400 shrink-0" strokeWidth={2} aria-label={t("message.sent")} />;
}

function MessageBubble({
  message,
  mine,
  showSenderName,
  totalRecipients,
  showReceipts = true,
  onImageClick,
  selected = false,
  actionSelected = false,
  flashHighlight = false,
  starred = false,
  searchQuery = "",
  onLongPress,
  onToggleSelect,
  selectionMode = false,
  dimmed = false,
  onRetry,
  bubbleRef,
  viewerUserId,
}) {
  const { t } = useTranslation();
  const longPressRef = useRef(null);
  const didLongPressRef = useRef(false);
  const [videoDurationLabel, setVideoDurationLabel] = useState("");

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
  const messageId = message.id || message.__tempId;

  const isImage = message.message_type === "image" && message.file_url;
  const isVideo = message.message_type === "video" && message.file_url;
  const isDocument = message.message_type === "file" && message.file_url;
  const isAudio = message.message_type === "audio" && message.file_url;
  const isMediaBubble = isImage || isVideo || isDocument;

  const handlePointerDown = () => {
    if (!messageId) return;
    didLongPressRef.current = false;
    if (!onLongPress && !onToggleSelect) return;
    clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      if (onLongPress) onLongPress(message);
    }, 500);
  };

  const handleClick = () => {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    if (selectionMode && onToggleSelect && messageId) {
      onToggleSelect(messageId);
    }
  };

  const clearPress = () => clearTimeout(longPressRef.current);

  const onVideoMetadata = useCallback((e) => {
    const d = e.currentTarget.duration;
    if (Number.isFinite(d) && d > 0) {
      setVideoDurationLabel(formatVideoDuration(d));
    }
  }, []);

  const timestampRow = (
    <div className="message-timestamp-row">
      <span className="message-timestamp shrink-0">{time}</span>
      <ReceiptTicks mine={mine} showReceipts={showReceipts} message={message} tickStatus={tickStatus} />
    </div>
  );

  const overlayTimestamp = (
    <div className="absolute bottom-1 right-2 z-[2] flex items-center gap-1 rounded-full bg-black/40 px-1.5 py-0.5">
      <span className="text-[10px] text-white">{time}</span>
      {mine && showReceipts ? (
        <span className="text-white [&_svg]:text-white">
          <ReceiptTicks mine={mine} showReceipts={showReceipts} message={message} tickStatus={tickStatus} />
        </span>
      ) : null}
    </div>
  );

  const bubblePaddingClass = isMediaBubble ? "media-bubble p-0" : "";

  return (
    <>
      <div
        className={`flex flex-col ${align} animate-in-up ${wrapperClass} ${dimmed && !selected ? "opacity-45" : ""}`}
        style={NO_SELECT_STYLE}
        data-testid={`message-${message.id || message.__tempId}`}
        data-status={message.__pending ? "pending" : message.__error ? "error" : tickStatus}
        onPointerDown={handlePointerDown}
        onPointerUp={clearPress}
        onPointerLeave={clearPress}
        onPointerCancel={clearPress}
        onClick={handleClick}
      >
        <div
          ref={bubbleRef}
          className={`${bubbleClass} message-bubble relative shadow-sm w-fit ${bubblePaddingClass} ${
            isImage ? "image-bubble overflow-hidden rounded-[12px]" : ""
          } ${isVideo ? "video-bubble overflow-hidden rounded-[12px]" : ""} ${
            isDocument ? "document-bubble rounded-[12px]" : ""
          }`}
          style={
            isImage || isVideo
              ? { maxWidth: "260px", minWidth: "160px", ...NO_SELECT_STYLE }
              : isDocument
                ? { minWidth: "220px", maxWidth: "280px", ...NO_SELECT_STYLE }
                : NO_SELECT_STYLE
          }
        >
          {(actionSelected || flashHighlight) && (
            <div
              className={`pointer-events-none absolute inset-0 z-[1] rounded-[inherit] bg-primary/10 ring-1 ring-primary/25 ${
                flashHighlight ? "animate-pulse" : ""
              }`}
              aria-hidden
            />
          )}
          {selected && !actionSelected && (
            <>
              <div
                className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit] bg-emerald-500/15"
                aria-hidden
              />
              <div
                className="absolute -left-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm"
                aria-hidden
              >
                <Check className="h-3 w-3" strokeWidth={3} />
              </div>
            </>
          )}
          {starred && (
            <Star
              className="absolute bottom-1 right-1.5 h-2.5 w-2.5 text-primary fill-primary z-[3] pointer-events-none"
              strokeWidth={2}
              aria-label={t("message.starred")}
            />
          )}

          {showSenderName && !mine && (
            <div
              className="message-sender-name px-3 pt-2 text-[11px] font-semibold text-emerald-800 dark:text-emerald-400"
              data-testid={`sender-name-${message.id}`}
            >
              {message.sender_name || t("common.user")}
            </div>
          )}

          {(message.is_forwarded || message.reply_to_id || message.reply_to_snippet) && (
            <div className={`${isMediaBubble ? "px-3 pt-2" : ""}`}>
              {message.is_forwarded &&
                message.original_sender_id &&
                viewerUserId &&
                String(message.original_sender_id) !== String(viewerUserId) && (
                <p className="text-[10px] italic text-gray-500 dark:text-gray-400 mb-0.5" data-testid={`message-forwarded-${message.id}`}>
                  {t("message.forwarded")}
                </p>
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
            </div>
          )}

          {isImage && (
            <div className="relative">
              <button
                type="button"
                className="block w-full border-0 bg-transparent p-0 cursor-pointer touch-manipulation"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!uploading) onImageClick?.(mediaSrc, message.file_name || "image");
                }}
                data-testid={`message-image-${message.id}`}
              >
                <img
                  src={mediaSrc}
                  alt={message.file_name || "image"}
                  className="block h-auto w-full object-cover"
                  style={{ maxHeight: "300px", borderRadius: "12px 12px 0 0" }}
                />
              </button>
              {!uploading && overlayTimestamp}
              <UploadProgressRing progress={uploadPct} visible={uploading || (message.__pending && uploadPct < 100)} />
            </div>
          )}

          {isVideo && (
            <div
              className="relative cursor-pointer touch-manipulation"
              onClick={(e) => {
                e.stopPropagation();
                if (!uploading) {
                  void openVideoInNativeApp(
                    message.file_url,
                    message.file_name || "video.mp4",
                    message.__mimeType,
                    (msg) => toast.error(msg),
                  );
                }
              }}
              data-testid={`message-video-${message.id}`}
            >
              <video
                src={mediaSrc}
                className="block w-full"
                style={{ maxHeight: "300px", borderRadius: "12px 12px 0 0", objectFit: "cover" }}
                preload="metadata"
                muted
                playsInline
                poster={message.__videoPoster || undefined}
                onLoadedMetadata={onVideoMetadata}
              />
              {!uploading && (
                <>
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[12px] bg-black/20">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60">
                      <svg viewBox="0 0 24 24" fill="white" className="ml-1 h-7 w-7" aria-hidden>
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                  {videoDurationLabel ? (
                    <div className="absolute bottom-2 left-2 rounded bg-black/50 px-1 text-[10px] text-white">
                      {videoDurationLabel}
                    </div>
                  ) : null}
                  {overlayTimestamp}
                </>
              )}
              <UploadProgressRing progress={uploadPct} visible={uploading || (message.__pending && uploadPct < 100)} />
            </div>
          )}

          {isAudio && (
            <div className="px-3 py-2" data-testid={`audio-player-${message.id}`}>
              <VoiceNotePlayer
                src={mediaSrc}
                durationLabel={parseVoiceNoteDurationLabel(message.content)}
                mine={mine}
              />
              <UploadProgressRing progress={uploadPct} visible={uploading} />
            </div>
          )}

          {isDocument && (
            <div className="relative px-3 py-3">
              <DocumentMessageBlock
                href={message.file_url}
                fileName={message.file_name}
                fileSize={message.file_size}
                mimeType={message.__mimeType}
                timestampRow={timestampRow}
              />
              <UploadProgressRing progress={uploadPct} visible={uploading} />
            </div>
          )}

          {message.content && !isAudio ? (
            <>
              <p
                className={`message-text whitespace-pre-wrap break-words text-sm text-gray-900 dark:text-gray-100 leading-relaxed ${
                  isImage || isVideo ? "px-3 py-1.5" : ""
                }`}
              >
                {highlightText(message.content, searchQuery)}
              </p>
              {(message.is_edited || message.edited_at) && (
                <p
                  className={`text-[9px] italic text-gray-400 dark:text-gray-500 ${
                    isImage || isVideo ? "px-3 pb-0.5" : "px-3 -mt-0.5 pb-0.5"
                  }`}
                  data-testid={`message-edited-${message.id}`}
                >
                  {t("message.edited")}
                </p>
              )}
            </>
          ) : null}

          {!isMediaBubble && !isAudio ? (
            <div>
              {mine && message.__error && onRetry ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry(message);
                  }}
                  className="mb-1 text-[10px] font-medium text-rose-600 dark:text-rose-400 touch-manipulation"
                  data-testid={`message-retry-${message.id}`}
                >
                  {t("message.retry")}
                </button>
              ) : null}
              {timestampRow}
            </div>
          ) : isAudio ? (
            <div className="px-3 pb-2">
              {mine && message.__error && onRetry ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry(message);
                  }}
                  className="mb-1 text-[10px] font-medium text-rose-600 dark:text-rose-400 touch-manipulation"
                  data-testid={`message-retry-${message.id}`}
                >
                  {t("message.retry")}
                </button>
              ) : null}
              {timestampRow}
            </div>
          ) : null}
        </div>
      </div>

    </>
  );
}

function messageBubblePropsEqual(prev, next) {
  if (prev.mine !== next.mine) return false;
  if (prev.showSenderName !== next.showSenderName) return false;
  if (prev.selected !== next.selected) return false;
  if (prev.actionSelected !== next.actionSelected) return false;
  if (prev.flashHighlight !== next.flashHighlight) return false;
  if (prev.starred !== next.starred) return false;
  if (prev.dimmed !== next.dimmed) return false;
  if (prev.selectionMode !== next.selectionMode) return false;
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
  if (a?.is_edited !== b?.is_edited) return false;
  if (a?.edited_at !== b?.edited_at) return false;
  if (a?.is_forwarded !== b?.is_forwarded) return false;
  if (a?.original_sender_id !== b?.original_sender_id) return false;
  if (a?.reply_to_id !== b?.reply_to_id) return false;
  if (a?.reply_to_snippet !== b?.reply_to_snippet) return false;
  if (a?.file_url !== b?.file_url) return false;
  if ((a?.read_by?.length || 0) !== (b?.read_by?.length || 0)) return false;
  return true;
}

export default memo(MessageBubble, messageBubblePropsEqual);
