import React from "react";
import { Download, Play } from "lucide-react";
import { formatFileSize } from "@/lib/chatMedia";
import { useVideoPoster } from "@/hooks/useVideoPoster";
import { useChatMediaDownload } from "@/hooks/useChatMediaDownload";

/**
 * WhatsApp-style inline video bubble: thumbnail, single center play, timestamp bottom-right, thin bottom progress.
 */
export default function ChatVideoBlock({
  message,
  uploading,
  uploadPct,
  overlayTimestamp,
  onError,
  onOpenInApp,
  selectionMode = false,
}) {
  const posterSrc = useVideoPoster(message.file_url, message.__videoPoster);
  const fileSize = message.file_size;

  const {
    progress: downloadProgress,
    isDownloaded,
    isDownloading,
    onBubbleTap,
    openInApp,
  } = useChatMediaDownload({
    url: message.file_url,
    fileName: message.file_name,
    mimeType: message.__mimeType,
    mediaKind: "video",
    posterUrl: posterSrc || undefined,
    onOpenInApp,
  });

  const showUpload = uploading;
  const inAppPlayback = Boolean(onOpenInApp);
  const showDownloadUi = !showUpload && !inAppPlayback && !isDownloaded;
  const showCenterPlay = !showUpload && !showDownloadUi && (inAppPlayback || isDownloaded);
  const bottomProgress = showUpload
    ? uploadPct ?? 0
    : isDownloading
      ? downloadProgress
      : null;

  const handleActivate = (e) => {
    if (selectionMode) return;
    e.stopPropagation();
    if (showUpload) return;
    if (inAppPlayback) {
      openInApp();
      return;
    }
    void onBubbleTap(onError);
  };

  return (
    <div
      className="relative w-full cursor-pointer touch-manipulation overflow-hidden bg-[#1e1e1e]"
      style={{ minHeight: 160, maxHeight: 300, borderRadius: 12 }}
      onClick={handleActivate}
      role="button"
      tabIndex={0}
      aria-label="Play video"
      data-testid={`message-video-${message.id}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleActivate(e);
        }
      }}
    >
      {posterSrc ? (
        <img
          src={posterSrc}
          alt=""
          className="block h-full min-h-[160px] w-full object-cover"
          style={{ maxHeight: 300 }}
          draggable={false}
        />
      ) : (
        <div
          className="flex w-full items-center justify-center bg-[#2a2a2a]"
          style={{ minHeight: 160, maxHeight: 300 }}
          aria-hidden
        />
      )}

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/55 via-black/20 to-transparent"
        aria-hidden
      />

      {showDownloadUi && !isDownloading ? (
        <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center bg-black/40">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/50 bg-black/40">
            <Download className="h-5 w-5 text-white" strokeWidth={2} />
          </div>
          {fileSize ? (
            <span className="mt-2 text-[11px] font-medium text-white/90">
              {formatFileSize(fileSize)}
            </span>
          ) : null}
        </div>
      ) : null}

      {showCenterPlay ? (
        <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center">
          <div
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-[2.5px] border-white/80 bg-black/30 shadow-lg backdrop-blur-[1px]"
            aria-hidden
          >
            <Play className="ml-0.5 h-6 w-6 text-white" fill="white" strokeWidth={0} />
          </div>
        </div>
      ) : null}

      {overlayTimestamp ? (
        <div className="pointer-events-none z-[4] [&_.message-timestamp-row]:hidden">
          {overlayTimestamp}
        </div>
      ) : null}

      {bottomProgress != null ? (
        <div
          className="absolute bottom-0 left-0 right-0 z-[5] h-[3px] bg-white/25"
          role="progressbar"
          aria-valuenow={bottomProgress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-white transition-[width] duration-150 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, bottomProgress))}%` }}
          />
        </div>
      ) : null}

    </div>
  );
}
