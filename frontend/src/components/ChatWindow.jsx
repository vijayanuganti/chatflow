import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Send,
  Eye,
  ArrowLeft,
  Users,
  Stethoscope,
  UtensilsCrossed,
  ChevronDown,
  Search,
  Star,
  X,
} from "lucide-react";
import { groupMessagesByDate } from "@/lib/chatDateGroups";
import { sortMessagesChronologically } from "@/lib/optimisticMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getStarredIds,
  toggleStarredMessage,
  isMessageStarred,
} from "@/lib/starredMessages";
import { formatApiError } from "@/lib/api";
import { inferMessageTypeFromFile, createVideoPosterFromFile } from "@/lib/chatMedia";
import { uploadChatFile } from "@/lib/chatUpload";
import ChatComposer from "./chat/ChatComposer";
import ImageLightbox from "./ImageLightbox";
import { formatWhatsAppLastSeen } from "@/lib/datetime";
import { useAuth } from "@/context/AuthContext";
import Avatar from "./Avatar";
import MessageBubble from "./MessageBubble";
import {
  adminChatTabBackTo,
  buildPendingChatState,
  dietPlanPath,
  medicalPath,
  panelBase,
  userProfilePath,
} from "@/lib/appRoutes";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { setActiveChatState, clearActiveChatState } from "@/lib/activeChatState";
import { ChatFlowNative } from "@/lib/nativeAuthSync";

export default function ChatWindow({
  conversation,
  messages,
  onSendMessage,
  onPatchMessage,
  typingUsers, // Map of userId -> name for users currently typing (excluding self)
  onlineUsers,
  lastSeenByUser = {},
  usersMap,     // map id -> user (for admin view & group)
  sendTyping,
  readOnly = false,
  onBack,
  /** Base path for profile / diet / medical back navigation (e.g. /chat, /admin/mychats). */
  chatBackTo,
  /** Admin tab when embedded in AdminDashboard (chats | mychats | batches). */
  adminChatTab = null,
  /** When true (e.g. admin full-screen chat with TopBar hidden), reserve space under the OS status bar. */
  statusBarInset = false,
}) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const resolvedBackTo =
    chatBackTo ??
    (user?.role === "admin" && adminChatTab
      ? adminChatTabBackTo(adminChatTab)
      : panelBase(user?.role));

  const subPageState = (extra = {}) => {
    const pendingChat =
      adminChatTab && conversation?.id
        ? buildPendingChatState({ tab: adminChatTab, conversation })
        : undefined;
    return {
      backTo: resolvedBackTo,
      ...(pendingChat ? { pendingChat } : {}),
      ...extra,
    };
  };
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [threadSearchQuery, setThreadSearchQuery] = useState("");
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [starredIds, setStarredIds] = useState(() => getStarredIds(user?.id));
  const [text, setText] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [emojiPanelOpen, setEmojiPanelOpen] = useState(false);
  const scrollRef = useRef(null);
  const composerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastTypingPingRef = useRef(0);
  const [lightbox, setLightbox] = useState(null);
  const blobUrlsRef = useRef(new Set());

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
     conversation. Without this, switching from chat A â†’ chat B briefly
     renders chat A's messages with chat B's header (because the parent
     refetches asynchronously), which is what made some chats open in the
     middle of an older thread. */
  const visibleMessages = useMemo(() => {
    const filtered = (messages || []).filter(
      (m) => !conversation?.id || m.conversation_id === conversation.id,
    );
    return sortMessagesChronologically(filtered);
  }, [messages, conversation?.id]);

  /* Track whether the user is "near the bottom" so we only auto-scroll when
     it would feel natural. If they've scrolled up to read history we leave
     them alone. */
  const stickToBottomRef = useRef(true);
  const [showScrollDown, setShowScrollDown] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = dist < 80;
      setShowScrollDown(dist >= 80);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (stickToBottomRef.current) setShowScrollDown(false);
  }, [conversation?.id, visibleMessages.length]);

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
    setThreadSearchOpen(false);
    setThreadSearchQuery("");
    setSelectedMessage(null);
  }, [conversation?.id]);

  useEffect(() => {
    if (user?.id) setStarredIds(getStarredIds(user.id));
  }, [user?.id]);

  const refreshStarred = useCallback(() => {
    if (user?.id) setStarredIds(getStarredIds(user.id));
  }, [user?.id]);

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
    // next frame so the click that triggered us has fully settled - without
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

  const sendMediaFile = useCallback(async (file) => {
    if (!file || !conversation || !onSendMessage) return;
    const localUrl = URL.createObjectURL(file);
    blobUrlsRef.current.add(localUrl);
    const messageType = inferMessageTypeFromFile(file);
    let videoPoster = null;
    if (messageType === "video") {
      videoPoster = await createVideoPosterFromFile(file);
    }

    setUploading(true);
    const tempId = onSendMessage(
      {
        conversation_id: conversation.id,
        content: "",
        message_type: messageType,
        file_url: localUrl,
        file_name: file.name,
      },
      {
        deferPost: true,
        extraFields: {
          __localPreview: localUrl,
          __uploadProgress: 0,
          __videoPoster: videoPoster,
          __mimeType: file.type,
          file_size: file.size,
        },
      },
    );

    try {
      const uploaded = await uploadChatFile(file, {
        onProgress: (pct) => onPatchMessage?.(tempId, { __uploadProgress: pct }),
      });
      if (blobUrlsRef.current.has(localUrl)) {
        URL.revokeObjectURL(localUrl);
        blobUrlsRef.current.delete(localUrl);
      }
      onPatchMessage?.(tempId, {
        file_url: uploaded.file_url,
        __uploadProgress: 100,
      });
      onSendMessage(
        {
          conversation_id: conversation.id,
          content: "",
          message_type: uploaded.message_type,
          file_url: uploaded.file_url,
          file_name: uploaded.file_name || file.name,
        },
        { tempId, skipOptimistic: true },
      );
    } catch (err) {
      toast.error(formatApiError(err));
      onPatchMessage?.(tempId, { __pending: false, __error: true, __uploadProgress: undefined });
    } finally {
      setUploading(false);
    }
  }, [conversation, onSendMessage, onPatchMessage]);

  const handleVoiceNote = useCallback(async (blob, mime, durationMs) => {
    if (!conversation || !onSendMessage) return;
    const ext = mime?.includes("ogg") ? "ogg"
      : mime?.includes("mp4") ? "m4a"
      : mime?.includes("mpeg") ? "mp3"
      : "webm";
    const filename = `voice-${Date.now()}.${ext}`;
    const secs = Math.max(1, Math.round((durationMs || 0) / 1000));
    const mm = String(Math.floor(secs / 60)).padStart(1, "0");
    const ss = String(secs % 60).padStart(2, "0");
    const localUrl = URL.createObjectURL(blob);
    blobUrlsRef.current.add(localUrl);
    const caption = `ðŸŽ¤ Voice note (${mm}:${ss})`;

    setUploading(true);
    const tempId = onSendMessage(
      {
        conversation_id: conversation.id,
        content: caption,
        message_type: "audio",
        file_url: localUrl,
        file_name: filename,
      },
      {
        deferPost: true,
        extraFields: { __uploadProgress: 0 },
      },
    );

    try {
      const uploaded = await uploadChatFile(new File([blob], filename, { type: mime || "audio/webm" }), {
        onProgress: (pct) => onPatchMessage?.(tempId, { __uploadProgress: pct }),
      });
      URL.revokeObjectURL(localUrl);
      blobUrlsRef.current.delete(localUrl);
      onPatchMessage?.(tempId, { file_url: uploaded.file_url, __uploadProgress: 100 });
      onSendMessage(
        {
          conversation_id: conversation.id,
          content: caption,
          message_type: "audio",
          file_url: uploaded.file_url,
          file_name: uploaded.file_name || filename,
        },
        { tempId, skipOptimistic: true },
      );
    } catch (err) {
      toast.error(formatApiError(err));
      onPatchMessage?.(tempId, { __pending: false, __error: true });
    } finally {
      setUploading(false);
    }
  }, [conversation, onSendMessage, onPatchMessage]);

  useEffect(() => () => {
    blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    blobUrlsRef.current.clear();
  }, []);

  const messageGroups = useMemo(() => groupMessagesByDate(visibleMessages), [visibleMessages]);

  const filteredMessageGroups = useMemo(() => {
    const q = threadSearchQuery.trim().toLowerCase();
    if (!q) return messageGroups;
    return messageGroups.filter((item) => {
      if (item.type === "divider") return true;
      const content = (item.message?.content || "").toLowerCase();
      const fname = (item.message?.file_name || "").toLowerCase();
      return content.includes(q) || fname.includes(q);
    });
  }, [messageGroups, threadSearchQuery]);

  const scrollToLatest = useCallback(() => {
    stickToBottomRef.current = true;
    setShowScrollDown(false);
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    requestAnimationFrame(() => pinToBottom());
  }, [pinToBottom]);

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

  const headerStatusLine = (() => {
    if (readOnly && !othersTypingCount) return { kind: "text", value: "Admin read-only view" };
    if (othersTypingCount > 0) return { kind: "typing" };
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

  const openContactProfile = () => {
    if (!conversation || isGroup || !otherUser?.id) return;
    navigate(userProfilePath(user?.role, otherUser.id), {
      state: {
        ...subPageState(),
        conversationId: conversation.id,
        profile: otherUser,
        isMuted: !!conversation.is_muted,
      },
    });
  };

  const toggleStarSelected = () => {
    if (!selectedMessage?.id || !user?.id) return;
    const nowStarred = toggleStarredMessage(user.id, selectedMessage.id);
    refreshStarred();
    setSelectedMessage(null);
    toast.success(nowStarred ? "Message starred" : "Star removed");
  };

  const openDietPlan = () => {
    const dietClient =
      user?.role === "client"
        ? { id: user.id, full_name: user.full_name }
        : { id: otherUser?.id, full_name: otherUser?.full_name };
    const path =
      user?.role === "client"
        ? dietPlanPath(user.role)
        : dietPlanPath(user?.role, otherUser?.id);
    navigate(path, { state: subPageState({ client: dietClient }) });
  };

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
        {selectedMessage && !readOnly ? (
          <>
            <Button size="icon" variant="ghost" className="rounded-full" onClick={() => setSelectedMessage(null)} data-testid="message-selection-clear">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <span className="flex-1 text-sm font-medium dark:text-gray-100">1 selected</span>
            <Button size="icon" variant="ghost" className="rounded-full text-amber-600" onClick={toggleStarSelected} data-testid="message-selection-star">
              <Star className={`h-5 w-5 ${starredIds.has(String(selectedMessage.id)) ? "fill-amber-500" : ""}`} />
            </Button>
          </>
        ) : (
          <>
        {onBack && (
          <Button size="icon" variant="ghost" className="md:hidden rounded-full" onClick={onBack} data-testid="chat-back-btn">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <button
          type="button"
          onClick={!isGroup && otherUser ? openContactProfile : undefined}
          className="flex flex-1 min-w-0 items-center gap-2 text-left touch-manipulation"
          disabled={isGroup || !otherUser}
          data-testid="chat-header-profile-link"
        >
        {isGroup ? (
          <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-900 flex items-center justify-center shrink-0">
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
                <span>typing...</span>
                <span className="inline-flex items-center gap-0.5 translate-y-px">
                  <span className="typing-dot typing-dot-header" />
                  <span className="typing-dot typing-dot-header" />
                  <span className="typing-dot typing-dot-header" />
                </span>
              </span>
            ) : (
              <span>{headerStatusLine.value}</span>
            )}
          </div>
        </div>
        </button>
        <Button size="icon" variant="ghost" className="rounded-full shrink-0" onClick={() => setThreadSearchOpen((v) => !v)} data-testid="chat-thread-search-toggle" title="Search in chat">
          <Search className="h-5 w-5" />
        </Button>

        {/* Medical profile shortcut - visible to admins and the assigned employee
            when chatting with a client. Backend enforces the actual ACL. */}
        {!isGroup && otherUser?.role === "client" && (user?.role === "admin" || user?.role === "employee") && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full hidden sm:inline-flex"
              onClick={() =>
                navigate(medicalPath(user?.role, otherUser.id), { state: subPageState() })
              }
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
              onClick={() =>
                navigate(medicalPath(user?.role, otherUser.id), { state: subPageState() })
              }
              data-testid="chat-header-medical-btn-mobile"
              title="View medical profile"
            >
              <Stethoscope className="h-4 w-4" />
            </Button>
          </>
        )}

        {/* Diet plan shortcut.
            - Admin / employee chatting with a client â†’ opens that client's plan.
            - Client chatting with an employee â†’ opens their own plan. */}
        {!isGroup && (
          (otherUser?.role === "client" && (user?.role === "admin" || user?.role === "employee"))
          || (user?.role === "client" && otherUser?.role === "employee")
        ) && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full hidden sm:inline-flex"
              onClick={openDietPlan}
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
              onClick={openDietPlan}
              data-testid="chat-header-diet-btn-mobile"
              title="Diet plan"
            >
              <UtensilsCrossed className="h-4 w-4" />
            </Button>
          </>
        )}
          </>
        )}
        </div>
        {threadSearchOpen && !selectedMessage && (
          <div className="px-3 pb-2 flex items-center gap-2 border-t border-gray-100 dark:border-gray-800" data-testid="chat-thread-search-bar">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                value={threadSearchQuery}
                onChange={(e) => setThreadSearchQuery(e.target.value)}
                placeholder="Search in conversation"
                className="pl-9 h-9 rounded-xl"
                data-testid="chat-thread-search-input"
                autoFocus
              />
            </div>
            <Button size="icon" variant="ghost" className="shrink-0 rounded-full" onClick={() => { setThreadSearchOpen(false); setThreadSearchQuery(""); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} className="chat-bg h-full space-y-2 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-4 sm:py-5" data-testid="messages-container">
        {visibleMessages.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-10" data-testid="empty-messages">
            No messages yet. {readOnly ? "Conversation is quiet." : "Say hi!"}
          </div>
        )}
        {filteredMessageGroups.map((item) => {
          if (item.type === "divider") {
            return (
              <div key={item.key} className="flex justify-center py-2" data-testid="message-date-divider">
                <span className="text-[11px] font-medium px-3 py-1 rounded-full bg-white/90 dark:bg-gray-900/90 text-gray-600 dark:text-gray-300 shadow-sm border border-gray-200/80 dark:border-gray-700/80">
                  {item.label}
                </span>
              </div>
            );
          }
          const m = item.message;
          let mine;
          if (readOnly && !isGroup) {
            const p = conversation.participants || [];
            mine = m.sender_id === p[p.length - 1];
          } else if (readOnly && isGroup) {
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
              selected={selectedMessage?.id === m.id}
              starred={m.id ? starredIds.has(String(m.id)) : false}
              searchQuery={threadSearchQuery}
              onLongPress={readOnly ? undefined : setSelectedMessage}
              dimmed={!!selectedMessage && selectedMessage?.id !== m.id}
            />
          );
        })}
        </div>
        {showScrollDown && (
          <button
            type="button"
            onClick={scrollToLatest}
            className="absolute bottom-4 right-3 z-10 h-10 w-10 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-lg flex items-center justify-center text-emerald-900 dark:text-emerald-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-transform active:scale-95"
            data-testid="scroll-to-bottom-btn"
            aria-label="Scroll to latest messages"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        )}
      </div>

      <ImageLightbox
        open={!!lightbox?.src}
        src={lightbox?.src}
        alt={lightbox?.alt}
        onClose={() => setLightbox(null)}
      />

      {/* Input - WhatsApp-style: emoji | text | attach (+) | camera | send/mic */}
      {!readOnly && (
        <div className={`relative z-10 shrink-0 flex flex-col border-t border-gray-200 bg-[#f0f2f5] dark:border-gray-800 dark:bg-gray-950 ${emojiPanelOpen ? "pb-0" : "pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]"} pt-2 sm:pt-3`}>
          <ChatComposer
            text={text}
            onTextChange={setText}
            onTyping={handleTyping}
            onSendText={handleSendText}
            onSendFile={sendMediaFile}
            onSendVoice={handleVoiceNote}
            onKeyDown={handleKey}
            onComposerFocus={() => {
              setComposerFocused(true);
              if (!readOnly && conversation?.id && sendTyping && text.trim()) {
                sendTyping(conversation.id, true);
              }
            }}
            onComposerBlur={() => {
              setComposerFocused(false);
              flushTypingStop();
            }}
            composerRef={composerRef}
            disabled={uploading}
            recording={recording}
            onRecordingChange={setRecording}
            onEmojiOpenChange={setEmojiPanelOpen}
          />
        </div>
      )}
    </div>
  );
}
