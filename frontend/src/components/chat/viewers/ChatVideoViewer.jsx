import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Pause, Play } from "lucide-react";
import { getMediaPlaybackUrl } from "@/lib/mediaPlaybackUrl";
import { registerOverlayBack } from "@/lib/overlayBackHandler";
import MediaViewerHeader from "@/components/chat/viewers/MediaViewerHeader";
import { MV, formatMediaTime } from "@/components/chat/viewers/mediaViewerTheme";

/**
 * Full-screen in-app video with cover poster and custom controls (no native browser chrome).
 */
export default function ChatVideoViewer({
  open,
  url,
  posterUrl,
  fileName,
  title,
  onClose,
}) {
  const videoRef = useRef(null);
  const seekRef = useRef(null);
  const [src, setSrc] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [showCover, setShowCover] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef(null);

  const coverSrc = (() => {
    if (!posterUrl) return "";
    const p = String(posterUrl);
    if (p.startsWith("data:") || p.startsWith("blob:")) return p;
    return getMediaPlaybackUrl(posterUrl);
  })();

  const requestClose = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      v.pause();
    }
    onClose?.();
  }, [onClose]);

  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (playing) {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3200);
    }
  }, [playing]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play().catch(() => {
        setError("Could not play this video. Check your connection and try again.");
      });
    } else {
      v.pause();
    }
    bumpControls();
  }, [bumpControls]);

  const seekToClientX = useCallback(
    (clientX) => {
      const bar = seekRef.current;
      const v = videoRef.current;
      if (!bar || !v || !Number.isFinite(v.duration)) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      v.currentTime = ratio * v.duration;
      setCurrentTime(v.currentTime);
    },
    [],
  );

  useEffect(() => {
    if (!open || !url) {
      setSrc("");
      setLoading(false);
      setError("");
      setPlaying(false);
      setShowCover(true);
      setCurrentTime(0);
      setDuration(0);
      return undefined;
    }
    setLoading(true);
    setError("");
    setPlaying(false);
    setShowCover(true);
    setSrc(getMediaPlaybackUrl(url));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const unregister = registerOverlayBack(() => requestClose());
    const onKey = (e) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      unregister();
      window.removeEventListener("keydown", onKey);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [open, url, requestClose]);

  useEffect(() => {
    if (!playing) setControlsVisible(true);
  }, [playing]);

  if (!open || !url || typeof document === "undefined") return null;

  const label = title || fileName || "Video";
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const showChrome = controlsVisible || !playing || seeking;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex flex-col"
      style={{ backgroundColor: MV.bg }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-testid="chat-video-viewer"
    >
      <MediaViewerHeader
        title={label}
        onClose={requestClose}
        backIcon="close"
        testId="chat-video-viewer"
      />

      <div
        className="relative flex min-h-0 flex-1 flex-col items-center justify-center"
        onClick={bumpControls}
      >
        {loading && !error ? (
          <Loader2
            className="absolute z-10 h-10 w-10 animate-spin text-white/70"
            aria-hidden
          />
        ) : null}

        {error ? (
          <p className="px-6 text-center text-sm text-red-300">{error}</p>
        ) : (
          <>
            <video
              ref={videoRef}
              key={src}
              src={src}
              playsInline
              preload="auto"
              className="max-h-full max-w-full w-full object-contain"
              style={{
                opacity: showCover ? 0 : 1,
                transition: "opacity 280ms ease",
              }}
              onLoadedData={() => setLoading(false)}
              onCanPlay={() => setLoading(false)}
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d)) setDuration(d);
                setLoading(false);
              }}
              onTimeUpdate={(e) => {
                if (!seeking) setCurrentTime(e.currentTarget.currentTime);
              }}
              onPlay={() => {
                setPlaying(true);
                setShowCover(false);
                bumpControls();
              }}
              onPause={() => {
                setPlaying(false);
                setControlsVisible(true);
              }}
              onEnded={() => {
                setPlaying(false);
                setShowCover(true);
                setControlsVisible(true);
              }}
              onError={() => {
                setLoading(false);
                setError("Could not play this video. Check your connection and try again.");
              }}
            />

            {coverSrc && showCover ? (
              <img
                src={coverSrc}
                alt=""
                className="pointer-events-none absolute inset-0 m-auto max-h-full max-w-full object-contain"
                style={{ transition: "opacity 280ms ease" }}
                draggable={false}
              />
            ) : null}

            {!playing && !error ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="absolute z-20 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-black/45 backdrop-blur-sm touch-manipulation"
                aria-label="Play video"
                data-testid="chat-video-viewer-play"
              >
                <Play className="ml-1 h-9 w-9 text-white" fill="white" strokeWidth={0} />
              </button>
            ) : null}
          </>
        )}

        {!error && src ? (
          <div
            className="absolute inset-x-0 bottom-0 z-30 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-16 transition-opacity duration-200"
            style={{
              opacity: showChrome ? 1 : 0,
              pointerEvents: showChrome ? "auto" : "none",
              background:
                "linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 55%, transparent 100%)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white touch-manipulation"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? (
                  <Pause className="h-6 w-6" fill="white" strokeWidth={0} />
                ) : (
                  <Play className="h-6 w-6 ml-0.5" fill="white" strokeWidth={0} />
                )}
              </button>
              <span className="w-10 shrink-0 text-[11px] tabular-nums text-white/85">
                {formatMediaTime(currentTime)}
              </span>
              <div
                ref={seekRef}
                className="relative h-6 flex-1 touch-none"
                role="slider"
                aria-valuemin={0}
                aria-valuemax={duration || 0}
                aria-valuenow={currentTime}
                aria-label="Seek"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setSeeking(true);
                  seekToClientX(e.clientX);
                }}
                onPointerMove={(e) => {
                  if (seeking) seekToClientX(e.clientX);
                }}
                onPointerUp={(e) => {
                  setSeeking(false);
                  try {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  } catch {
                    /* ignore */
                  }
                }}
                onPointerCancel={() => setSeeking(false)}
              >
                <div
                  className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full"
                  style={{ backgroundColor: MV.track }}
                />
                <div
                  className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: MV.accent,
                  }}
                />
                <div
                  className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white shadow-md"
                  style={{ left: `calc(${progress}% - 7px)` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-white/55">
                {formatMediaTime(duration)}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
