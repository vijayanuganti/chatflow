import React, { useEffect, useRef, useState } from "react";
import { Paperclip, Send, Loader2, Eye, ArrowLeft, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, formatApiError } from "@/lib/api";
import { formatWhatsAppLastSeen } from "@/lib/datetime";
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
  lastSeenByUser = {},
  usersMap,     // map id -> user (for admin view & group)
  sendTyping,
  readOnly = false,
  onBack,
}) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastTypingPingRef = useRef(0);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typingUsers]);

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
      flushTypingStop();
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
      <div className="chat-bg flex min-h-0 flex-1 items-center justify-center" data-testid="no-conversation-placeholder">
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
    <div className="chat-bg flex h-full min-h-0 flex-1 flex-col overflow-hidden" data-testid="chat-window">
      {/* Header */}
      <div className="z-10 flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white/90 px-3 py-3 backdrop-blur-xl sm:gap-3 sm:px-4">
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
          <div className="font-display font-semibold text-sm sm:text-base truncate flex items-center gap-2" data-testid="chat-header-name">
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
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-4 sm:py-5" data-testid="messages-container">
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
      </div>

      {/* Composer: typing strip stays fixed above input on mobile */}
      {!readOnly && othersTypingCount > 0 && (
        <div
          className="flex shrink-0 items-center gap-1 border-t border-emerald-100/90 bg-emerald-50/95 px-3 py-2 text-xs text-emerald-900/90"
          data-testid="composer-typing-strip"
        >
          <span className="min-w-0 truncate">
            {isGroup ? groupTypingLabel : `${directTypingName || "Someone"} is typing`}
          </span>
          <span className="inline-flex shrink-0 translate-y-px items-center gap-0.5">
            <span className="typing-dot typing-dot-header" />
            <span className="typing-dot typing-dot-header" />
            <span className="typing-dot typing-dot-header" />
          </span>
        </div>
      )}

      {/* Input */}
      {!readOnly && (
        <div className="shrink-0 border-t border-gray-200 bg-white pb-[max(0.625rem,env(safe-area-inset-bottom,0px))] pt-2 sm:pb-3 sm:pt-3">
          <div className="flex items-end gap-2 px-2.5 sm:px-3">
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
              className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border-gray-200 bg-gray-50"
              enterKeyHint="send"
              autoComplete="off"
            />
            <Button size="icon" onClick={handleSendText} disabled={!text.trim() || sending} data-testid="chat-send-btn" className="h-10 w-10 rounded-full bg-emerald-900 hover:bg-emerald-950">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
