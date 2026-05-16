import React, { useEffect, useLayoutEffect, useState, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ChatSidebar from "@/components/ChatSidebar";
import ChatWindow from "@/components/ChatWindow";
import { createAccountPath, newConversationPath } from "@/lib/appRoutes";
import ComplaintDialog from "@/components/ComplaintDialog";
import TopBar from "@/components/TopBar";
import useChatSocket from "@/hooks/useChatSocket";
import useDoubleBackToExit from "@/hooks/useDoubleBackToExit";
import useMobileChatViewport from "@/hooks/useMobileChatViewport";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  ensureNotificationPermission,
  registerServiceWorker,
  showAppNotification,
} from "@/lib/notify";
import {
  playInboundMessageTone,
  playConversationIncomingTone,
  playSoftForegroundTone,
  notificationToneSuppressesOsSound,
} from "@/lib/notificationTone";
import { clearActiveChatState } from "@/lib/activeChatState";
import { showInAppMessageBanner } from "@/lib/inAppNotifications";
import { FCM_MESSAGE_EVENT, NOTIFICATION_MARK_READ_EVENT } from "@/lib/push";
import {
  getCachedMessages,
  setCachedMessages,
  mergeMessageLists,
  loadCacheFromStorage,
  patchCachedMessageStatus,
  patchCachedMessageStatuses,
} from "@/lib/messageCache";
import {
  mergeIncomingLiveMessage,
  isOwnMessage,
  shouldNotifyForMessage,
  isViewingConversation,
} from "@/lib/optimisticMessages";
import {
  markOpponentMessagesSeen,
  markMessageSeen,
  mergeMessageStatus,
} from "@/lib/messageSeen";
import { toast } from "sonner";
import { Plus, MessageSquare, UtensilsCrossed, Settings, Layers } from "lucide-react";
import PanelBottomNav from "@/components/layout/PanelBottomNav";
import ProfileQuickView from "@/components/ProfileQuickView";
import { dietPlanPath, profilePath, userProfilePath } from "@/lib/appRoutes";
import { saveChatListScroll } from "@/lib/chatListScroll";
import {
  patchConversationPrefs,
  updateConversationPreferences,
} from "@/lib/conversationPreferences";
import { useOptimisticMessageSend } from "@/hooks/useOptimisticMessageSend";

export default function ChatApp() {
  useMobileChatViewport();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [lastSeenByUser, setLastSeenByUser] = useState({});
  const [typingUsers, setTypingUsers] = useState({}); // convId -> {userId: name}
  const selectedIdRef = useRef(null);
  const seenInflightRef = useRef(new Set());
  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null;
  }, [selected?.id]);

  useEffect(() => {
    if (user?.id) loadCacheFromStorage(user.id);
  }, [user?.id]);
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [batches, setBatches] = useState([]);
  const [mobileSection, setMobileSection] = useState("chats"); // chats | diet | batches | settings
  const [listSelection, setListSelection] = useState(null);
  const [quickView, setQuickView] = useState(null);
  const listScrollRef = useRef(null);
  const canCreateAccounts =
    user?.role === "admin" ||
    (user?.role === "employee" && !!user?.account_creation_access);

  // Open conversation when user taps a push notification (including cold start).
  useEffect(() => {
    const convId = location.state?.conversationId;
    if (!convId || conversations.length === 0) return;
    const target = conversations.find((c) => c.id === convId);
    if (target) setSelected(target);
  }, [location.state?.conversationId, conversations]);

  // Return from full-screen new-conversation page with a started thread.
  useEffect(() => {
    const conv = location.state?.selectedConversation;
    if (!conv?.id) return;
    setConversations((prev) => (prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev]));
    setSelected(conv);
    navigate("/chat", { replace: true, state: {} });
  }, [location.state?.selectedConversation, navigate]);

  const openNewConversation = useCallback(() => {
    navigate(newConversationPath(), { state: { backTo: "/chat", panel: "chat" } });
  }, [navigate]);

  const handlePreferenceChange = useCallback(async (convId, patch) => {
    try {
      const data = await updateConversationPreferences(convId, patch);
      setConversations((prev) => patchConversationPrefs(prev, convId, data));
      if (patch.is_archived && selectedIdRef.current === convId) {
        setSelected(null);
      }
      if (patch.is_archived && listSelection?.id === convId) {
        setListSelection(null);
      }
      setListSelection((prev) => (prev?.id === convId ? { ...prev, ...data } : prev));
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const res = await api.get("/conversations");
      setConversations(res.data);
      const online = {};
      const lastSeen = {};
      res.data.forEach((c) => (c.participants_info || []).forEach((p) => {
        if (p?.id) {
          online[p.id] = !!p.online;
          if (p.last_seen) lastSeen[p.id] = p.last_seen;
        }
      }));
      setOnlineUsers((prev) => ({ ...online, ...prev }));
      setLastSeenByUser((prev) => ({ ...lastSeen, ...prev }));
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, []);

  const loadBatches = useCallback(async () => {
    if (user?.role !== "employee") {
      setBatches([]);
      setSelectedBatchId(null);
      return;
    }
    try {
      const res = await api.get("/batches/me");
      setBatches(res.data || []);
      // Keep selection valid
      setSelectedBatchId((prev) => {
        if (!prev) return prev;
        return (res.data || []).some((b) => b.id === prev) ? prev : null;
      });
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, [user?.role]);

  const syncMessagesToView = useCallback((convId, serverMessages) => {
    if (!isViewingConversation(convId, selectedIdRef.current)) return;
    setMessages((prev) => {
      const next = mergeMessageLists(prev, serverMessages);
      if (user?.id) setCachedMessages(user.id, convId, next);
      return next;
    });
  }, [user?.id]);

  const loadMessages = useCallback(async (convId) => {
    if (!convId) return;
    try {
      const res = await api.get(`/conversations/${convId}/messages`);
      const cached = getCachedMessages(convId);
      const merged = mergeMessageLists(cached, res.data);
      console.log("ChatFlowCache -> Merged network + cache:", convId, merged.length, "messages");
      syncMessagesToView(convId, merged);
      if (user?.id) {
        markOpponentMessagesSeen({
          userId: user.id,
          conversationId: convId,
          messages: merged,
          inflight: seenInflightRef.current,
        });
      }
      api.post(`/conversations/${convId}/read`).catch(() => {});
    } catch (err) {
      if (!getCachedMessages(convId)) {
        toast.error(formatApiError(err));
      }
    }
  }, [user?.id, syncMessagesToView]);

  const handleRefresh = useCallback(async () => {
    const convId = selectedIdRef.current;
    await Promise.all([
      loadConversations(),
      convId ? loadMessages(convId) : Promise.resolve(),
    ]);
    if (user?.id) loadCacheFromStorage(user.id);
  }, [loadConversations, loadMessages, user?.id]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => () => {
    void clearActiveChatState();
  }, []);

  useEffect(() => {
    const onFcmMessage = (event) => {
      const data = event?.detail?.data || {};
      const convId = data.conversation_id;
      const activeId = selectedIdRef.current;
      if (convId && activeId && String(convId) === String(activeId)) {
        if (data.message_id) {
          markMessageSeen(data.message_id, seenInflightRef.current);
        }
        loadMessages(activeId);
      } else {
        loadConversations();
      }
    };
    window.addEventListener(FCM_MESSAGE_EVENT, onFcmMessage);
    return () => window.removeEventListener(FCM_MESSAGE_EVENT, onFcmMessage);
  }, [loadConversations, loadMessages]);

  useEffect(() => {
    const onMarkRead = (event) => {
      const convId = event?.detail?.conversationId;
      if (!convId) return;
      setConversations((prev) => prev.map((c) => (
        c.id === convId ? { ...c, unread_count: 0 } : c
      )));
    };
    window.addEventListener(NOTIFICATION_MARK_READ_EVENT, onMarkRead);
    return () => window.removeEventListener(NOTIFICATION_MARK_READ_EVENT, onMarkRead);
  }, []);
  useEffect(() => { loadBatches(); }, [loadBatches]);

  // Instant paint from in-memory cache (0ms) before network fetch.
  useLayoutEffect(() => {
    if (!selected?.id) {
      setMessages([]);
      return;
    }
    const convId = selected.id;
    const cached = getCachedMessages(convId, { log: true });
    if (cached?.length) {
      setMessages(cached);
      if (user?.id) {
        markOpponentMessagesSeen({
          userId: user.id,
          conversationId: convId,
          messages: cached,
          inflight: seenInflightRef.current,
        });
      }
    }
  }, [selected?.id, user?.id]);

  useEffect(() => {
    if (!selected?.id) return;
    loadMessages(selected.id);
  }, [selected?.id, loadMessages]);

  useEffect(() => {
    if (!selected?.id) return;
    setConversations((prev) => prev.map((c) => (
      c.id === selected.id ? { ...c, unread_count: 0 } : c
    )));
  }, [selected?.id]);

  const maybeNotify = useCallback((msg) => {
    if (!msg) return;
    if (!shouldNotifyForMessage(msg, user.id)) return;
    const ids = Array.isArray(msg.recipient_ids) ? msg.recipient_ids : [];
    if (!ids.some((id) => String(id) === String(user.id))) return;
    const conv = conversations.find((c) => c.id === msg.conversation_id);
    if (conv?.is_muted) return;

    const sender = msg.sender_name || "Someone";
    const preview = msg.message_type === "text"
      ? (msg.content || "")
      : `[${msg.message_type}]`;
    const title = msg.conversation_type === "group"
      ? `${sender} (group)`
      : sender;
    const appVisible = document.visibilityState === "visible";
    const inActiveChat = appVisible && selectedIdRef.current === msg.conversation_id;

    if (inActiveChat) {
      void playConversationIncomingTone(msg.conversation_id);
      return;
    }

    if (appVisible) {
      void playSoftForegroundTone();
      showInAppMessageBanner({
        title,
        body: preview,
        conversationId: msg.conversation_id,
        onOpen: () => {
          const target = conversations.find((c) => c.id === msg.conversation_id);
          if (target) setSelected(target);
        },
      });
      return;
    }

    playInboundMessageTone();
    showAppNotification({
      title,
      body: preview,
      tag: msg.id ? `msg-${msg.id}` : `msg-${Date.now()}`,
      url: "/chat",
      data: { conversation_id: msg.conversation_id },
      silent: notificationToneSuppressesOsSound(),
    });
  }, [user.id, conversations, setSelected]);

  const ackMessageDelivered = useCallback((msg) => {
    if (!msg?.id) return;
    const ids = Array.isArray(msg.recipient_ids) ? msg.recipient_ids : [];
    if (!ids.some((id) => String(id) === String(user.id))) return;
    if (String(msg.sender_id) === String(user.id)) return;
    api.post("/notifications/update-status", { message_id: msg.id, status: "delivered" }).catch(() => {});
  }, [user.id]);

  const ackMessageSeen = useCallback((msg) => {
    if (!msg?.id) return;
    const ids = Array.isArray(msg.recipient_ids) ? msg.recipient_ids : [];
    if (!ids.some((id) => String(id) === String(user.id))) return;
    if (String(msg.sender_id) === String(user.id)) return;
    const activeId = selectedIdRef.current;
    if (!activeId || msg.conversation_id !== activeId) return;
    markMessageSeen(msg.id, seenInflightRef.current);
  }, [user.id]);

  const handleIncomingMessage = useCallback((msg) => {
    if (!msg) return;
    const activeId = selectedIdRef.current;
    const own = isOwnMessage(msg, user.id);
    const inOpenThread =
      document.visibilityState === "visible"
      && isViewingConversation(msg.conversation_id, activeId);

    if (inOpenThread) {
      if (!own) ackMessageSeen(msg);
    } else if (!own) {
      maybeNotify(msg);
    }
    ackMessageDelivered(msg);
    setMessages((prev) => {
      if (!isViewingConversation(msg.conversation_id, activeId)) return prev;

      const { next, changed } = mergeIncomingLiveMessage(prev, msg, user.id);
      if (!changed) return prev;

      if (!own && (msg.recipient_ids || []).includes(user.id)) {
        api.post(`/conversations/${activeId}/read`).catch(() => {});
      }
      if (user?.id) setCachedMessages(user.id, activeId, next);
      return next;
    });
    setConversations((prev) => {
      const exists = prev.find((c) => c.id === msg.conversation_id);
      const preview = msg.content || `[${msg.message_type}]`;
      const previewText = msg.conversation_type === "group"
        ? `${msg.sender_name}: ${preview}` : preview;
      if (!exists) { loadConversations(); return prev; }
      const shouldIncrementUnread = (
        (!activeId || msg.conversation_id !== activeId) &&
        Array.isArray(msg.recipient_ids) &&
        msg.recipient_ids.includes(user.id)
      );
      const updated = prev.map((c) => c.id === msg.conversation_id
        ? {
          ...c,
          last_message: previewText,
          last_message_at: msg.created_at,
          unread_count: shouldIncrementUnread ? (Number(c.unread_count || 0) + 1) : Number(c.unread_count || 0),
        } : c
      );
      updated.sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || ""));
      return updated;
    });
  }, [user.id, loadConversations, maybeNotify, ackMessageDelivered, ackMessageSeen]);

  const handleTyping = useCallback((data) => {
    setTypingUsers((prev) => {
      const convMap = { ...(prev[data.conversation_id] || {}) };
      if (data.is_typing) convMap[data.sender_id] = data.sender_name || "Someone";
      else delete convMap[data.sender_id];
      return { ...prev, [data.conversation_id]: convMap };
    });
  }, []);

  const handlePresence = useCallback((data) => {
    setOnlineUsers((prev) => ({ ...prev, [data.user_id]: data.online }));
    if (data.last_seen) {
      setLastSeenByUser((prev) => ({ ...prev, [data.user_id]: data.last_seen }));
    }
    setConversations((prev) => prev.map((c) => {
      if (c.type === "group") return c;
      const other = c.other_user;
      if (!other || other.id !== data.user_id) return c;
      return {
        ...c,
        other_user: {
          ...other,
          online: data.online,
          last_seen: data.last_seen ?? other.last_seen,
        },
      };
    }));
  }, []);

  const handleReadReceipt = useCallback((data) => {
    const activeId = selectedIdRef.current;
    if (activeId && data.conversation_id === activeId) {
      setMessages((prev) => {
        const next = prev.map((m) => {
          if (m.sender_id === user.id && !(m.read_by || []).includes(data.reader_id)) {
            return {
              ...m,
              read_by: [...(m.read_by || []), data.reader_id],
              status: "seen",
            };
          }
          return m;
        });
        if (user?.id) setCachedMessages(user.id, activeId, next);
        return next;
      });
    }
  }, [user?.id]);

  const handleStatusUpdate = useCallback((data) => {
    if (!data?.status) return;
    const nextStatus = String(data.status).toLowerCase();
    const ids = data.message_ids?.length
      ? data.message_ids.map((id) => String(id))
      : data.message_id
        ? [String(data.message_id)]
        : [];
    if (!ids.length) return;

    const convId = data.conversation_id || selectedIdRef.current;
    const idSet = new Set(ids);

    setMessages((prev) => {
      let changed = false;
      const next = prev.map((m) => {
        if (!idSet.has(String(m.id))) return m;
        changed = true;
        return { ...m, status: mergeMessageStatus(m.status, nextStatus) };
      });
      if (changed && convId && user?.id) {
        setCachedMessages(user.id, convId, next);
      }
      return changed ? next : prev;
    });

    if (convId && user?.id) {
      if (ids.length === 1) {
        patchCachedMessageStatus(user.id, convId, ids[0], nextStatus);
      } else {
        patchCachedMessageStatuses(user.id, convId, ids, nextStatus);
      }
    }
  }, [user?.id]);

  const handleConversationRemoved = useCallback((data) => {
    const id = data?.conversation_id;
    if (!id) return;
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setSelected((s) => (s?.id === id ? null : s));
    setMessages((prev) => (selectedIdRef.current === id ? [] : prev));
  }, []);

  const { sendTyping: wsSendTyping } = useChatSocket({
    onMessage: handleIncomingMessage,
    onTyping: handleTyping,
    onPresence: handlePresence,
    onReadReceipt: handleReadReceipt,
    onStatusUpdate: handleStatusUpdate,
    onConversationRemoved: handleConversationRemoved,
    enabled: Boolean(user?.id),
  });

  // Register SW first (Android WebView requires it for showNotification), then ask permission.
  useEffect(() => {
    void (async () => {
      await registerServiceWorker();
      await ensureNotificationPermission();
    })();
  }, []);

  // When the user clicks a notification, the SW asks us to focus the right
  // conversation. The SW also focused the tab/opened a new one.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event) => {
      const payload = event?.data;
      if (!payload || payload.type !== "chatflow:notification-click") return;
      const convId = payload.data?.conversation_id;
      if (!convId) return;
      setConversations((prev) => {
        const target = prev.find((c) => c.id === convId);
        if (target) setSelected(target);
        return prev;
      });
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  const sendTyping = useCallback((conversationId, isTyping) => {
    wsSendTyping(conversationId, isTyping);
  }, [wsSendTyping]);

  const { sendMessage: handleSendMessage, patchMessage } = useOptimisticMessageSend({
    user,
    selectedIdRef,
    setMessages,
    setConversations,
    conversations,
    onConversationMissing: loadConversations,
  });

  const filteredConversations = React.useMemo(() => {
    // Inactive clients shouldn't clutter chat lists for anyone except admin
    // (the admin's monitor view goes through AdminDashboard, not this page).
    const hideInactive = (c) => {
      if (c.type === "group") return true;
      // If the other party is a client and they've been deactivated, hide
      // the conversation. Their messages are still in the DB; an admin can
      // re-activate them anytime to make the thread reappear.
      if (c.other_user?.role === "client" && c.other_user?.is_active === false) {
        return false;
      }
      return true;
    };

    const visible = conversations.filter(hideInactive);

    if (user?.role !== "employee" || !selectedBatchId) return visible;
    const batch = (batches || []).find((b) => b.id === selectedBatchId);
    if (!batch) return visible;
    const clientIds = new Set(batch.client_ids || []);
    return visible.filter((c) => {
      if (c.type === "group") return true;
      const otherId = c.other_user?.id;
      return otherId && clientIds.has(otherId);
    });
  }, [user?.role, selectedBatchId, conversations, batches]);

  const unreadTotal = React.useMemo(
    () => conversations
      .filter((c) => !c.is_archived)
      .reduce((sum, c) => sum + Number(c.unread_count || 0), 0),
    [conversations]
  );

  useEffect(() => {
    document.title = unreadTotal > 0 ? `(${unreadTotal}) ChatFlow` : "ChatFlow";
  }, [unreadTotal]);

  // System back button: when a chat is open it returns to the conversation
  // list. At the list itself the back press is trapped (the hook re-pushes
  // its sentinel) so the user never falls back onto /login or some stale
  // browser entry — they leave the app via the system home / task switcher
  // just like a native app.
  const pushSentinel = useDoubleBackToExit({
    onBeforeExitBack: () => {
      if (listSelection) {
        setListSelection(null);
        return true;
      }
      if (selectedIdRef.current) {
        setSelected(null);
        return true;
      }
      return false;
    },
  });

  const openUserProfile = useCallback((profileUser, conv) => {
    if (!profileUser?.id) return;
    navigate(userProfilePath(user?.role, profileUser.id), {
      state: {
        backTo: "/chat",
        conversationId: conv?.id,
        profile: profileUser,
        isMuted: !!conv?.is_muted,
      },
    });
  }, [navigate, user?.role]);

  const handleAvatarQuickView = useCallback((conv, profileUser) => {
    if (!profileUser) return;
    setQuickView({ conv, user: profileUser });
  }, []);

  // Whenever a new conversation is selected we re-anchor the sentinel so a
  // subsequent system Back press is guaranteed to land in our handler (and
  // thus close the chat) rather than walk through the browser's accumulated
  // history.
  useEffect(() => {
    if (selected?.id) pushSentinel();
  }, [selected?.id, pushSentinel]);

  const showMobileFooter = !selected;
  const isClient = user?.role === "client";
  const isEmployee = user?.role === "employee";

  return (
    <div
      className="flex w-full min-h-0 flex-col overflow-hidden bg-gray-50 dark:bg-gray-950"
      style={{ height: "var(--visual-vh, 100dvh)" }}
      data-testid="chat-app"
    >
      <div className="shrink-0">
        <TopBar
          onOpenSettings={() => {
            if (listScrollRef.current) saveChatListScroll(listScrollRef.current.scrollTop);
            navigate(profilePath(user?.role));
          }}
          onRefresh={handleRefresh}
          onCreateAccount={
            canCreateAccounts
              ? () =>
                  navigate(createAccountPath(user?.role), {
                    state: {
                      allowedRoles: user?.role === "admin" ? ["employee", "client"] : ["client"],
                      defaultRole: "client",
                      backTo: "/chat",
                    },
                  })
              : undefined
          }
          onRaiseComplaint={user?.role === "client" ? () => setComplaintOpen(true) : undefined}
        />
      </div>

      <div className={`flex min-h-0 flex-1 overflow-hidden ${showMobileFooter ? "pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0" : ""}`}>
        <div className={`${selected ? "hidden md:flex" : "flex"} h-full min-h-0 w-full flex-col md:w-auto md:flex-none`}>
          <ChatSidebar
            conversations={filteredConversations}
            onlineUsers={onlineUsers}
            selectedId={selected?.id}
            onSelect={(c) => { setListSelection(null); setSelected(c); setMobileSection("chats"); }}
            onNewChat={openNewConversation}
            batches={batches}
            selectedBatchId={selectedBatchId}
            onSelectBatch={setSelectedBatchId}
            onBatchesChanged={loadBatches}
            onPreferenceChange={handlePreferenceChange}
            selectedConversation={listSelection}
            onSelectedConversationChange={setListSelection}
            onAvatarPress={handleAvatarQuickView}
            listScrollRef={listScrollRef}
          />
        </div>
        <main className={`${selected ? "flex" : "hidden md:flex"} min-h-0 flex-1 flex-col overflow-hidden`}>
          <ChatWindow
            conversation={selected}
            messages={messages}
            onSendMessage={handleSendMessage}
            onPatchMessage={patchMessage}
            typingUsers={(selected && typingUsers[selected.id]) || {}}
            onlineUsers={onlineUsers}
            lastSeenByUser={lastSeenByUser}
            sendTyping={sendTyping}
            onBack={() => setSelected(null)}
          />
        </main>
      </div>

      {!selected && (
        <button
          type="button"
          onClick={openNewConversation}
          data-testid="new-chat-fab"
          className={`fixed z-30 h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-emerald-900 hover:bg-emerald-950 text-white shadow-lg flex items-center justify-center right-[max(1rem,calc(1rem+env(safe-area-inset-right,0px)))] sm:right-[max(1.5rem,calc(1.5rem+env(safe-area-inset-right,0px)))] ${
            showMobileFooter && (isClient || isEmployee)
              ? "bottom-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] md:bottom-[max(1rem,calc(1rem+env(safe-area-inset-bottom,0px)))]"
              : "bottom-[max(1rem,calc(1rem+env(safe-area-inset-bottom,0px)))] sm:bottom-[max(1.5rem,calc(1.5rem+env(safe-area-inset-bottom,0px)))]"
          }`}
          title="New chat"
        >
          <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
      )}

      {isClient && (
        <PanelBottomNav
          hidden={!showMobileFooter}
          testId="client-bottom-nav"
          items={[
            {
              id: "chats",
              label: "Chats",
              icon: MessageSquare,
              active: mobileSection === "chats",
              badge: unreadTotal,
              testId: "client-nav-chats",
              onClick: () => { setListSelection(null); setMobileSection("chats"); },
            },
            {
              id: "diet",
              label: "My Diet",
              icon: UtensilsCrossed,
              active: mobileSection === "diet",
              testId: "client-nav-diet",
              onClick: () => {
                if (listScrollRef.current) saveChatListScroll(listScrollRef.current.scrollTop);
                navigate(dietPlanPath("client"), { state: { backTo: "/chat", startFromDayOne: true } });
              },
            },
            {
              id: "settings",
              label: "Settings",
              icon: Settings,
              active: mobileSection === "settings",
              testId: "client-nav-settings",
              onClick: () => {
                if (listScrollRef.current) saveChatListScroll(listScrollRef.current.scrollTop);
                navigate(profilePath("client"));
              },
            },
          ]}
        />
      )}

      {isEmployee && (
        <PanelBottomNav
          hidden={!showMobileFooter}
          testId="employee-bottom-nav"
          items={[
            {
              id: "chats",
              label: "Chats",
              icon: MessageSquare,
              active: mobileSection === "chats",
              badge: unreadTotal,
              testId: "employee-nav-chats",
              onClick: () => { setListSelection(null); setMobileSection("chats"); },
            },
            {
              id: "batches",
              label: "Batches",
              icon: Layers,
              active: mobileSection === "batches",
              testId: "employee-nav-batches",
              onClick: () => {
                setMobileSection("batches");
                document.querySelector("[data-testid='batch-boards']")?.scrollIntoView({ behavior: "smooth" });
              },
            },
            {
              id: "settings",
              label: "Settings",
              icon: Settings,
              active: mobileSection === "settings",
              testId: "employee-nav-settings",
              onClick: () => {
                if (listScrollRef.current) saveChatListScroll(listScrollRef.current.scrollTop);
                navigate(profilePath("employee"));
              },
            },
          ]}
        />
      )}

      <ProfileQuickView
        open={!!quickView}
        name={quickView?.user?.full_name}
        avatarUrl={quickView?.user?.avatar_url}
        status={quickView?.user?.status}
        online={!!onlineUsers[quickView?.user?.id]}
        onClose={() => setQuickView(null)}
        onChat={() => {
          const c = quickView?.conv;
          setQuickView(null);
          if (c) { setListSelection(null); setSelected(c); }
        }}
        onInfo={() => {
          const { conv, user: u } = quickView || {};
          setQuickView(null);
          openUserProfile(u, conv);
        }}
      />

      {user?.role === "client" && (
        <ComplaintDialog open={complaintOpen} onOpenChange={setComplaintOpen} />
      )}
    </div>
  );
}
