import React, { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";

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

/**
 * Minimal in-chat voice note UI (WhatsApp-like): one play/pause control, no
 * browser download / speed / scrubber chrome.
 */
export default function VoiceNotePlayer({ src, durationLabel, mine }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const onEnded = useCallback(() => setPlaying(false), []);
  const onPause = useCallback(() => setPlaying(false), []);
  const onPlay = useCallback(() => {
    setPlaying(true);
    if (audioRef.current) pauseOtherVoicePlayers(audioRef.current);
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return undefined;
    el.addEventListener("ended", onEnded);
    el.addEventListener("pause", onPause);
    el.addEventListener("play", onPlay);
    return () => {
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("play", onPlay);
    };
  }, [src, onEnded, onPause, onPlay]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      pauseOtherVoicePlayers(el);
      void el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  };

  const shell = mine
    ? "bg-emerald-700/95 text-white border-emerald-800/30"
    : "bg-white/90 dark:bg-gray-800/95 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-600";

  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border px-2 py-1.5 min-w-[140px] max-w-full ${shell}`}
      data-testid="voice-note-player"
    >
      <audio ref={audioRef} src={src} preload="metadata" playsInline className="hidden" data-voice-note />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={`h-9 w-9 shrink-0 rounded-full ${mine ? "text-white hover:bg-white/15" : "text-emerald-900 dark:text-emerald-200 hover:bg-gray-100 dark:hover:bg-gray-700/80"}`}
        onClick={toggle}
        title={playing ? "Pause" : "Play"}
        data-testid="voice-note-play-btn"
      >
        {playing ? <Pause className="h-5 w-5" strokeWidth={1.75} /> : <Play className="h-5 w-5 pl-0.5" strokeWidth={1.75} />}
      </Button>
      {durationLabel ? (
        <span className={`text-xs tabular-nums font-medium ${mine ? "text-emerald-50" : "text-gray-600 dark:text-gray-300"}`}>
          {durationLabel}
        </span>
      ) : (
        <span className={`text-xs ${mine ? "text-emerald-100/90" : "text-gray-500"}`}>Voice</span>
      )}
    </div>
  );
}
