import React, { useEffect, useState, useCallback, useRef } from "react";
import ChatSidebar from "@/components/ChatSidebar";
import ChatWindow from "@/components/ChatWindow";
import NewChatDialog from "@/components/NewChatDialog";
import ProfileDialog from "@/components/ProfileDialog";
import CreateAccountDialog from "@/components/CreateAccountDialog";
import ComplaintDialog from "@/components/ComplaintDialog";
import TopBar from "@/components/TopBar";
import useChatSocket from "@/hooks/useChatSocket";
import useDoubleBackToExit from "@/hooks/useDoubleBackToExit";
import useMobileChatViewport from "@/hooks/useMobileChatViewport";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  ensureNotificationPermission,
  showAppNotification,
} from "@/lib/notify";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function ChatApp() {
  useMobileChatViewport();
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [lastSeenByUser, setLastSeenByUser] = useState({});
  const [typingUsers, setTypingUsers] = useState({}); // convId -> {userId: name}
  const selectedIdRef = useRef(null);
  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null;
  }, [selected?.id]);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [batches, setBatches] = useState([]);
  const canCreateAccounts =
    user?.role === "admin" ||
    (user?.role === "employee" && !!user?.account_creation_access);

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

  const loadMessages = useCallback(async (convId) => {
    try {
      const res = await api.get(`/conversations/${convId}/messages`);
      setMessages(res.data);
      api.post(`/conversations/${convId}/read`).catch(() => {});
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => { loadBatches(); }, [loadBatches]);

  useEffect(() => {
    if (selected) loadMessages(selected.id);
    else setMessages([]);
  }, [selected, loadMessages]);

  useEffect(() => {
    if (!selected?.id) return;
    setConversations((prev) => prev.map((c) => (
      c.id === selected.id ? { ...c, unread_count: 0 } : c
    )));
  }, [selected?.id]);

  const maybeNotify = useCallback((msg) => {
    if (!msg) return;
    // Only notify if I'm a recipient
    if (!Array.isArray(msg.recipient_ids) || !msg.recipient_ids.includes(user.id)) return;
    // If the user is already looking at this conversation, no popup needed.
    if (document.visibilityState === "visible" && selectedIdRef.current === msg.conversation_id) return;

    const sender = msg.sender_name || "Someone";
    const preview = msg.message_type === "text"
      ? (msg.content || "")
      : `[${msg.message_type}]`;
    const title = msg.conversation_type === "group"
      ? `${sender} (group)`
      : sender;
    showAppNotification({
      title,
      body: preview,
      tag: `conv-${msg.conversation_id}`,
      url: "/chat",
      data: { conversation_id: msg.conversation_id },
    });
  }, [user.id]);

  const handleIncomingMessage = useCallback((msg) => {
    maybeNotify(msg);
    const activeId = selectedIdRef.current;
    setMessages((prev) => {
      if (activeId && msg.conversation_id === activeId) {
        if (prev.some((m) => m.id === msg.id)) return prev;
        // If this is the server echo of one of MY messages and a pending
        // optimistic copy exists, replace the optimistic copy in place rather
        // than appending a duplicate. We match by sender + type + content +
        // file_url within a small window so reorderings don't sneak in.
        if (msg.sender_id === user.id) {
          const idx = prev.findIndex((m) => (
            m.__pending &&
            m.conversation_id === msg.conversation_id &&
            m.message_type === msg.message_type &&
            (m.content || "") === (msg.content || "") &&
            (m.file_url || "") === (msg.file_url || "")
          ));
          if (idx !== -1) {
            const next = prev.slice();
            next[idx] = msg;
            return next;
          }
        }
        if ((msg.recipient_ids || []).includes(user.id)) {
          api.post(`/conversations/${activeId}/read`).catch(() => {});
        }
        return [...prev, msg];
      }
      return prev;
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
  }, [user.id, loadConversations, maybeNotify]);

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
      setMessages((prev) => prev.map((m) => {
        if (m.sender_id === user.id && !(m.read_by || []).includes(data.reader_id)) {
          return { ...m, read_by: [...(m.read_by || []), data.reader_id] };
        }
        return m;
      }));
    }
  }, [user.id]);

  const { sendTyping: wsSendTyping } = useChatSocket({
    onMessage: handleIncomingMessage,
    onTyping: handleTyping,
    onPresence: handlePresence,
    onReadReceipt: handleReadReceipt,
    enabled: Boolean(user?.id),
  });

  // Ask once for OS notification permission so Chrome can surface them like
  // any other app would. Result is cached by the browser per origin.
  useEffect(() => {
    ensureNotificationPermission();
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

  /**
   * Send a message optimistically (WhatsApp-style).
   *
   * Behaviour:
   *  - Immediately append a placeholder message with `__pending: true` so the
   *    user sees the bubble straight away (with a clock icon).
   *  - Update the sidebar preview right away.
   *  - Fire the POST in the background. On success replace the placeholder
   *    (matched by `__tempId`) with the canonical message returned by the
   *    server. If the WebSocket echo arrives first, `handleIncomingMessage`
   *    already replaces the temp.
   *  - On failure we keep the bubble in place but mark it `__error: true` so
   *    the bubble shows an error indicator, plus a toast for context.
   */
  const handleSendMessage = (body) => {
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();
    const conv = conversations.find((c) => c.id === body.conversation_id);
    const recipientIds = conv
      ? (conv.participants || []).filter((p) => p !== user.id)
      : [];
    const optimistic = {
      id: tempId,
      __tempId: tempId,
      __pending: true,
      conversation_id: body.conversation_id,
      conversation_type: conv?.type,
      sender_id: user.id,
      sender_name: user.full_name,
      content: body.content || "",
      message_type: body.message_type,
      file_url: body.file_url,
      file_name: body.file_name,
      created_at: nowIso,
      read_by: [user.id],
      recipient_ids: recipientIds,
    };

    if (selectedIdRef.current === body.conversation_id) {
      setMessages((prev) => [...prev, optimistic]);
    }

    setConversations((prev) => {
      const preview = optimistic.content || `[${optimistic.message_type}]`;
      const previewText = conv?.type === "group"
        ? `${optimistic.sender_name}: ${preview}` : preview;
      const updated = prev.map((c) => c.id === body.conversation_id
        ? { ...c, last_message: previewText, last_message_at: nowIso }
        : c
      );
      updated.sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || ""));
      return updated;
    });

    (async () => {
      try {
        const res = await api.post("/messages", body);
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.__tempId === tempId);
          if (idx === -1) {
            return prev.some((m) => m.id === res.data.id) ? prev : [...prev, res.data];
          }
          const next = prev.slice();
          next[idx] = res.data;
          return next;
        });
        setConversations((prev) => {
          const preview = res.data.content || `[${res.data.message_type}]`;
          const previewText = res.data.conversation_type === "group"
            ? `${res.data.sender_name}: ${preview}` : preview;
          let found = false;
          const updated = prev.map((c) => {
            if (c.id === res.data.conversation_id) {
              found = true;
              return { ...c, last_message: previewText, last_message_at: res.data.created_at };
            }
            return c;
          });
          if (!found) { loadConversations(); return prev; }
          updated.sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || ""));
          return updated;
        });
      } catch (err) {
        toast.error(formatApiError(err));
        setMessages((prev) => prev.map((m) => (
          m.__tempId === tempId ? { ...m, __pending: false, __error: true } : m
        )));
      }
    })();
  };

  const handleStartDirect = async (otherUser) => {
    setNewChatOpen(false);
    try {
      const res = await api.post(`/conversations/start`, { other_user_id: otherUser.id });
      const conv = { ...res.data.conversation, other_user: res.data.other_user, participants_info: [user, res.data.other_user] };
      conv.unread_count = 0;
      setConversations((prev) => prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev]);
      setSelected(conv);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const handleCreateGroup = async ({ name, member_ids }) => {
    try {
      const res = await api.post("/conversations/group", { name, member_ids });
      await loadConversations();
      setNewChatOpen(false);
      // Find the new conv in our list after reload
      setTimeout(() => {
        setSelected((prev) => prev || res.data);
      }, 100);
      setSelected(res.data);
    } catch (err) {
      toast.error(formatApiError(err));
      throw err;
    }
  };

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
    () => conversations.reduce((sum, c) => sum + Number(c.unread_count || 0), 0),
    [conversations]
  );

  useEffect(() => {
    document.title = unreadTotal > 0 ? `(${unreadTotal}) ChatFlow` : "ChatFlow";
  }, [unreadTotal]);

  // System back button: first press while a chat is open returns to the
  // conversation list; otherwise the second press within 2 seconds exits.
  useDoubleBackToExit({
    onBeforeExitBack: () => {
      if (selectedIdRef.current) {
        setSelected(null);
        return true;
      }
      return false;
    },
  });

  return (
    <div
      className="flex w-full min-h-0 flex-col overflow-hidden bg-gray-50 dark:bg-gray-950"
      style={{ height: "var(--visual-vh, 100dvh)" }}
      data-testid="chat-app"
    >
      <div className="shrink-0">
        <TopBar
          onOpenSettings={() => setProfileOpen(true)}
          unreadTotal={unreadTotal}
          onCreateAccount={canCreateAccounts ? () => setCreateAccountOpen(true) : undefined}
          onRaiseComplaint={user?.role === "client" ? () => setComplaintOpen(true) : undefined}
        />
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className={`${selected ? "hidden md:flex" : "flex"} h-full min-h-0 w-full flex-col md:w-auto md:flex-none`}>
          <ChatSidebar
            conversations={filteredConversations}
            onlineUsers={onlineUsers}
            selectedId={selected?.id}
            onSelect={setSelected}
            onNewChat={() => setNewChatOpen(true)}
            batches={batches}
            selectedBatchId={selectedBatchId}
            onSelectBatch={setSelectedBatchId}
            onBatchesChanged={loadBatches}
          />
        </div>
        <main className={`${selected ? "flex" : "hidden md:flex"} min-h-0 flex-1 flex-col overflow-hidden`}>
          <ChatWindow
            conversation={selected}
            messages={messages}
            onSendMessage={handleSendMessage}
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
          onClick={() => setNewChatOpen(true)}
          data-testid="new-chat-fab"
          className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-emerald-900 hover:bg-emerald-950 text-white shadow-lg flex items-center justify-center"
          title="New chat"
        >
          <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
      )}

      <NewChatDialog
        open={newChatOpen}
        onOpenChange={setNewChatOpen}
        onSelectUser={handleStartDirect}
        onCreateGroup={handleCreateGroup}
        onlineUsers={onlineUsers}
      />
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      {canCreateAccounts && (
        <CreateAccountDialog
          open={createAccountOpen}
          onOpenChange={setCreateAccountOpen}
          allowedRoles={user?.role === "admin" ? ["employee", "client"] : ["client"]}
          defaultRole="client"
          onCreated={() => {
            loadConversations();
            loadBatches();
          }}
        />
      )}
      {user?.role === "client" && (
        <ComplaintDialog open={complaintOpen} onOpenChange={setComplaintOpen} />
      )}
    </div>
  );
}
