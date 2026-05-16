import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Send, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Tap mic → recording strip (same component instance — must not unmount mid-record).
 */
export default function VoiceRecorder({
  onSend,
  disabled = false,
  onRecordingChange,
  fabOnly = false,
  fullWidth = false,
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [preparing, setPreparing] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef(null);
  const cancelledRef = useRef(false);
  const recordingRef = useRef(false);

  const setRecordingState = useCallback((value) => {
    recordingRef.current = value;
    setRecording(value);
    onRecordingChange?.(value);
  }, [onRecordingChange]);

  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current);
    try {
      if (mediaRecorderRef.current?.state !== "inactive") {
        mediaRecorderRef.current?.stop();
      }
    } catch {
      /* ignore */
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  function pickMime() {
    if (typeof MediaRecorder === "undefined") return "";
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const candidates = isIOS
      ? ["audio/mp4", "audio/aac", "audio/webm", "audio/ogg;codecs=opus", "audio/webm;codecs=opus"]
      : ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    for (const m of candidates) {
      if (MediaRecorder.isTypeSupported?.(m)) return m;
    }
    return "";
  }

  function cleanupRecorder() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setRecordingState(false);
    setSeconds(0);
    setPreparing(false);
  }

  const start = useCallback(async () => {
    if (disabled || recordingRef.current || preparing) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Voice notes aren't supported in this browser.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      toast.error("Voice notes aren't supported in this browser.");
      return;
    }

    setPreparing(true);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    } catch (err) {
      setPreparing(false);
      if (err?.name === "NotAllowedError" || err?.name === "SecurityError") {
        toast.error("Microphone permission denied.");
      } else {
        toast.error("Couldn't access your microphone.");
      }
      return;
    }

    const mime = pickMime();
    let rec;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      try {
        rec = new MediaRecorder(stream);
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        setPreparing(false);
        toast.error("Voice recording isn't supported here.");
        return;
      }
    }

    chunksRef.current = [];
    cancelledRef.current = false;

    rec.addEventListener("dataavailable", (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    });

    rec.addEventListener("stop", () => {
      const wasCancelled = cancelledRef.current;
      const blobMime = rec.mimeType || mime || "audio/webm";
      const durationMs = Math.max(0, Date.now() - startedAtRef.current);
      const chunks = chunksRef.current.slice();
      cleanupRecorder();
      if (wasCancelled) return;
      if (!chunks.length) {
        toast.error("Empty recording — try again.");
        return;
      }
      const blob = new Blob(chunks, { type: blobMime });
      if (blob.size < 200) {
        toast.error("Recording too short.");
        return;
      }
      onSend?.(blob, blobMime, durationMs);
    });

    mediaRecorderRef.current = rec;
    streamRef.current = stream;
    startedAtRef.current = Date.now();

    try {
      rec.start(200);
    } catch {
      try {
        rec.start();
      } catch {
        cleanupRecorder();
        toast.error("Could not start recording.");
        return;
      }
    }

    setRecordingState(true);
    setPreparing(false);
    setSeconds(0);
    tickRef.current = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 250);
  }, [disabled, onSend, preparing, setRecordingState]);

  const stopAndSend = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === "inactive") return;
    cancelledRef.current = false;
    try {
      if (rec.state === "recording") rec.requestData();
      rec.stop();
    } catch {
      cleanupRecorder();
    }
  }, []);

  const cancel = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === "inactive") return;
    cancelledRef.current = true;
    try {
      if (rec.state === "recording") rec.requestData();
      rec.stop();
    } catch {
      cleanupRecorder();
    }
  }, []);

  if (recording) {
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    return (
      <div
        className={`flex items-center gap-2 rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/80 dark:bg-rose-500/10 px-3 py-2 ${
          fullWidth ? "flex-1 w-full min-w-0" : "flex-1"
        }`}
        data-testid="voice-recording-strip"
      >
        <Button
          size="icon"
          variant="ghost"
          className="rounded-full h-9 w-9 text-rose-700 dark:text-rose-300"
          onClick={cancel}
          data-testid="voice-cancel-btn"
          title="Cancel"
          type="button"
        >
          <X className="h-5 w-5" />
        </Button>
        <span className="relative inline-flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-600" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-rose-800 dark:text-rose-200">Recording…</div>
          <div className="text-xs text-rose-700/80 dark:text-rose-300/80 font-mono tabular-nums">
            {mm}:{ss}
          </div>
        </div>
        <Button
          size="icon"
          onClick={stopAndSend}
          className="h-10 w-10 rounded-full bg-emerald-600 hover:bg-emerald-700"
          data-testid="voice-send-btn"
          title="Send voice note"
          type="button"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (fabOnly) {
    return (
      <button
        type="button"
        onClick={() => void start()}
        disabled={disabled || preparing}
        className="h-12 w-12 shrink-0 rounded-full flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white shadow-md touch-manipulation transition-transform duration-200 active:scale-95 disabled:opacity-60"
        data-testid="voice-record-btn"
        title="Record voice note"
        aria-label="Record voice note"
      >
        {preparing ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Mic className="h-5 w-5 text-white" strokeWidth={2} />}
      </button>
    );
  }

  return (
    <Button
      size="icon"
      variant="ghost"
      className="rounded-full text-gray-500 hover:text-emerald-900 dark:hover:text-emerald-300"
      onClick={() => void start()}
      disabled={disabled || preparing}
      data-testid="voice-record-btn"
      title="Record voice note"
      type="button"
    >
      {preparing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" strokeWidth={1.5} />}
    </Button>
  );
}
