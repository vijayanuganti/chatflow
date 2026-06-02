import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { formatFileSize } from "@/lib/chatMedia";
import { useVideoPoster } from "@/hooks/useVideoPoster";
import { useChatMediaDownload } from "@/hooks/useChatMediaDownload";

/** Never use <video> in the bubble — OS play glyphs stack with our overlay. */
function isImagePosterSrc(src) {
  if (!src) return false;
  if (src.startsWith("data:image/")) return true;
  if (src.startsWith("blob:")) return true;
  const path = src.split("?")[0].split("#")[0].toLowerCase();
  return !/\.(mp4|mov|webm|m4v|3gp|mkv|avi)(\?|$)/.test(path);
}

function CenterPlayOverlay() {
  return (
    <div
      className="pointer-events-none absolute z-[3] chat-inline-video-play"
      style={{
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
      aria-hidden
    >
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: 52,
          height: 52,
          border: "2.5px solid rgba(255, 255, 255, 0.8)",
          backgroundColor: "rgba(0, 0, 0, 0.3)",
        }}
      >
        <svg viewBox="0 0 24 24" width={26} height={26} fill="#fff" style={{ marginLeft: 3 }} aria-hidden>
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
  );
}

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
  const rawPosterSrc = useVideoPoster(message.file_url, message.__videoPoster);
  const [posterBroken, setPosterBroken] = useState(false);
  const posterSrc =
    !posterBroken && isImagePosterSrc(rawPosterSrc) ? rawPosterSrc : "";
  const fileSize = message.file_size;

  useEffect(() => {
    setPosterBroken(false);
  }, [rawPosterSrc]);

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
      className="chat-inline-video-block relative w-full cursor-pointer touch-manipulation overflow-hidden bg-[#1e1e1e]"
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
          onError={() => setPosterBroken(true)}
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

      {showCenterPlay ? <CenterPlayOverlay /> : null}

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
