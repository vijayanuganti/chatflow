import React, { useState, useMemo } from "react";
import { Search, Plus, LogOut, MessageCircle, Settings, Users as UsersIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Avatar from "./Avatar";
import { useAuth } from "@/context/AuthContext";

function formatLastTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
  if (yesterday) return "Yesterday";
  return d.toLocaleDateString();
}

export default function ChatSidebar({
  conversations,
  onlineUsers,
  selectedId,
  onSelect,
  onNewChat,
  onOpenProfile,
  adminView = false,
}) {
  const { user, logout } = useAuth();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((c) => {
      const names = c.type === "group"
        ? [c.name || ""]
        : (adminView
          ? (c.participants_info || []).map((p) => p?.full_name || "")
          : [c.other_user?.full_name || ""]);
      return names.some((n) => n.toLowerCase().includes(term));
    });
  }, [conversations, q, adminView]);

  return (
    <aside className="h-full w-full md:w-80 lg:w-96 bg-white border-r border-gray-200 flex flex-col" data-testid="chat-sidebar">
      {/* Header / Profile */}
      <div className="p-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={onOpenProfile} data-testid="sidebar-profile-btn" className="shrink-0">
          <Avatar name={user?.full_name} avatarUrl={user?.avatar_url} status={user?.status || "available"} size={40} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold truncate">{user?.full_name}</div>
          <div className="text-xs text-gray-500 capitalize">{user?.role}</div>
        </div>
        {!adminView && (
          <Button size="icon" variant="ghost" onClick={onNewChat} data-testid="new-chat-btn" title="New chat" className="rounded-full">
            <Plus className="h-5 w-5" strokeWidth={1.5} />
          </Button>
        )}
        <Button size="icon" variant="ghost" onClick={onOpenProfile} data-testid="open-settings-btn" title="Profile & settings" className="rounded-full">
          <Settings className="h-5 w-5" strokeWidth={1.5} />
        </Button>
        <Button size="icon" variant="ghost" onClick={logout} data-testid="logout-btn" title="Sign out" className="rounded-full">
          <LogOut className="h-5 w-5" strokeWidth={1.5} />
        </Button>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input data-testid="chat-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations" className="pl-9 bg-gray-50 rounded-xl border-gray-200 h-10" />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm" data-testid="no-conversations">
            No conversations yet.
            {!adminView && (
              <div className="mt-3">
                <Button onClick={onNewChat} variant="outline" className="rounded-full" data-testid="empty-state-new-chat-btn">
                  <Plus className="h-4 w-4 mr-1" /> Start a chat
                </Button>
              </div>
            )}
          </div>
        ) : (
          filtered.map((c) => {
            const isGroup = c.type === "group";
            const other = adminView ? null : c.other_user;
            const title = isGroup
              ? c.name
              : adminView
                ? (c.participants_info || []).map((p) => p?.full_name || "?").join(" ↔ ")
                : (other?.full_name || "Unknown");
            const isOnline = adminView || isGroup ? false : !!onlineUsers[other?.id];
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                data-testid={`conversation-item-${c.id}`}
                className={`w-full text-left px-4 py-3 flex gap-3 items-center hover:bg-gray-50 transition-colors border-b border-gray-50 ${
                  selectedId === c.id ? "bg-emerald-50 hover:bg-emerald-50" : ""
                }`}
              >
                {isGroup ? (
                  <div className="h-11 w-11 rounded-full bg-emerald-100 text-emerald-900 flex items-center justify-center shrink-0">
                    <UsersIcon className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                ) : (
                  <Avatar name={title} avatarUrl={other?.avatar_url} online={adminView ? undefined : isOnline} status={adminView ? undefined : other?.status} size={44} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate text-gray-900">{title}</span>
                    <span className="text-[11px] text-gray-400 shrink-0">{formatLastTime(c.last_message_at)}</span>
                  </div>
                  <div className="text-sm text-gray-500 truncate">
                    {c.last_message || (adminView ? "Monitoring" : "Say hello 👋")}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
      <div className="px-4 py-2 text-[10px] text-gray-400 text-center border-t border-gray-100">
        ChatFlow · © {new Date().getFullYear()} vijay_anuganti
      </div>
    </aside>
  );
}
