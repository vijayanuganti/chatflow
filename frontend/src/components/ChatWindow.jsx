import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Camera,
  Send,
  Loader2,
  Eye,
  ArrowLeft,
  Users,
  Stethoscope,
  UtensilsCrossed,
  Image as ImageIcon,
  Video as VideoIcon,
  FileText,
  Music,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { api, formatApiError } from "@/lib/api";
import {
  isCapacitorNativeApp,
  capturePhotoFileForUpload,
  pickGalleryPhotoFileForUpload,
} from "@/lib/nativeMedia";
import EmojiPickerPopover from "./EmojiPickerPopover";
import ImageLightbox from "./ImageLightbox";
import { formatWhatsAppLastSeen } from "@/lib/datetime";
import { useAuth } from "@/context/AuthContext";
import Avatar from "./Avatar";
import MessageBubble from "./MessageBubble";
import DietPlanDialog from "./DietPlanDialog";
import { medicalPath } from "@/lib/appRoutes";
import VoiceRecorder from "./VoiceRecorder";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { setActiveChatState, clearActiveChatState } from "@/lib/activeChatState";
import { ChatFlowNative } from "@/lib/nativeAuthSync";

export default function ChatWindow({
  conversation,
  messages,
  onSendMessage,
  typingUsers, // Map of userId -> name for users currently typing (excluding self)
  onlineUsers,
  lastSeenByUser = {},
  usersMap,     // map id -> user (for admin view & group)
  sendTyping,
  readOnly = false,
  onBack,
  /** When true (e.g. admin full-screen chat with TopBar hidden), reserve space under the OS status bar. */
  statusBarInset = false,
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const scrollRef = useRef(null);
  const composerRef = useRef(null);
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const docInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastTypingPingRef = useRef(0);
  const [dietOpen, setDietOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const cameraInputRef = useRef(null);

  // Sync active thread to chatflow_native_prefs immediately (before FCM can fire).
  useLayoutEffect(() => {
    const convId = conversation?.id;
    if (!convId) {
      void clearActiveChatState();
      return undefined;
    }
    void setActiveChatState(String(convId));
    if (Capacitor.isNativePlatform()) {
      void ChatFlowNative.setAppForeground({ foreground: true }).catch(() => {});
    }
    return () => {
      void clearActiveChatState();
    };
  }, [conversation?.id]);

  /* Only show messages that actually belong to the currently-open
     conversation. Without this, switching from chat A → chat B briefly
     renders chat A's messages with chat B's header (because the parent
     refetches asynchronously), which is what made some chats open in the
     middle of an older thread. */
  const visibleMessages = useMemo(
    () => (messages || []).filter(
      (m) => !conversation?.id || m.conversation_id === conversation.id,
    ),
    [messages, conversation?.id],
  );

  /* Track whether the user is "near the bottom" so we only auto-scroll when
     it would feel natural. If they've scrolled up to read history we leave
     them alone. */
  const stickToBottomRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = dist < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  /* Helper: pin the scroll container to the bottom across multiple frames.
     One write isn't enough on slow phones because images/videos finish
     laying out a beat after React commits, which would otherwise leave the
     user mid-conversation. */
  const pinToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => {
      const e2 = scrollRef.current;
      if (e2) e2.scrollTop = e2.scrollHeight;
      requestAnimationFrame(() => {
        const e3 = scrollRef.current;
        if (e3) e3.scrollTop = e3.scrollHeight;
      });
    });
  }, []);

  /* When the open conversation changes, jump straight to the latest message
     (no smooth scroll). useLayoutEffect runs before paint so the user never
     glimpses the middle of the thread. */
  useLayoutEffect(() => {
    stickToBottomRef.current = true;
    pinToBottom();
  }, [conversation?.id, pinToBottom]);

  /* Once the new conversation's messages arrive, do a settle-pass to make
     sure the latest bubble is fully in view even if the previous render
     beat the data. We do this whenever the visible-messages count changes
     so newly-arrived messages also keep the user at the bottom (when
     anchored). */
  useEffect(() => {
    if (stickToBottomRef.current) pinToBottom();
  }, [visibleMessages.length, typingUsers, pinToBottom]);

  /* After the very last layout pass for the current conversation, force one
     more pin on a short timer to defeat images that finish loading slightly
     later. Cheap and bounded. */
  useEffect(() => {
    if (!conversation?.id) return undefined;
    const timeouts = [80, 250, 700].map((ms) => setTimeout(() => {
      if (stickToBottomRef.current) pinToBottom();
    }, ms));
    return () => timeouts.forEach(clearTimeout);
  }, [conversation?.id, visibleMessages.length, pinToBottom]);

  /* Images / videos / audio in the thread grow the scroll height once they
     finish loading. If the user is still at the bottom we keep them pinned;
     this is the WhatsApp behaviour where late-loading media doesn't strand
     you mid-conversation. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const reanchor = () => {
      if (stickToBottomRef.current && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };
    el.addEventListener("load", reanchor, true);
    el.addEventListener("loadedmetadata", reanchor, true);
    return () => {
      el.removeEventListener("load", reanchor, true);
      el.removeEventListener("loadedmetadata", reanchor, true);
    };
  }, []);

  useEffect(() => {
    lastTypingPingRef.current = 0;
    setComposerFocused(false);
  }, [conversation?.id]);

  /* Keep typing=true refreshed while the composer is focused (mobile WS / idle gaps). */
  useEffect(() => {
    if (readOnly || !conversation?.id || !sendTyping || !text.trim() || !composerFocused) {
      return undefined;
    }
    sendTyping(conversation.id, true);
    const id = setInterval(() => {
      sendTyping(conversation.id, true);
    }, 2200);
    return () => clearInterval(id);
  }, [text, conversation?.id, readOnly, sendTyping, composerFocused]);

  const flushTypingStop = () => {
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = null;
    if (conversation?.id && sendTyping) sendTyping(conversation.id, false);
    lastTypingPingRef.current = 0;
  };

  const handleTyping = (value) => {
    setText(value);
    if (readOnly || !conversation || !sendTyping) return;
    clearTimeout(typingTimeoutRef.current);
    if (!value.trim()) {
      flushTypingStop();
      return;
    }
    const now = Date.now();
    const elapsed = lastTypingPingRef.current === 0 ? 9999 : now - lastTypingPingRef.current;
    if (elapsed > 350) {
      sendTyping(conversation.id, true);
      lastTypingPingRef.current = now;
    }
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(conversation.id, false);
      lastTypingPingRef.current = 0;
    }, 2800);
  };

  const handleSendText = () => {
    const value = text.trim();
    if (!value || !conversation) return;
    // Fire-and-forget: the parent (ChatApp) renders an optimistic bubble
    // immediately. We never block the composer waiting for the server.
    onSendMessage({
      conversation_id: conversation.id,
      content: value,
      message_type: "text",
    });
    setText("");
    flushTypingStop();
    // Keep the keyboard open after send (WhatsApp-style). Refocus on the
    // next frame so the click that triggered us has fully settled — without
    // this Android Chrome occasionally hides the keyboard between the
    // button activation and the textarea re-render.
    requestAnimationFrame(() => {
      const el = composerRef.current;
      if (el && document.activeElement !== el) {
        try {
          el.focus({ preventScroll: true });
        } catch {
          el.focus();
        }
      }
    });
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const uploadAttachmentFile = useCallback(async (file, inputEl) => {
    if (!file || !conversation) {
      if (inputEl) inputEl.value = "";
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post("/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onSendMessage({
        conversation_id: conversation.id,
        content: "",
        message_type: res.data.message_type,
        file_url: res.data.file_url,
        file_name: res.data.file_name,
      });
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploading(false);
      if (inputEl) inputEl.value = "";
    }
  }, [conversation, onSendMessage]);

  const handleFile = async (e) => {
    const inputEl = e.target;
    const file = inputEl?.files?.[0];
    await uploadAttachmentFile(file, inputEl);
  };

  const insertEmoji = useCallback((emoji) => {
    const el = composerRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${emoji}${text.slice(end)}`;
    setText(next);
    handleTyping(next);
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
  }, [text, handleTyping]);

  const handleCameraCapture = useCallback(async () => {
    if (isCapacitorNativeApp()) {
      try {
        const file = await capturePhotoFileForUpload();
        await uploadAttachmentFile(file, null);
      } catch (err) {
        const msg = (err && (err.message || String(err))) || "";
        if (!/cancel|dismiss|denied|User cancelled/i.test(msg)) {
          toast.error(formatApiError(err) || msg || "Could not open camera");
        }
      }
      return;
    }
    cameraInputRef.current?.click();
  }, [uploadAttachmentFile]);

  const openPicker = useCallback(async (kind) => {
    setAttachOpen(false);
    if (kind === "photo" && isCapacitorNativeApp()) {
      try {
        const file = await pickGalleryPhotoFileForUpload();
        await uploadAttachmentFile(file, null);
      } catch (err) {
        const msg = (err && (err.message || String(err))) || "";
        if (!/cancel|dismiss|denied|User cancelled/i.test(msg)) {
          toast.error(formatApiError(err) || msg || "Could not pick photo");
        }
      }
      return;
    }
    const ref = kind === "photo" ? photoInputRef
      : kind === "video" ? videoInputRef
      : kind === "audio" ? audioInputRef
      : docInputRef;
    ref.current?.click();
  }, [uploadAttachmentFile]);

  const handleVoiceNote = useCallback(async (blob, mime, durationMs) => {
    if (!conversation) return;
    const ext = mime?.includes("ogg") ? "ogg"
      : mime?.includes("mp4") ? "m4a"
      : mime?.includes("mpeg") ? "mp3"
      : "webm";
    const filename = `voice-${Date.now()}.${ext}`;
    const secs = Math.max(1, Math.round((durationMs || 0) / 1000));
    const mm = String(Math.floor(secs / 60)).padStart(1, "0");
    const ss = String(secs % 60).padStart(2, "0");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", new File([blob], filename, { type: mime || "audio/webm" }));
      const res = await api.post("/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onSendMessage({
        conversation_id: conversation.id,
        // Non-empty content keeps the sidebar preview readable ("Voice note (0:12)").
        // MessageBubble suppresses this caption when message_type === "audio"
        // and renders its own player + duration instead.
        content: `🎤 Voice note (${mm}:${ss})`,
        message_type: "audio",
        file_url: res.data.file_url,
        file_name: res.data.file_name || filename,
      });
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploading(false);
    }
  }, [conversation, onSendMessage]);

  if (!conversation) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
        <div className="chat-bg flex min-h-0 flex-1 items-center justify-center" data-testid="no-conversation-placeholder">
          <div className="text-center max-w-sm p-8">
            <div className="mx-auto h-20 w-20 rounded-2xl bg-white dark:bg-gray-900 shadow-sm flex items-center justify-center mb-4 border border-gray-100 dark:border-gray-800">
              <Send className="h-9 w-9 text-emerald-800 dark:text-emerald-300" strokeWidth={1.3} />
            </div>
            <h3 className="font-display text-2xl font-semibold mb-1 dark:text-gray-100">Your conversations</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Select a chat on the left, or start a new one.</p>
          </div>
        </div>
      </div>
    );
  }

  const isGroup = conversation.type === "group";
  const otherUser = isGroup ? null : conversation.other_user;
  const isOnline = otherUser ? !!onlineUsers[otherUser.id] : false;

  // Header
  const headerName = isGroup ? conversation.name : otherUser?.full_name;
  const typingArr = Object.entries(typingUsers || {}).filter(([uid]) => uid !== user.id);
  const othersTypingCount = typingArr.length;
  const groupTypingLabel = othersTypingCount === 1
    ? `${typingArr[0][1]} is typing`
    : othersTypingCount > 1
      ? `${typingArr.map(([, n]) => n).join(", ")} are typing`
      : null;

  const directTypingName = othersTypingCount > 0 && !isGroup ? (typingArr[0][1] || "Someone") : null;

  const headerStatusLine = (() => {
    if (readOnly && !othersTypingCount) return { kind: "text", value: "Admin read-only view" };
    if (othersTypingCount > 0 && isGroup) return { kind: "text", value: groupTypingLabel };
    if (othersTypingCount > 0 && !isGroup) return { kind: "typing", label: directTypingName };
    if (readOnly) return { kind: "text", value: "Admin read-only view" };
    if (isGroup) return { kind: "text", value: `${conversation.participants.length} members` };
    if (isOnline) return { kind: "text", value: "online" };
    const lsIso = (otherUser?.id && lastSeenByUser[otherUser.id]) || otherUser?.last_seen;
    const lsText = formatWhatsAppLastSeen(lsIso);
    if (lsText) return { kind: "text", value: lsText };
    return { kind: "text", value: "offline" };
  })();

  // For read-receipts in groups
  const totalRecipients = isGroup ? (conversation.participants?.length || 1) - 1 : 1;
  const showSenderNames = isGroup || readOnly;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-gray-50 dark:bg-gray-950" data-testid="chat-window">
      {/* Header: optional status-bar spacer when this window is the top chrome (admin mobile chat). */}
      <div className="z-10 flex shrink-0 flex-col border-b border-gray-200 bg-white/90 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/80">
        {statusBarInset ? (
          <div
            className="w-full shrink-0 bg-white/90 dark:bg-gray-950/80"
            style={{ minHeight: "max(env(safe-area-inset-top, 0px), 36px)" }}
            aria-hidden
          />
        ) : null}
        <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5 md:py-2.5">
        {onBack && (
          <Button size="icon" variant="ghost" className="md:hidden rounded-full" onClick={onBack} data-testid="chat-back-btn">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        {isGroup ? (
          <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-900 flex items-center justify-center">
            <Users className="h-5 w-5" strokeWidth={1.5} />
          </div>
        ) : (
          <Avatar name={otherUser?.full_name} avatarUrl={otherUser?.avatar_url} online={isOnline} status={otherUser?.status} size={42} />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold text-sm sm:text-base truncate flex items-center gap-2 dark:text-gray-100" data-testid="chat-header-name">
            {headerName}
            {readOnly && (
              <span className="inline-flex items-center gap-1 text-[10px] tracking-[0.2em] uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                <Eye className="h-3 w-3" /> Monitor
              </span>
            )}
            {isGroup && (
              <span className="inline-flex items-center gap-1 text-[10px] tracking-[0.2em] uppercase bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full">
                <Users className="h-3 w-3" /> Group
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 truncate min-h-[1rem] flex items-center gap-1">
            {headerStatusLine.kind === "typing" ? (
              <span className="inline-flex items-center gap-1 text-emerald-800/90" data-testid="header-typing">
                <span>{headerStatusLine.label || "Someone"} is typing</span>
                <span className="inline-flex items-center gap-0.5 translate-y-px">
                  <span className="typing-dot typing-dot-header" />
                  <span className="typing-dot typing-dot-header" />
                  <span className="typing-dot typing-dot-header" />
                </span>
              </span>
            ) : (
              <span className={othersTypingCount > 0 && isGroup ? "text-emerald-800/90" : undefined}>{headerStatusLine.value}</span>
            )}
          </div>
        </div>

        {/* Medical profile shortcut — visible to admins and the assigned employee
            when chatting with a client. Backend enforces the actual ACL. */}
        {!isGroup && otherUser?.role === "client" && (user?.role === "admin" || user?.role === "employee") && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full hidden sm:inline-flex"
              onClick={() => navigate(medicalPath(user?.role, otherUser.id))}
              data-testid="chat-header-medical-btn"
              title="View medical profile"
            >
              <Stethoscope className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden md:inline">Medical</span>
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="rounded-full sm:hidden"
              onClick={() => navigate(medicalPath(user?.role, otherUser.id))}
              data-testid="chat-header-medical-btn-mobile"
              title="View medical profile"
            >
              <Stethoscope className="h-4 w-4" />
            </Button>
          </>
        )}

        {/* Diet plan shortcut.
            - Admin / employee chatting with a client → opens that client's plan.
            - Client chatting with an employee → opens their own plan. */}
        {!isGroup && (
          (otherUser?.role === "client" && (user?.role === "admin" || user?.role === "employee"))
          || (user?.role === "client" && otherUser?.role === "employee")
        ) && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full hidden sm:inline-flex"
              onClick={() => setDietOpen(true)}
              data-testid="chat-header-diet-btn"
              title="Diet plan"
            >
              <UtensilsCrossed className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden md:inline">Diet</span>
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="rounded-full sm:hidden"
              onClick={() => setDietOpen(true)}
              data-testid="chat-header-diet-btn-mobile"
              title="Diet plan"
            >
              <UtensilsCrossed className="h-4 w-4" />
            </Button>
          </>
        )}
        </div>
      </div>

      {!isGroup && (
        (otherUser?.role === "client" && (user?.role === "admin" || user?.role === "employee"))
        || (user?.role === "client" && otherUser?.role === "employee")
      ) && (
        <DietPlanDialog
          open={dietOpen}
          onOpenChange={setDietOpen}
          client={user?.role === "client" ? user : otherUser}
        />
      )}

      {/* Messages */}
      <div ref={scrollRef} className="chat-bg min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-4 sm:py-5" data-testid="messages-container">
        {visibleMessages.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-10" data-testid="empty-messages">
            No messages yet. {readOnly ? "Conversation is quiet." : "Say hi!"}
          </div>
        )}
        {visibleMessages.map((m) => {
          // In admin read-only view, we still show messages aligned by sender:
          // a fixed "left" participant and "right" participant based on ordering
          let mine;
          if (readOnly && !isGroup) {
            const p = conversation.participants || [];
            mine = m.sender_id === p[p.length - 1]; // last participant is "right" side
          } else if (readOnly && isGroup) {
            // Anchor by sender: admin sees all alternating — put "current user in convo" right by sender hashing? simpler: all left except creator
            mine = m.sender_id === conversation.created_by;
          } else {
            mine = m.sender_id === user.id;
          }
          return (
            <MessageBubble
              key={m.__tempId || m.id}
              message={m}
              mine={mine}
              showSenderName={showSenderNames}
              totalRecipients={totalRecipients}
              showReceipts={!readOnly}
              onImageClick={(src, alt) => setLightbox({ src, alt })}
            />
          );
        })}
      </div>

      <ImageLightbox
        open={!!lightbox?.src}
        src={lightbox?.src}
        alt={lightbox?.alt}
        onClose={() => setLightbox(null)}
      />

      {/* Input — WhatsApp-style: emoji | text | attach (+) | camera | send/mic */}
      {!readOnly && (
        <div className="relative z-10 shrink-0 border-t border-gray-200 bg-white pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-2 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] dark:border-gray-800 dark:bg-gray-950 dark:shadow-[0_-4px_16px_rgba(0,0,0,0.35)] sm:pb-3 sm:pt-3">
          <div className="flex items-end gap-1 px-2 sm:gap-1.5 sm:px-3">
            <input
              ref={cameraInputRef}
              type="file"
              className="hidden"
              onChange={handleFile}
              data-testid="chat-camera-input"
              accept="image/*"
              capture="environment"
            />
            <input
              ref={photoInputRef}
              type="file"
              className="hidden"
              onChange={handleFile}
              data-testid="chat-file-input-photo"
              accept="image/*"
            />
            <input
              ref={videoInputRef}
              type="file"
              className="hidden"
              onChange={handleFile}
              data-testid="chat-file-input-video"
              accept="video/*"
            />
            <input
              ref={audioInputRef}
              type="file"
              className="hidden"
              onChange={handleFile}
              data-testid="chat-file-input-audio"
              accept="audio/*"
            />
            <input
              ref={docInputRef}
              type="file"
              className="hidden"
              onChange={handleFile}
              data-testid="chat-file-input-doc"
              accept="application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.csv,.rtf"
            />
            {/* Composer chrome (paperclip + textarea + send) is hidden while
                a voice note is being recorded — the VoiceRecorder takes over
                the row and renders its own recording strip. */}
            {!recording && (
              <>
                <EmojiPickerPopover disabled={uploading} onPick={insertEmoji} />
                <Textarea
                  ref={composerRef}
                  value={text}
                  onChange={(e) => handleTyping(e.target.value)}
                  onKeyDown={handleKey}
                  onBlur={() => {
                    setComposerFocused(false);
                    flushTypingStop();
                  }}
                  onFocus={() => {
                    setComposerFocused(true);
                    if (readOnly || !conversation?.id || !sendTyping || !text.trim()) return;
                    sendTyping(conversation.id, true);
                  }}
                  placeholder="Type a message"
                  rows={1}
                  data-testid="chat-input"
                  className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 dark:text-gray-100 mx-0.5"
                  enterKeyHint="send"
                  autoComplete="off"
                />
                <Popover open={attachOpen} onOpenChange={setAttachOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0 rounded-full text-gray-500 hover:text-emerald-900 dark:hover:text-emerald-300"
                      disabled={uploading}
                      data-testid="chat-attach-btn"
                      title="Attach"
                      aria-label="Attach"
                    >
                      {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" strokeWidth={1.5} />}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="start"
                    sideOffset={10}
                    className="w-64 p-2 rounded-2xl"
                    data-testid="chat-attach-menu"
                  >
                    <button
                      type="button"
                      onClick={() => void openPicker("photo")}
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                      data-testid="chat-attach-photos"
                    >
                      <span className="h-9 w-9 rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 flex items-center justify-center">
                        <ImageIcon className="h-4 w-4" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium dark:text-gray-100">Photos</span>
                        <span className="block text-[11px] text-gray-500 dark:text-gray-400">JPEG, PNG, GIF, WebP</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void openPicker("video")}
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                      data-testid="chat-attach-videos"
                    >
                      <span className="h-9 w-9 rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300 flex items-center justify-center">
                        <VideoIcon className="h-4 w-4" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium dark:text-gray-100">Videos</span>
                        <span className="block text-[11px] text-gray-500 dark:text-gray-400">MP4, MOV, WebM</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void openPicker("document")}
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                      data-testid="chat-attach-documents"
                    >
                      <span className="h-9 w-9 rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300 flex items-center justify-center">
                        <FileText className="h-4 w-4" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium dark:text-gray-100">Documents</span>
                        <span className="block text-[11px] text-gray-500 dark:text-gray-400">PDF, Word, Excel, PPT, ZIP</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void openPicker("audio")}
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                      data-testid="chat-attach-audio"
                    >
                      <span className="h-9 w-9 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 flex items-center justify-center">
                        <Music className="h-4 w-4" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium dark:text-gray-100">Audio</span>
                        <span className="block text-[11px] text-gray-500 dark:text-gray-400">MP3, M4A, WAV, OGG</span>
                      </span>
                    </button>
                  </PopoverContent>
                </Popover>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="shrink-0 rounded-full text-gray-500 hover:text-emerald-900 dark:hover:text-emerald-300"
                  disabled={uploading}
                  onClick={() => void handleCameraCapture()}
                  data-testid="chat-camera-btn"
                  title="Camera"
                  aria-label="Camera"
                >
                  <Camera className="h-5 w-5" strokeWidth={1.5} />
                </Button>
              </>
            )}
            {/* When the textarea has content, show the Send button instead of
                the mic. The VoiceRecorder is always mounted (so its state and
                the underlying MediaRecorder stay alive across re-renders); we
                just hide it when there's text waiting to be sent. */}
            {!recording && text.trim() ? (
              <Button
                size="icon"
                type="button"
                onClick={handleSendText}
                // Don't steal focus from the composer when the user taps
                // Send — that's what was dismissing the keyboard after each
                // message. Preventing the default mousedown / pointerdown
                // keeps the textarea focused, so the keyboard stays open
                // exactly like WhatsApp.
                onMouseDown={(e) => e.preventDefault()}
                onPointerDown={(e) => e.preventDefault()}
                data-testid="chat-send-btn"
                className="h-10 w-10 rounded-full bg-emerald-900 hover:bg-emerald-950"
                title="Send"
              >
                <Send className="h-4 w-4" />
              </Button>
            ) : null}
            <div className={!recording && text.trim() ? "hidden" : "contents"}>
              <VoiceRecorder
                onSend={handleVoiceNote}
                onRecordingChange={setRecording}
                disabled={uploading}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
