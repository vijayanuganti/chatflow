import React, { useEffect, useRef, useState } from "react";
import { Paperclip, Send, Loader2, Eye, ArrowLeft, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Avatar from "./Avatar";
import MessageBubble from "./MessageBubble";
import { toast } from "sonner";

export default function ChatWindow({
  conversation,
  messages,
  onSendMessage,
  typingUsers, // Map of userId -> name for users currently typing (excluding self)
  onlineUsers,
  usersMap,     // map id -> user (for admin view & group)
  sendTyping,
  readOnly = false,
  onBack,
}) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typingUsers]);

  const handleTyping = (value) => {
    setText(value);
    if (readOnly || !conversation || !sendTyping) return;
    sendTyping(conversation.id, true);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(conversation.id, false);
    }, 1500);
  };

  const handleSendText = async () => {
    if (!text.trim() || sending || !conversation) return;
    setSending(true);
    try {
      await onSendMessage({
        conversation_id: conversation.id,
        content: text.trim(),
        message_type: "text",
      });
      setText("");
      if (sendTyping) sendTyping(conversation.id, false);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !conversation) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post("/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await onSendMessage({
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
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center chat-bg" data-testid="no-conversation-placeholder">
        <div className="text-center max-w-sm p-8">
          <div className="mx-auto h-20 w-20 rounded-2xl bg-white shadow-sm flex items-center justify-center mb-4 border border-gray-100">
            <Send className="h-9 w-9 text-emerald-800" strokeWidth={1.3} />
          </div>
          <h3 className="font-display text-2xl font-semibold mb-1">Your conversations</h3>
          <p className="text-gray-500 text-sm">Select a chat on the left, or start a new one.</p>
        </div>
      </div>
    );
  }

  const isGroup = conversation.type === "group";
  const otherUser = isGroup ? null : conversation.other_user;
  const isOnline = otherUser ? !!onlineUsers[otherUser.id] : false;

  // Header
  const headerName = isGroup ? conversation.name : otherUser?.full_name;
  const headerSub = (() => {
    if (readOnly) return "Admin read-only view";
    if (isGroup) return `${conversation.participants.length} members`;
    return isOnline ? "Online" : (otherUser?.status ? `Last seen · ${otherUser.status}` : "Offline");
  })();

  // Typing indicator text — all users currently typing (excluding self)
  const typingArr = Object.entries(typingUsers || {}).filter(([uid]) => uid !== user.id);
  const typingText = typingArr.length === 1
    ? `${typingArr[0][1]} is typing`
    : typingArr.length > 1
      ? `${typingArr.map(([, n]) => n).join(", ")} are typing`
      : null;

  // For read-receipts in groups
  const totalRecipients = isGroup ? (conversation.participants?.length || 1) - 1 : 1;
  const showSenderNames = isGroup || readOnly;

  return (
    <div className="flex-1 flex flex-col chat-bg h-full" data-testid="chat-window">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur-xl border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
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
          <div className="font-display font-semibold truncate flex items-center gap-2" data-testid="chat-header-name">
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
          <div className="text-xs text-gray-500 truncate">{headerSub}</div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-2" data-testid="messages-container">
        {messages.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-10" data-testid="empty-messages">
            No messages yet. {readOnly ? "Conversation is quiet." : "Say hi!"}
          </div>
        )}
        {messages.map((m) => {
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
              key={m.id}
              message={m}
              mine={mine}
              showSenderName={showSenderNames}
              totalRecipients={totalRecipients}
              showReceipts={!readOnly}
            />
          );
        })}
        {typingText && (
          <div className="flex items-end gap-2" data-testid="typing-indicator">
            <div className="bubble-received px-3 py-2 shadow-sm flex items-center gap-2">
              <span className="text-xs text-gray-500">{typingText}</span>
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      {!readOnly && (
        <div className="bg-white border-t border-gray-200 p-3 md:pr-52 sticky bottom-0">
          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={handleFile}
              data-testid="chat-file-input"
              accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
            />
            <Button size="icon" variant="ghost" className="rounded-full text-gray-500 hover:text-emerald-900" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="chat-attach-btn" title="Attach file">
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" strokeWidth={1.5} />}
            </Button>
            <Textarea
              value={text}
              onChange={(e) => handleTyping(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Type a message"
              rows={1}
              data-testid="chat-input"
              className="flex-1 resize-none min-h-[44px] max-h-32 rounded-2xl bg-gray-50 border-gray-200"
            />
            <Button size="icon" onClick={handleSendText} disabled={!text.trim() || sending} data-testid="chat-send-btn" className="rounded-full bg-emerald-900 hover:bg-emerald-950 h-10 w-10">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
