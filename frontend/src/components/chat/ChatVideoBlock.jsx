import React, { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { fileUrl, mediaFetchUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/chatMedia";
import { useVideoPoster } from "@/hooks/useVideoPoster";
import { useChatMediaDownload } from "@/hooks/useChatMediaDownload";
import MediaDownloadRing from "@/components/chat/MediaDownloadRing";
import UploadProgressRing from "@/components/chat/UploadProgressRing";

function formatVideoDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function ChatVideoBlock({
  message,
  uploading,
  uploadPct,
  overlayTimestamp,
  onError,
  onOpenInApp,
  selectionMode = false,
}) {
  const mediaSrc = fileUrl(message.file_url);
  const posterSrc = useVideoPoster(message.file_url, message.__videoPoster);
  const fileSize = message.file_size;

  const {
    progress,
    isDownloaded,
    isDownloading,
    onBubbleTap,
  } = useChatMediaDownload({
    url: message.file_url,
    fileName: message.file_name,
    mimeType: message.__mimeType,
    mediaKind: "video",
    posterUrl: posterSrc || undefined,
    onOpenInApp,
  });

  const [durationLabel, setDurationLabel] = useState("");

  const onVideoMetadata = useCallback((e) => {
    const d = e.currentTarget.duration;
    if (Number.isFinite(d) && d > 0) {
      setDurationLabel(formatVideoDuration(d));
    }
  }, []);

  useEffect(() => {
    if (!message.file_url || durationLabel) return;
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = mediaFetchUrl(message.file_url, { attachToken: true });
    v.onloadedmetadata = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) {
        setDurationLabel(formatVideoDuration(v.duration));
      }
      v.removeAttribute("src");
      v.load();
    };
  }, [message.file_url, durationLabel]);

  const showUpload = uploading;
  const inAppPlayback = Boolean(onOpenInApp);
  const showDownloadUi = !showUpload && !isDownloaded && !inAppPlayback;
  const showPlay = !showUpload && (inAppPlayback || isDownloaded);
  const showVideoSrc = isDownloaded || showUpload;

  return (
    <div
      className="relative cursor-pointer touch-manipulation overflow-hidden"
      style={{ minHeight: 140, maxHeight: 300, borderRadius: 12 }}
      onClick={(e) => {
        if (selectionMode) return;
        e.stopPropagation();
        if (showUpload) return;
        void onBubbleTap(onError);
      }}
      data-testid={`message-video-${message.id}`}
    >
      {posterSrc && !showVideoSrc ? (
        <img
          src={posterSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover bg-gray-800"
          draggable={false}
        />
      ) : null}

      {mediaSrc || posterSrc || showVideoSrc ? (
        <video
          src={showVideoSrc ? mediaSrc : undefined}
          poster={posterSrc || undefined}
          className="block w-full bg-gray-800"
          style={{
            maxHeight: 300,
            minHeight: 140,
            borderRadius: 12,
            objectFit: "cover",
            opacity: posterSrc && !showVideoSrc ? 0 : 1,
          }}
          preload="metadata"
          muted
          playsInline
          onLoadedMetadata={onVideoMetadata}
        />
      ) : (
        <div
          className="flex w-full items-center justify-center bg-gray-800"
          style={{ height: 180, borderRadius: 12 }}
        >
          <span className="text-xs text-gray-400">Video</span>
        </div>
      )}

      {showDownloadUi && !isDownloading ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-[12px] bg-black/35">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55">
            <Download className="h-6 w-6 text-white" strokeWidth={2} />
          </div>
          {fileSize ? (
            <span className="mt-2 text-[11px] font-medium text-white">{formatFileSize(fileSize)}</span>
          ) : null}
        </div>
      ) : null}

      {showPlay ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[12px] bg-black/20">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60">
            <svg viewBox="0 0 24 24" fill="white" className="ml-1 h-7 w-7" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      ) : null}

      {durationLabel && !showUpload ? (
        <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
          {durationLabel}
        </div>
      ) : null}

      {!showUpload && overlayTimestamp}
      <MediaDownloadRing
        visible={isDownloading}
        progress={progress}
        onCancel={() => void onBubbleTap(onError)}
      />
      <UploadProgressRing progress={uploadPct} visible={showUpload} />
    </div>
  );
}
