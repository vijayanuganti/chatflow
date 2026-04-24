import React, { useEffect, useState, useCallback } from "react";
import ChatSidebar from "@/components/ChatSidebar";
import ChatWindow from "@/components/ChatWindow";
import NewChatDialog from "@/components/NewChatDialog";
import ProfileDialog from "@/components/ProfileDialog";
import useChatSocket from "@/hooks/useChatSocket";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function ChatApp() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [typingUsers, setTypingUsers] = useState({}); // convId -> {userId: name}
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      const res = await api.get("/conversations");
      setConversations(res.data);
      const online = {};
      res.data.forEach((c) => (c.participants_info || []).forEach((p) => {
        if (p?.id) online[p.id] = !!p.online;
      }));
      setOnlineUsers((prev) => ({ ...online, ...prev }));
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, []);

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

  useEffect(() => {
    if (selected) loadMessages(selected.id);
    else setMessages([]);
  }, [selected, loadMessages]);

  const handleIncomingMessage = useCallback((msg) => {
    setMessages((prev) => {
      if (selected && msg.conversation_id === selected.id) {
        if (prev.some((m) => m.id === msg.id)) return prev;
        if ((msg.recipient_ids || []).includes(user.id)) {
          api.post(`/conversations/${selected.id}/read`).catch(() => {});
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
      const updated = prev.map((c) => c.id === msg.conversation_id
        ? { ...c, last_message: previewText, last_message_at: msg.created_at } : c
      );
      updated.sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || ""));
      return updated;
    });
  }, [selected, user.id, loadConversations]);

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
  }, []);

  const handleReadReceipt = useCallback((data) => {
    if (selected && data.conversation_id === selected.id) {
      setMessages((prev) => prev.map((m) => {
        if (m.sender_id === user.id && !(m.read_by || []).includes(data.reader_id)) {
          return { ...m, read_by: [...(m.read_by || []), data.reader_id] };
        }
        return m;
      }));
    }
  }, [selected, user.id]);

  const { sendTyping: wsSendTyping } = useChatSocket({
    onMessage: handleIncomingMessage,
    onTyping: handleTyping,
    onPresence: handlePresence,
    onReadReceipt: handleReadReceipt,
  });

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

  return (
    <div className="h-screen w-full flex overflow-hidden bg-gray-50" data-testid="chat-app">
      <div className={`${selected ? "hidden md:flex" : "flex"} h-full`}>
        <ChatSidebar
          conversations={conversations}
          onlineUsers={onlineUsers}
          selectedId={selected?.id}
          onSelect={setSelected}
          onNewChat={() => setNewChatOpen(true)}
          onOpenProfile={() => setProfileOpen(true)}
        />
      </div>
      <main className={`${selected ? "flex" : "hidden md:flex"} flex-1 h-full flex-col`}>
        <ChatWindow
          conversation={selected}
          messages={messages}
          onSendMessage={handleSendMessage}
          typingUsers={(selected && typingUsers[selected.id]) || {}}
          onlineUsers={onlineUsers}
          sendTyping={sendTyping}
          onBack={() => setSelected(null)}
        />
      </main>
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
