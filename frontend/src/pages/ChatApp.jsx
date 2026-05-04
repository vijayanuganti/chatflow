import React, { useEffect, useState, useCallback, useRef } from "react";
import ChatSidebar from "@/components/ChatSidebar";
import ChatWindow from "@/components/ChatWindow";
import NewChatDialog from "@/components/NewChatDialog";
import ProfileDialog from "@/components/ProfileDialog";
import TopBar from "@/components/TopBar";
import useChatSocket from "@/hooks/useChatSocket";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function ChatApp() {
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
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [batches, setBatches] = useState([]);

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
    if (!("Notification" in window)) return;
    if (document.visibilityState === "visible") return;
    if (Notification.permission !== "granted") return;
    if (!msg) return;
    // Only notify if I'm a recipient
    if (!Array.isArray(msg.recipient_ids) || !msg.recipient_ids.includes(user.id)) return;
    const title = "New message";
    const body = msg.message_type === "text" ? (msg.content || "") : `[${msg.message_type}]`;
    try {
      new Notification(title, { body });
    } catch {
      // ignore
    }
  }, [user.id]);

  const handleIncomingMessage = useCallback((msg) => {
    maybeNotify(msg);
    const activeId = selectedIdRef.current;
    setMessages((prev) => {
      if (activeId && msg.conversation_id === activeId) {
        if (prev.some((m) => m.id === msg.id)) return prev;
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

  // Browser notifications (basic)
  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      // Don't block; ask politely once
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const sendTyping = useCallback((conversationId, isTyping) => {
    wsSendTyping(conversationId, isTyping);
  }, [wsSendTyping]);

  const handleSendMessage = async (body) => {
    const res = await api.post("/messages", body);
    setMessages((prev) => prev.some((m) => m.id === res.data.id) ? prev : [...prev, res.data]);
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
    if (user?.role !== "employee" || !selectedBatchId) return conversations;
    const batch = (batches || []).find((b) => b.id === selectedBatchId);
    if (!batch) return conversations;
    const clientIds = new Set(batch.client_ids || []);
    // Keep group chats always visible
    return conversations.filter((c) => {
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

  return (
    <div className="flex h-dvh w-full min-h-0 flex-col overflow-hidden bg-gray-50" data-testid="chat-app">
      <div className="shrink-0">
        <TopBar onOpenSettings={() => setProfileOpen(true)} unreadTotal={unreadTotal} />
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
    </div>
  );
}
