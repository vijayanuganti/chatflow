import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { buildWaveformBars } from "@/lib/chatMedia";

/** Parse "🎤 Voice note (0:12)" or "(1:05)" from stored caption. */
export function parseVoiceNoteDurationLabel(content) {
  if (!content || typeof content !== "string") return null;
  const m =
    content.match(/Voice\s*note\s*\((\d+)\s*:\s*(\d{2})\)/i) ||
    content.match(/\((\d+)\s*:\s*(\d{2})\)\s*$/);
  if (!m) return null;
  return `${m[1]}:${m[2]}`;
}

function pauseOtherVoicePlayers(current) {
  try {
    document.querySelectorAll("audio[data-voice-note]").forEach((el) => {
      if (el !== current && !el.paused) el.pause();
    });
  } catch {
    /* ignore */
  }
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60));
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * WhatsApp-style voice row: [play] [waveform bars] [duration]
 */
export default function VoiceNotePlayer({ src, durationLabel, mine }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);

  const bars = useMemo(() => buildWaveformBars(src, 36), [src]);

  const onEnded = useCallback(() => {
    setPlaying(false);
    setProgress(0);
    setElapsed(0);
  }, []);

  const onTimeUpdate = useCallback(() => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    setElapsed(el.currentTime);
    setProgress(el.currentTime / el.duration);
  }, []);

  const onLoadedMetadata = useCallback(() => {
    const el = audioRef.current;
    if (el?.duration && Number.isFinite(el.duration)) setDuration(el.duration);
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return undefined;
    el.addEventListener("ended", onEnded);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("loadedmetadata", onLoadedMetadata);
    return () => {
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [src, onEnded, onTimeUpdate, onLoadedMetadata]);

  const toggle = (e) => {
    e?.stopPropagation?.();
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      pauseOtherVoicePlayers(el);
      void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const displayTime = playing || elapsed > 0
    ? formatDuration(elapsed)
    : (durationLabel || (duration > 0 ? formatDuration(duration) : "0:00"));

  const filledColor = mine ? "bg-[#1b7a54]" : "bg-[#8696a0]";
  const emptyColor = mine ? "bg-[#1b7a54]/25" : "bg-[#8696a0]/35";
  const iconColor = mine ? "text-[#1b7a54]" : "text-[#8696a0]";

  return (
    <div
      className="flex items-center gap-2 min-w-[200px] max-w-[min(100%,260px)] py-0.5"
      data-testid="voice-note-player"
    >
      <audio ref={audioRef} src={src} preload="metadata" playsInline className="hidden" data-voice-note />
      <button
        type="button"
        onClick={toggle}
        className={`h-8 w-8 shrink-0 flex items-center justify-center touch-manipulation ${iconColor}`}
        title={playing ? "Pause" : "Play"}
        data-testid="voice-note-play-btn"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current pl-0.5" />}
      </button>
      <div className="flex flex-1 items-center gap-[2px] h-6 min-w-0" aria-hidden>
        {bars.map((h, i) => {
          const filled = (i + 1) / bars.length <= progress;
          return (
            <span
              key={i}
              className={`w-[2px] rounded-full shrink-0 transition-colors duration-100 ${filled ? filledColor : emptyColor}`}
              style={{ height: `${Math.max(4, Math.round(h * 22))}px` }}
            />
          );
        })}
      </div>
      <span className={`text-[11px] font-medium tabular-nums shrink-0 ${mine ? "text-[#667781]" : "text-[#667781]"}`}>
        {displayTime}
      </span>
    </div>
  );
}
