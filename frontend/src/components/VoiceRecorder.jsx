import React, { useEffect, useRef, useState } from "react";
import { Mic, Send, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * VoiceRecorder — WhatsApp-style push-to-record control.
 *
 * Idle state: shows a mic icon. While recording, the surrounding chat composer
 * area is replaced by a recording strip with a live timer, cancel and send
 * controls. Picks the best available MIME type for the platform.
 *
 * Props:
 *   - onSend(blob: Blob, mime: string, durationMs: number)  // fire when user confirms send
 *   - disabled: boolean                                     // disable mic button (e.g. while uploading)
 *   - inline: boolean                                       // if true, render the recording UI inline (no portal)
 *   - onRecordingChange(isRecording: boolean): void         // notify parent so it can hide its own composer UI
 */
export default function VoiceRecorder({ onSend, disabled = false, onRecordingChange }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [preparing, setPreparing] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    onRecordingChange?.(recording);
  }, [recording, onRecordingChange]);

  useEffect(() => () => {
    // Cleanup on unmount: release the mic and clear timers.
    if (tickRef.current) clearInterval(tickRef.current);
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      // ignore
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  function pickMime() {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
      "audio/mpeg",
    ];
    for (const m of candidates) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
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
    setRecording(false);
    setSeconds(0);
    setPreparing(false);
  }

  async function start() {
    if (disabled || recording || preparing) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
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
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      stream.getTracks().forEach((t) => t.stop());
      setPreparing(false);
      toast.error("Voice recording isn't supported here.");
      return;
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
    rec.start();

    setRecording(true);
    setPreparing(false);
    setSeconds(0);
    tickRef.current = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 250);
  }

  function stopAndSend() {
    if (!recording) return;
    cancelledRef.current = false;
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      cleanupRecorder();
    }
  }

  function cancel() {
    if (!recording) return;
    cancelledRef.current = true;
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      cleanupRecorder();
    }
  }

  if (recording) {
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    return (
      <div
        className="flex flex-1 items-center gap-2 rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/80 dark:bg-rose-500/10 px-3 py-2"
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
          <div className="text-sm font-medium text-rose-800 dark:text-rose-200">
            Recording…
          </div>
          <div className="text-xs text-rose-700/80 dark:text-rose-300/80 font-mono tabular-nums">
            {mm}:{ss}
          </div>
        </div>
        <Button
          size="icon"
          onClick={stopAndSend}
          className="h-10 w-10 rounded-full bg-emerald-900 hover:bg-emerald-950"
          data-testid="voice-send-btn"
          title="Send voice note"
          type="button"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="icon"
      variant="ghost"
      className="rounded-full text-gray-500 hover:text-emerald-900 dark:hover:text-emerald-300"
      onClick={start}
      disabled={disabled || preparing}
      data-testid="voice-record-btn"
      title="Record voice note"
      type="button"
    >
      {preparing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" strokeWidth={1.5} />}
    </Button>
  );
}
