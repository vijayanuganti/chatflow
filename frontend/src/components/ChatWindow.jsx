import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  X,
  Reply,
  Forward,
  MoreVertical,
  Star,
  Phone,
} from "lucide-react";
import SwipeableMessageRow from "@/components/chat/SwipeableMessageRow";
import ForwardModal from "@/components/chat/ForwardModal";
import { messageReplySnippet } from "@/lib/messageReply";
import { groupMessagesByDate } from "@/lib/chatDateGroups";
import { sortMessagesChronologically } from "@/lib/optimisticMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  editMessageContent,
  starMessage,
  unstarMessage,
  fetchStarredMessages,
} from "@/lib/messageActionsApi";
import { hapticMessageLongPress } from "@/lib/messageActionHaptics";
import MessageContextMenu from "@/components/chat/MessageContextMenu";
import StarredMessagesPanel from "@/components/chat/StarredMessagesPanel";
import { formatApiError } from "@/lib/api";
import { downloadChatMedia } from "@/lib/chatMediaCache";
import { inferMessageTypeFromFile, createVideoPosterFromFile } from "@/lib/chatMedia";
import { uploadChatFile } from "@/lib/chatUpload";
import ChatComposer from "./chat/ChatComposer";
import InAppMediaHost from "@/components/chat/InAppMediaHost";
import { formatWhatsAppLastSeen } from "@/lib/datetime";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { useCall } from "@/context/CallContext";
import { CALL_STATE } from "@/lib/callConstants";
import ChatCallHeader from "@/components/call/ChatCallHeader";
import Avatar from "./Avatar";
import MessageBubble from "./MessageBubble";
import { monitoringBubbleAlignRight } from "@/lib/adminMonitoring";
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
import { fcmGroupKeyForSender } from "@/lib/notificationDisplay";
import { ChatFlowNative } from "@/lib/nativeAuthSync";
import { messageCanEdit } from "@/lib/messageCanEdit";

export default function ChatWindow({
  conversation,
  messages,
  onSendMessage,
  onPatchMessage,
  onUpdateMessage,
  conversations = [],
  typingUsers, // Map of userId -> name for users currently typing (excluding self)
  onlineUsers,
  lastSeenByUser = {},
  usersMap,     // map id -> user (for admin view & group)
  sendTyping,
  readOnly = false,
  onBack,
  /** When true, never show the mobile back arrow (client portal uses footer tabs). */
  hideBackButton = false,
  /** Client portal: no employee assigned — centered empty state, no composer. */
  clientUnassigned = false,
  /** Base path for profile / diet / medical back navigation (e.g. /chat, /admin/mychats). */
  chatBackTo,
  /** Admin tab when embedded in AdminDashboard (chats | mychats | batches). */
  adminChatTab = null,
  /** When true (e.g. admin full-screen chat with TopBar hidden), reserve space under the OS status bar. */
  statusBarInset = false,
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { setActiveConversationId, setChatComposerActive } = useChat();
  const { callState, startCallForChat, isCallActive } = useCall();
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
  const [selectedMessages, setSelectedMessages] = useState([]);
  const isSelectionMode = selectedMessages.length > 0;
  const isSelectionModeActive = useRef(false);
  useEffect(() => {
    isSelectionModeActive.current = isSelectionMode;
  }, [isSelectionMode]);
  const [replyingTo, setReplyingTo] = useState(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardMessages, setForwardMessages] = useState([]);
  const [starredIds, setStarredIds] = useState(() => new Set());
  const [actionMessageId, setActionMessageId] = useState(null);
  const [messageMenuOpen, setMessageMenuOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [showStarredPanel, setShowStarredPanel] = useState(false);
  const [starredList, setStarredList] = useState([]);
  const [starredLoading, setStarredLoading] = useState(false);
  const [flashMessageId, setFlashMessageId] = useState(null);
  const messageMenuAnchorRef = useRef(null);
  const selectionMoreRef = useRef(null);
  const [text, setText] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [emojiPanelOpen, setEmojiPanelOpen] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const active = composerFocused || emojiPanelOpen;
    setChatComposerActive(active);
    return () => setChatComposerActive(false);
  }, [composerFocused, emojiPanelOpen, setChatComposerActive]);
  const composerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastTypingPingRef = useRef(0);
  const [mediaViewer, setMediaViewer] = useState(null);

  const handleOpenInAppMedia = useCallback((payload) => {
    setMediaViewer(payload);
  }, []);

  const handleImageClick = useCallback((message, src, alt) => {
    setMediaViewer({
      kind: "image",
      url: message?.file_url,
      src,
      alt,
      fileName: message?.file_name,
      message: message || null,
      editorToolbar: true,
    });
  }, []);

  const handleMediaViewerSaveSend = useCallback(() => {
    setMediaViewer(null);
    toast.success("Image ready — send from the composer when you're set.");
  }, []);

  const handleMediaViewerDownload = useCallback(async () => {
    if (mediaViewer?.kind !== "image") return;
    const msg = mediaViewer.message;
    const fileName = msg?.file_name || mediaViewer.alt || "image.jpg";
    try {
      let href = mediaViewer.src;
      if (msg?.file_url) {
        href = await downloadChatMedia({ url: msg.file_url, fileName });
      } else if (href && !href.startsWith("blob:")) {
        const res = await fetch(href);
        if (!res.ok) throw new Error("Download failed");
        href = URL.createObjectURL(await res.blob());
      }
      const a = document.createElement("a");
      a.href = href;
      a.download = fileName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Image saved");
    } catch (err) {
      toast.error(formatApiError(err) || "Could not download image");
    }
  }, [mediaViewer]);

  const handleMediaViewerForward = useCallback(() => {
    const msg = mediaViewer?.message;
    if (!msg?.id) return;
    setForwardMessages([msg]);
    setShowForwardModal(true);
    setMediaViewer(null);
  }, [mediaViewer]);
  const blobUrlsRef = useRef(new Set());

  const trayGroupKey = useMemo(() => {
    const convId = conversation?.id;
    if (!convId || !user?.id) return null;
    const participants = conversation?.participants;
    if (!Array.isArray(participants)) {
      return fcmGroupKeyForSender(null, convId);
    }
    const peerId = participants.find((p) => String(p) !== String(user.id));
    return fcmGroupKeyForSender(peerId != null ? String(peerId) : null, convId);
  }, [conversation?.id, conversation?.participants, user?.id]);

  // Sync active thread to chatflow_native_prefs immediately (before FCM can fire).
  useLayoutEffect(() => {
    const convId = conversation?.id;
    if (!convId) {
      void clearActiveChatState();
      return undefined;
    }
    setActiveConversationId(convId);
    void setActiveChatState(String(convId), trayGroupKey || undefined);
    if (Capacitor.isNativePlatform()) {
      void ChatFlowNative.setAppForeground({ foreground: true }).catch(() => {});
    }
    return () => {
      void clearActiveChatState();
    };
  }, [conversation?.id, trayGroupKey, setActiveConversationId]);

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
  const scrollHeightRef = useRef(0);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const isNearBottom = useCallback((el) => {
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  const syncScrollDown = useCallback(() => {
    const el = scrollRef.current;
    const atBottom = isNearBottom(el);
    stickToBottomRef.current = atBottom;
    setShowScrollDown(!atBottom);
  }, [isNearBottom]);

  const pinToBottom = useCallback((behavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollHeight;
    if (behavior === "smooth") {
      el.scrollTo({ top, behavior: "smooth" });
    } else {
      el.scrollTop = top;
    }
    scrollHeightRef.current = el.scrollHeight;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onScroll = () => syncScrollDown();
    el.addEventListener("scroll", onScroll, { passive: true });
    syncScrollDown();
    return () => el.removeEventListener("scroll", onScroll);
  }, [conversation?.id, syncScrollDown]);

  /* Open thread at latest message. */
  useLayoutEffect(() => {
    stickToBottomRef.current = true;
    setShowScrollDown(false);
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      scrollHeightRef.current = el.scrollHeight;
    }
  }, [conversation?.id]);

  /* New messages: grow scroll by delta only (no full jump — older bubbles stay still). */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    const prev = scrollHeightRef.current;
    const next = el.scrollHeight;
    if (prev > 0 && next > prev) {
      el.scrollTop += next - prev;
    } else {
      el.scrollTop = next;
    }
    scrollHeightRef.current = next;
    syncScrollDown();
  }, [visibleMessages.length, typingUsers, syncScrollDown]);

  /* Late-loading images: keep view pinned when user was already at the bottom. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const reanchor = () => {
      if (!stickToBottomRef.current || !scrollRef.current) return;
      const node = scrollRef.current;
      const prev = scrollHeightRef.current;
      const next = node.scrollHeight;
      if (prev > 0 && next > prev) {
        node.scrollTop += next - prev;
      } else {
        node.scrollTop = next;
      }
      scrollHeightRef.current = next;
    };
    el.addEventListener("load", reanchor, true);
    el.addEventListener("loadedmetadata", reanchor, true);
    return () => {
      el.removeEventListener("load", reanchor, true);
      el.removeEventListener("loadedmetadata", reanchor, true);
    };
  }, [conversation?.id]);

  useEffect(() => {
    lastTypingPingRef.current = 0;
    setComposerFocused(false);
    setThreadSearchOpen(false);
    setThreadSearchQuery("");
    setSelectedMessages([]);
    setActionMessageId(null);
    setMessageMenuOpen(false);
    setEditingMessage(null);
    setShowStarredPanel(false);
    setFlashMessageId(null);
  }, [conversation?.id]);

  const refreshStarredIds = useCallback(async () => {
    if (!conversation?.id || readOnly) return;
    try {
      const list = await fetchStarredMessages(conversation.id);
      setStarredIds(new Set(list.map((m) => String(m.id))));
    } catch {
      setStarredIds(new Set());
    }
  }, [conversation?.id, readOnly]);

  useEffect(() => {
    refreshStarredIds();
  }, [refreshStarredIds]);

  const dismissActionMenu = useCallback(() => {
    setMessageMenuOpen(false);
    setActionMessageId(null);
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectedMessages([]);
    setActionMessageId(null);
  }, []);

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

  const startReply = useCallback((message) => {
    if (!message || readOnly) return;
    const mine = message.sender_id === user?.id;
    setReplyingTo({
      id: message.id,
      sender_name: mine ? t("common.you") : (message.sender_name || t("common.user")),
      snippet: messageReplySnippet(message),
      mine,
    });
    setSelectedMessages([]);
    requestAnimationFrame(() => {
      try {
        composerRef.current?.focus({ preventScroll: true });
      } catch {
        composerRef.current?.focus();
      }
    });
  }, [readOnly, user?.id, t]);

  const messageKey = useCallback((m) => String(m?.id || m?.__tempId || ""), []);

  const toggleSelect = useCallback((id) => {
    const key = String(id);
    if (!key) return;
    setSelectedMessages((prev) => {
      const next = prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key];
      if (next.length === 0) setActionMessageId(null);
      return next;
    });
  }, []);

  const openSelectionMessageMenu = useCallback(() => {
    if (selectedMessages.length !== 1) return;
    const key = selectedMessages[0];
    const msg = visibleMessages.find((m) => messageKey(m) === key);
    if (!msg?.id) return;
    setActionMessageId(key);
    messageMenuAnchorRef.current = selectionMoreRef.current;
    setMessageMenuOpen(true);
  }, [selectedMessages, visibleMessages, messageKey]);

  const handleLongPressMessage = useCallback(
    (message) => {
      const key = messageKey(message);
      if (!key || readOnly || !message.id) return;
      void hapticMessageLongPress();

      setMessageMenuOpen(false);
      setReplyingTo(null);
      setEditingMessage(null);

      if (isSelectionMode) {
        setSelectedMessages((prev) =>
          (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]),
        );
        return;
      }

      setActionMessageId(null);
      setSelectedMessages([key]);
    },
    [messageKey, readOnly, isSelectionMode],
  );

  const openMessageActionMenu = useCallback((anchorEl) => {
    messageMenuAnchorRef.current = anchorEl;
    setMessageMenuOpen(true);
  }, []);

  const actionMessage = useMemo(() => {
    if (!actionMessageId) return null;
    return visibleMessages.find((m) => messageKey(m) === actionMessageId) || null;
  }, [actionMessageId, visibleMessages, messageKey]);

  const showEditInMenu = useMemo(
    () => messageCanEdit(actionMessage, user?.id),
    [actionMessage, user?.id],
  );

  const handleStartEdit = useCallback(() => {
    if (!actionMessage?.id || actionMessage.message_type !== "text") return;
    setEditingMessage(actionMessage);
    setText(actionMessage.content || "");
    setReplyingTo(null);
    exitSelectionMode();
    dismissActionMenu();
    requestAnimationFrame(() => {
      try {
        composerRef.current?.focus({ preventScroll: true });
      } catch {
        composerRef.current?.focus();
      }
    });
  }, [actionMessage, dismissActionMenu, exitSelectionMode]);

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(null);
    setText("");
    exitSelectionMode();
  }, [exitSelectionMode]);

  const handleToggleStar = useCallback(async () => {
    const msg = actionMessage;
    if (!msg?.id) return;
    const id = String(msg.id);
    const wasStarred = starredIds.has(id);
    try {
      if (wasStarred) {
        await unstarMessage(msg.id);
        setStarredIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        await starMessage(msg.id);
        setStarredIds((prev) => new Set([...prev, id]));
      }
      dismissActionMenu();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, [actionMessage, starredIds, dismissActionMenu]);

  const openStarredPanel = useCallback(async () => {
    if (!conversation?.id) return;
    setShowStarredPanel(true);
    setStarredLoading(true);
    try {
      const list = await fetchStarredMessages(conversation.id);
      setStarredList(list);
      setStarredIds(new Set(list.map((m) => String(m.id))));
    } catch (err) {
      toast.error(formatApiError(err));
      setStarredList([]);
    } finally {
      setStarredLoading(false);
    }
  }, [conversation?.id]);

  const scrollToMessage = useCallback((messageId) => {
    if (!messageId) return;
    const el = scrollRef.current?.querySelector(`[data-testid="message-${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setFlashMessageId(String(messageId));
    setTimeout(() => setFlashMessageId(null), 1000);
  }, []);

  const handleStarredMessageSelect = useCallback((item) => {
    setShowStarredPanel(false);
    requestAnimationFrame(() => scrollToMessage(item.id));
  }, [scrollToMessage]);

  const startReplyRef = useRef(startReply);
  startReplyRef.current = startReply;

  const buildSendPayload = useCallback((base) => {
    if (!replyingTo?.id) return base;
    return {
      ...base,
      reply_to_id: replyingTo.id,
      reply_to_snippet: replyingTo.snippet,
      reply_to_sender: replyingTo.sender_name,
    };
  }, [replyingTo]);

  const handleRetryMessage = useCallback((failed) => {
    if (!conversation || !onSendMessage || !failed?.__error) return;
    const body = {
      conversation_id: conversation.id,
      content: failed.content || "",
      message_type: failed.message_type || "text",
      file_url: failed.file_url,
      file_name: failed.file_name,
    };
    if (failed.reply_to_id) {
      body.reply_to_id = failed.reply_to_id;
      body.reply_to_snippet = failed.reply_to_snippet;
      body.reply_to_sender = failed.reply_to_sender;
    }
    onSendMessage(body, { tempId: failed.__tempId || failed.id });
  }, [conversation, onSendMessage]);

  const handleReply = useCallback(() => {
    if (selectedMessages.length !== 1) return;
    const key = selectedMessages[0];
    const msg = visibleMessages.find((m) => messageKey(m) === key);
    if (msg) startReply(msg);
    setSelectedMessages([]);
  }, [selectedMessages, visibleMessages, messageKey, startReply]);

  const handleForward = useCallback(() => {
    const keys = new Set(selectedMessages);
    const msgsToForward = visibleMessages.filter((m) => {
      const id = m.id;
      return id && keys.has(String(id));
    });
    if (msgsToForward.length === 0) return;
    setForwardMessages(msgsToForward);
    setShowForwardModal(true);
    setSelectedMessages([]);
  }, [selectedMessages, visibleMessages]);

  const handleSendText = () => {
    const value = text.trim();
    if (!value || !conversation) return;

    if (editingMessage?.id) {
      const msgId = editingMessage.id;
      (async () => {
        try {
          const updated = await editMessageContent(msgId, value);
          onUpdateMessage?.(msgId, {
            content: updated.content,
            is_edited: true,
            edited_at: updated.edited_at,
          });
          setEditingMessage(null);
          setText("");
          exitSelectionMode();
          flushTypingStop();
        } catch (err) {
          toast.error(formatApiError(err));
        }
      })();
      return;
    }

    onSendMessage(buildSendPayload({
      conversation_id: conversation.id,
      content: value,
      message_type: "text",
    }));
    setText("");
    setReplyingTo(null);
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

  const displayItems = useMemo(() => {
    const q = threadSearchQuery.trim().toLowerCase();
    const msgs = !q
      ? visibleMessages
      : visibleMessages.filter((m) => {
          const content = (m.content || "").toLowerCase();
          const fname = (m.file_name || "").toLowerCase();
          return content.includes(q) || fname.includes(q);
        });
    const groups = groupMessagesByDate(msgs);
    if (!q) return groups;
    return groups.filter((item) => {
      if (item.type === "divider") return true;
      const content = (item.message?.content || "").toLowerCase();
      const fname = (item.message?.file_name || "").toLowerCase();
      return content.includes(q) || fname.includes(q);
    });
  }, [visibleMessages, threadSearchQuery]);

  const scrollToLatest = useCallback(() => {
    stickToBottomRef.current = true;
    setShowScrollDown(false);
    pinToBottom("smooth");
  }, [pinToBottom]);

  if (!conversation) {
    if (clientUnassigned) {
      return (
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-50 dark:bg-gray-950"
          data-testid="client-unassigned-chat"
        >
          <div className="chat-header z-10 flex shrink-0 flex-col border-b border-gray-200 bg-white/90 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/80">
            <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
              <span className="font-display font-semibold text-sm sm:text-base dark:text-gray-100">{t("common.chat")}</span>
            </div>
          </div>
          <div className="chat-bg flex min-h-0 flex-1 items-center justify-center px-6">
            <div className="text-center max-w-sm">
              <p className="text-[15px] text-[#6B7280] dark:text-gray-400 leading-relaxed" data-testid="client-unassigned-message">
                {t("chat.unassignedLine1")}
                <br />
                {t("chat.unassignedLine2")}
              </p>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
        <div className="chat-bg flex min-h-0 flex-1 items-center justify-center" data-testid="no-conversation-placeholder">
          <div className="text-center max-w-sm p-8">
            <div className="mx-auto h-20 w-20 rounded-2xl bg-white dark:bg-gray-900 shadow-sm flex items-center justify-center mb-4 border border-gray-100 dark:border-gray-800">
              <Send className="h-9 w-9 text-emerald-800 dark:text-emerald-300" strokeWidth={1.3} />
            </div>
            <h3 className="font-display text-2xl font-semibold mb-1 dark:text-gray-100">{t("chat.placeholderTitle")}</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{t("chat.placeholderSubtitle")}</p>
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
  const typingArr = Object.entries(typingUsers || {}).filter(([uid]) => uid !== user?.id);
  const othersTypingCount = typingArr.length;

  const headerStatusLine = (() => {
    if (readOnly && !othersTypingCount) return { kind: "text", value: t("chat.readOnlyView") };
    if (othersTypingCount > 0) return { kind: "typing" };
    if (readOnly) return { kind: "text", value: t("chat.readOnlyView") };
    if (isGroup) {
      const count = conversation.participants?.length ?? 0;
      return { kind: "text", value: t("common.members", { count }) };
    }
    if (isOnline) return { kind: "text", value: t("common.online") };
    const lsIso = (otherUser?.id && lastSeenByUser[otherUser.id]) || otherUser?.last_seen;
    const lsText = formatWhatsAppLastSeen(lsIso);
    if (lsText) return { kind: "text", value: lsText };
    return { kind: "text", value: t("common.offline") };
  })();

  // For read-receipts in groups
  const totalRecipients = isGroup ? (conversation.participants?.length || 1) - 1 : 1;
  const showSenderNames = isGroup;

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

  const canPlaceCall = !isGroup && !readOnly && Boolean(otherUser?.id) && conversation?.type === "direct";
  const handleStartCall = () => {
    if (!canPlaceCall || callState !== CALL_STATE.IDLE) return;
    if (!isOnline) {
      toast.error("Contact is offline. They need ChatFlow open in their browser to receive your call.");
      return;
    }
    void startCallForChat(
      conversation.id,
      otherUser.id,
      otherUser.full_name || otherUser.username || "Contact",
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-gray-50 dark:bg-gray-950" data-testid="chat-window">
      {/* Header: optional status-bar spacer when this window is the top chrome (admin mobile chat). */}
      <div className="chat-header z-10 flex shrink-0 flex-col border-b border-gray-200 bg-white/90 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/80">
        <ChatCallHeader conversationId={conversation.id} remoteName={otherUser?.full_name} />
        {statusBarInset ? (
          <div
            className="w-full shrink-0 bg-white/90 dark:bg-gray-950/80"
            style={{ minHeight: "max(env(safe-area-inset-top, 0px), 36px)" }}
            aria-hidden
          />
        ) : null}
        <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5 md:py-2.5">
        {isSelectionMode && !readOnly ? (
          <div className="selection-bar flex w-full items-center gap-2" data-testid="message-selection-bar">
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full shrink-0"
              onClick={exitSelectionMode}
              data-testid="message-selection-clear"
              title={t("common.clear")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <span className="flex-1 text-sm font-medium tabular-nums dark:text-gray-100" data-testid="message-selection-count">
              {selectedMessages.length === 1
                ? t("common.selectedOne")
                : t("common.selected", { count: selectedMessages.length })}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full text-emerald-700 disabled:opacity-40"
              onClick={handleReply}
              disabled={selectedMessages.length !== 1}
              data-testid="message-selection-reply"
              title={t("common.reply")}
            >
              <Reply className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full text-emerald-700"
              onClick={handleForward}
              data-testid="message-selection-forward"
              title={t("common.forward")}
            >
              <Forward className="h-5 w-5" />
            </Button>
            <Button
              ref={selectionMoreRef}
              size="icon"
              variant="ghost"
              className="rounded-full text-emerald-700 disabled:opacity-40"
              onClick={openSelectionMessageMenu}
              disabled={selectedMessages.length !== 1}
              data-testid="message-selection-more"
              aria-label="Message actions"
            >
              <MoreVertical className="h-5 w-5" />
            </Button>
          </div>
        ) : (
          <>
        {onBack && !hideBackButton && (
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
          <div className="chat-header-name font-display font-semibold text-sm sm:text-base truncate flex items-center gap-2 dark:text-gray-100" data-testid="chat-header-name">
            {headerName}
            {readOnly && (
              <span className="inline-flex items-center gap-1 text-[10px] tracking-[0.2em] uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                <Eye className="h-3 w-3" /> {t("common.monitor")}
              </span>
            )}
            {isGroup && (
              <span className="inline-flex items-center gap-1 text-[10px] tracking-[0.2em] uppercase bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full">
                <Users className="h-3 w-3" /> {t("common.group")}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 truncate min-h-[1rem] flex items-center gap-1">
            {headerStatusLine.kind === "typing" ? (
              <span className="inline-flex items-center gap-1 text-emerald-800/90" data-testid="header-typing">
                <span>{t("common.typing")}</span>
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
        {canPlaceCall && callState === CALL_STATE.IDLE && !isCallActive ? (
          <Button
            size="icon"
            variant="ghost"
            className="rounded-full shrink-0 text-emerald-700 dark:text-emerald-300"
            onClick={handleStartCall}
            data-testid="chat-call-btn"
            title="Audio call"
          >
            <Phone className="h-5 w-5" />
          </Button>
        ) : null}
        <Button size="icon" variant="ghost" className="rounded-full shrink-0" onClick={() => setThreadSearchOpen((v) => !v)} data-testid="chat-thread-search-toggle" title={t("chat.searchInChat")}>
          <Search className="h-5 w-5" />
        </Button>
        {!readOnly && (
          <Button
            size="icon"
            variant="ghost"
            className="rounded-full shrink-0 text-primary"
            onClick={openStarredPanel}
            data-testid="chat-starred-messages-btn"
            title={t("chat.starredMessages")}
          >
            <Star className="h-5 w-5" strokeWidth={2} />
          </Button>
        )}

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
              title={t("chat.viewMedical")}
            >
              <Stethoscope className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden md:inline">{t("common.medical")}</span>
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="rounded-full sm:hidden"
              onClick={() =>
                navigate(medicalPath(user?.role, otherUser.id), { state: subPageState() })
              }
              data-testid="chat-header-medical-btn-mobile"
              title={t("chat.viewMedical")}
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
              title={t("chat.dietLog")}
            >
              <UtensilsCrossed className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden md:inline">{t("common.diet")}</span>
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="rounded-full sm:hidden"
              onClick={openDietPlan}
              data-testid="chat-header-diet-btn-mobile"
              title={t("chat.dietLog")}
            >
              <UtensilsCrossed className="h-4 w-4" />
            </Button>
          </>
        )}
          </>
        )}
        </div>
        {threadSearchOpen && !isSelectionMode && (
          <div className="px-3 pb-2 flex items-center gap-2 border-t border-gray-100 dark:border-gray-800" data-testid="chat-thread-search-bar">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                value={threadSearchQuery}
                onChange={(e) => setThreadSearchQuery(e.target.value)}
                placeholder={t("chat.searchConversation")}
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
        <StarredMessagesPanel
          open={showStarredPanel}
          items={starredList}
          loading={starredLoading}
          onBack={() => setShowStarredPanel(false)}
          onSelectMessage={handleStarredMessageSelect}
        />
        <div
          ref={scrollRef}
          className="chat-bg h-full space-y-2 overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y px-3 py-4 sm:px-4 sm:py-5"
          style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
          data-testid="messages-container"
          onClick={() => {
            if (messageMenuOpen || actionMessageId) dismissActionMenu();
          }}
        >
        {visibleMessages.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-10" data-testid="empty-messages">
            {readOnly ? t("chat.noMessagesQuiet") : t("chat.noMessagesSayHi")}
          </div>
        )}
        {displayItems.map((item) => {
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
          const mine = readOnly
            ? monitoringBubbleAlignRight(m, conversation)
            : m.sender_id === user?.id;
          const mKey = messageKey(m);
          const isActionTarget = actionMessageId === mKey;
          return (
            <div
              key={m.__tempId || m.id}
              className={`relative flex w-full items-center gap-1 ${mine ? "justify-end" : "justify-start"}`}
            >
              <SwipeableMessageRow
                isSent={mine}
                disabled={readOnly || isSelectionMode || !!actionMessageId}
                selectionModeRef={isSelectionModeActive}
                onSwipeReply={() => startReplyRef.current(m)}
              >
                <MessageBubble
                  message={m}
                  mine={mine}
                  showSenderName={showSenderNames}
                  totalRecipients={totalRecipients}
                  showReceipts={!readOnly}
                  onImageClick={handleImageClick}
                  onOpenInAppMedia={handleOpenInAppMedia}
                  selected={selectedMessages.includes(mKey)}
                  actionSelected={isActionTarget}
                  flashHighlight={flashMessageId && String(m.id) === flashMessageId}
                  starred={m.id ? starredIds.has(String(m.id)) : false}
                  searchQuery={threadSearchQuery}
                  selectionMode={isSelectionMode}
                  onLongPress={readOnly ? undefined : handleLongPressMessage}
                  onToggleSelect={readOnly ? undefined : toggleSelect}
                  dimmed={
                    (isSelectionMode && !selectedMessages.includes(mKey))
                    || (!isSelectionMode && actionMessageId && !isActionTarget)
                  }
                  onRetry={readOnly ? undefined : handleRetryMessage}
                  viewerUserId={user?.id}
                />
              </SwipeableMessageRow>
              {isActionTarget && !readOnly && !isSelectionMode && (
                <button
                  type="button"
                  className="message-actions-menu-btn shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-200/80 dark:text-gray-300 dark:hover:bg-gray-800 touch-manipulation"
                  onClick={(e) => {
                    e.stopPropagation();
                    openMessageActionMenu(e.currentTarget);
                  }}
                  data-testid="message-action-menu-trigger"
                  aria-label="Message actions"
                >
                  <MoreVertical className="h-5 w-5" strokeWidth={2} />
                </button>
              )}
            </div>
          );
        })}
        </div>
        {showScrollDown && (
          <button
            type="button"
            onClick={scrollToLatest}
            className="absolute bottom-4 right-3 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-emerald-800 shadow-lg ring-2 ring-white/80 active:scale-95 dark:border-gray-600 dark:bg-gray-900 dark:text-emerald-300 dark:ring-gray-950/80"
            data-testid="scroll-to-bottom-btn"
            aria-label={t("chat.scrollLatest")}
          >
            <ChevronDown className="h-6 w-6" strokeWidth={2.5} />
          </button>
        )}
      </div>

      <InAppMediaHost
        viewer={mediaViewer}
        onClose={() => setMediaViewer(null)}
        onDownload={mediaViewer?.kind === "image" ? handleMediaViewerDownload : undefined}
        onForward={readOnly ? undefined : handleMediaViewerForward}
        onSaveAndSend={
          mediaViewer?.kind === "image" && !readOnly ? handleMediaViewerSaveSend : undefined
        }
        showForward={!readOnly}
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
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            editingMessage={editingMessage}
            onCancelEdit={handleCancelEdit}
          />
        </div>
      )}

      <ForwardModal
        open={showForwardModal}
        onOpenChange={setShowForwardModal}
        messages={forwardMessages}
        conversations={conversations}
        currentConversationId={conversation?.id}
      />

      <MessageContextMenu
        open={messageMenuOpen && !!actionMessage}
        anchorRef={messageMenuAnchorRef}
        onClose={dismissActionMenu}
        showEdit={showEditInMenu}
        isStarred={actionMessage?.id ? starredIds.has(String(actionMessage.id)) : false}
        onEdit={handleStartEdit}
        onToggleStar={handleToggleStar}
      />
    </div>
  );
}
