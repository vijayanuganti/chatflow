import React, { useCallback, useRef, useState } from "react";
import { Image as ImageIcon, Video as VideoIcon, FileText, Music } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import EmojiPickerPanel, { EmojiTriggerButton } from "@/components/EmojiPickerPanel";
import VoiceRecorder from "@/components/VoiceRecorder";
import { IconAttach, IconCamera, IconMic, IconSend } from "./ChatIcons";
import {
  capturePhotoFileForUpload,
  pickGalleryPhotoFileForUpload,
  isCapacitorNativeApp,
} from "@/lib/nativeMedia";
import { toast } from "sonner";
import { formatApiError } from "@/lib/api";
import ReplyPreviewBar from "@/components/chat/ReplyPreviewBar";

/**
 * WhatsApp-style composer: pill (emoji | text | attach | camera) + mic/send FAB.
 * Emoji keyboard opens below the bar at full width.
 */
export default function ChatComposer({
  text,
  onTextChange,
  onTyping,
  onSendText,
  onSendFile,
  onSendVoice,
  onKeyDown,
  onComposerFocus,
  onComposerBlur,
  composerRef,
  disabled = false,
  onRecordingChange,
  onEmojiOpenChange,
  replyingTo = null,
  onCancelReply,
}) {
  const [voiceRecording, setVoiceRecording] = useState(false);

  const handleVoiceRecordingChange = useCallback((active) => {
    setVoiceRecording(active);
    onRecordingChange?.(active);
  }, [onRecordingChange]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const docInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const hasText = text.trim().length > 0;

  const setEmoji = useCallback((open) => {
    setEmojiOpen(open);
    onEmojiOpenChange?.(open);
  }, [onEmojiOpenChange]);

  const openPicker = useCallback(async (kind) => {
    setAttachOpen(false);
    if (kind === "photo" && isCapacitorNativeApp()) {
      try {
        const file = await pickGalleryPhotoFileForUpload();
        if (file) onSendFile?.(file);
      } catch (err) {
        const msg = (err && (err.message || String(err))) || "";
        if (!/cancel|dismiss|denied|User cancelled/i.test(msg)) {
          toast.error(formatApiError(err) || "Could not pick photo");
        }
      }
      return;
    }
    const ref = kind === "photo" ? photoInputRef
      : kind === "video" ? videoInputRef
      : kind === "audio" ? audioInputRef
      : docInputRef;
    ref.current?.click();
  }, [onSendFile]);

  const handleFileInput = (e) => {
    const file = e.target?.files?.[0];
    if (file) onSendFile?.(file);
    if (e.target) e.target.value = "";
  };

  const handleCamera = useCallback(async () => {
    if (disabled) return;
    if (isCapacitorNativeApp()) {
      try {
        const file = await capturePhotoFileForUpload();
        if (file) onSendFile?.(file);
      } catch (err) {
        const msg = (err && (err.message || String(err))) || "";
        if (!/cancel|dismiss|denied|User cancelled/i.test(msg)) {
          toast.error(formatApiError(err) || "Could not open camera");
        }
      }
      return;
    }
    cameraInputRef.current?.click();
  }, [disabled, onSendFile]);

  const insertEmoji = useCallback((emoji) => {
    const el = composerRef?.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${emoji}${text.slice(end)}`;
    onTextChange(next);
    onTyping?.(next);
    requestAnimationFrame(() => {
      if (!el) return;
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }, [text, onTextChange, onTyping, composerRef]);

  return (
    <div className="flex w-full flex-col">
      <ReplyPreviewBar replyingTo={replyingTo} onCancel={onCancelReply} />
      <input ref={photoInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileInput} />
      <input ref={videoInputRef} type="file" className="hidden" accept="video/*" onChange={handleFileInput} />
      <input ref={audioInputRef} type="file" className="hidden" accept="audio/*" onChange={handleFileInput} />
      <input
        ref={docInputRef}
        type="file"
        className="hidden"
        accept="application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.csv,.rtf"
        onChange={handleFileInput}
      />
      <input
        ref={cameraInputRef}
        type="file"
        className="hidden"
        accept="image/*,video/*"
        capture="environment"
        onChange={handleFileInput}
        data-testid="chat-camera-input"
      />

      <div className="flex items-end gap-2 px-2 sm:px-3 pb-2">
        {!voiceRecording && (
        <div className="flex flex-1 min-w-0 items-end gap-0 rounded-[26px] border border-gray-200/90 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900 px-1 py-1">
          <EmojiTriggerButton
            active={emojiOpen}
            disabled={disabled}
            onClick={() => setEmoji(!emojiOpen)}
          />
          <textarea
            ref={composerRef}
            value={text}
            onChange={(e) => {
              onTextChange(e.target.value);
              onTyping?.(e.target.value);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => {
              setEmoji(false);
              onComposerFocus?.();
            }}
            onBlur={onComposerBlur}
            placeholder="Message"
            rows={1}
            data-testid="chat-input"
            disabled={disabled}
            className="flex-1 min-w-0 max-h-32 min-h-[40px] resize-none border-0 bg-transparent py-2.5 px-1 text-[15px] leading-snug text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-0"
            enterKeyHint="send"
            autoComplete="off"
          />
          <Popover open={attachOpen} onOpenChange={setAttachOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                className="h-10 w-10 shrink-0 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center touch-manipulation"
                data-testid="chat-attach-btn"
                aria-label="Attach"
              >
                <IconAttach className="h-[22px] w-[22px]" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" sideOffset={10} className="w-64 p-2 rounded-2xl" data-testid="chat-attach-menu">
              <button type="button" onClick={() => void openPicker("photo")} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-gray-100 dark:hover:bg-gray-800" data-testid="chat-attach-photos">
                <span className="h-9 w-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center"><ImageIcon className="h-4 w-4" /></span>
                <span className="text-sm font-medium">Photos</span>
              </button>
              <button type="button" onClick={() => void openPicker("video")} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-gray-100 dark:hover:bg-gray-800" data-testid="chat-attach-videos">
                <span className="h-9 w-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center"><VideoIcon className="h-4 w-4" /></span>
                <span className="text-sm font-medium">Videos</span>
              </button>
              <button type="button" onClick={() => void openPicker("document")} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-gray-100 dark:hover:bg-gray-800" data-testid="chat-attach-documents">
                <span className="h-9 w-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center"><FileText className="h-4 w-4" /></span>
                <span className="text-sm font-medium">Documents</span>
              </button>
              <button type="button" onClick={() => void openPicker("audio")} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-gray-100 dark:hover:bg-gray-800" data-testid="chat-attach-audio">
                <span className="h-9 w-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center"><Music className="h-4 w-4" /></span>
                <span className="text-sm font-medium">Audio</span>
              </button>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void handleCamera()}
            className="h-10 w-10 shrink-0 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center touch-manipulation"
            data-testid="chat-camera-btn"
            aria-label="Camera"
          >
            <IconCamera className="h-[22px] w-[22px]" />
          </button>
        </div>
        )}

        {hasText && !voiceRecording ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onSendText}
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(e) => e.preventDefault()}
            className="h-12 w-12 shrink-0 rounded-full flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white shadow-md touch-manipulation transition-transform duration-200 active:scale-95"
            data-testid="chat-send-btn"
            aria-label="Send"
          >
            <IconSend className="h-5 w-5" />
          </button>
        ) : (
          <div className={voiceRecording ? "flex-1 w-full min-w-0" : "shrink-0"}>
            <VoiceRecorder
              key="chat-voice-recorder"
              onSend={onSendVoice}
              onRecordingChange={handleVoiceRecordingChange}
              disabled={disabled}
              fabOnly={!voiceRecording}
              fullWidth={voiceRecording}
            />
          </div>
        )}
      </div>

      <EmojiPickerPanel
        open={emojiOpen}
        onPick={insertEmoji}
        onClose={() => setEmoji(false)}
      />
    </div>
  );
}
