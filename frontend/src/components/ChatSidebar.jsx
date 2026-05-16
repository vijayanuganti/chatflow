import React, { useMemo, useRef, useState } from "react";
import {
  Search,
  Plus,
  Users as UsersIcon,
  LayoutGrid,
  Pin,
  Archive,
  VolumeX,
  Volume2,
  MoreHorizontal,
  ChevronLeft,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Avatar from "./Avatar";
import { useAuth } from "@/context/AuthContext";
import { partitionConversations } from "@/lib/conversationPreferences";

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

function ConversationRow({
  c,
  adminView,
  onlineUsers,
  selectedId,
  onSelect,
  onPreferenceChange,
  readOnlyPrefs = false,
}) {
  const longPressRef = useRef(null);
  const isGroup = c.type === "group";
  const other = adminView ? null : c.other_user;
  const unreadCount = Number(c.unread_count || 0);
  const title = isGroup
    ? c.name
    : adminView
      ? (c.participants_info || []).map((p) => p?.full_name || "?").join(" ↔ ")
      : (other?.full_name || "Unknown");
  const isOnline = adminView || isGroup ? false : !!onlineUsers[other?.id];

  const runPref = (patch) => {
    if (readOnlyPrefs || !onPreferenceChange) return;
    onPreferenceChange(c.id, patch);
  };

  const handlePointerDown = () => {
    if (readOnlyPrefs) return;
    clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => {
      const el = document.querySelector(`[data-conv-menu="${c.id}"]`);
      el?.click();
    }, 520);
  };

  const handlePointerUp = () => clearTimeout(longPressRef.current);

  return (
    <div
      className={`w-full text-left px-4 py-3 flex gap-3 items-center transition-colors border-b border-gray-50 dark:border-gray-800/60 group ${
        selectedId === c.id
          ? "bg-emerald-50 dark:bg-emerald-900/30"
          : "hover:bg-gray-50 dark:hover:bg-gray-900/50"
      }`}
      data-testid={`conversation-item-${c.id}`}
    >
      <button
        type="button"
        onClick={() => onSelect(c)}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="flex flex-1 gap-3 items-center min-w-0 text-left"
      >
        {isGroup ? (
          <div className="h-11 w-11 rounded-full bg-emerald-100 text-emerald-900 flex items-center justify-center shrink-0">
            <UsersIcon className="h-5 w-5" strokeWidth={1.5} />
          </div>
        ) : (
          <Avatar
            name={title}
            avatarUrl={other?.avatar_url}
            online={adminView ? undefined : isOnline}
            status={adminView ? undefined : other?.status}
            size={44}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`font-medium truncate flex items-center gap-1.5 ${unreadCount > 0 ? "text-gray-950 dark:text-white" : "text-gray-900 dark:text-gray-100"}`}>
              {c.is_pinned && <Pin className="h-3 w-3 text-emerald-700 dark:text-emerald-400 shrink-0" aria-label="Pinned" />}
              {title}
              {c.is_muted && (
                <VolumeX className="h-3.5 w-3.5 text-gray-400 shrink-0" data-testid={`conv-muted-${c.id}`} aria-label="Muted" />
              )}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {unreadCount > 0 && (
                <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-emerald-600 text-white text-[10px] font-semibold flex items-center justify-center">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
              <span className={`text-[11px] ${unreadCount > 0 ? "text-emerald-700 dark:text-emerald-300 font-medium" : "text-gray-400"}`}>
                {formatLastTime(c.last_message_at)}
              </span>
            </div>
          </div>
          <div className={`text-sm truncate ${unreadCount > 0 ? "text-gray-800 dark:text-gray-200 font-medium" : "text-gray-500 dark:text-gray-400"}`}>
            {c.last_message || (adminView ? "Monitoring" : "Say hello 👋")}
          </div>
        </div>
      </button>

      {!readOnlyPrefs && onPreferenceChange && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 rounded-full opacity-70 sm:opacity-0 sm:group-hover:opacity-100"
              data-conv-menu={c.id}
              data-testid={`conv-actions-${c.id}`}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => runPref({ is_pinned: !c.is_pinned })} data-testid={`conv-pin-${c.id}`}>
              <Pin className="h-4 w-4" /> {c.is_pinned ? "Unpin chat" : "Pin chat"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => runPref({ is_archived: !c.is_archived })} data-testid={`conv-archive-${c.id}`}>
              <Archive className="h-4 w-4" /> {c.is_archived ? "Unarchive chat" : "Archive chat"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => runPref({ is_muted: !c.is_muted })} data-testid={`conv-mute-${c.id}`}>
              {c.is_muted ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {c.is_muted ? "Unmute notifications" : "Mute notifications"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export default function ChatSidebar({
  conversations,
  onlineUsers,
  selectedId,
  onSelect,
  onNewChat,
  adminView = false,
  batches = [],
  selectedBatchId = null,
  onSelectBatch,
  onPreferenceChange,
  readOnlyPrefs = false,
}) {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const activeList = useMemo(
    () => partitionConversations(conversations, { archived: false }),
    [conversations],
  );
  const archivedList = useMemo(
    () => partitionConversations(conversations, { archived: true }),
    [conversations],
  );

  const sourceList = showArchived ? archivedList : activeList;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return sourceList;
    return sourceList.filter((c) => {
      const names = c.type === "group"
        ? [c.name || ""]
        : (adminView
          ? (c.participants_info || []).map((p) => p?.full_name || "")
          : [c.other_user?.full_name || ""]);
      return names.some((n) => n.toLowerCase().includes(term));
    });
  }, [sourceList, q, adminView]);

  const showBatches = !adminView && user?.role === "employee" && !showArchived;

  return (
    <aside
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950 md:h-full md:w-80 md:flex-none lg:w-96"
      data-testid="chat-sidebar"
    >
      <div className="hidden md:flex p-4 border-b border-gray-100 dark:border-gray-800 items-center gap-3">
        <div data-testid="sidebar-profile" className="shrink-0">
          <Avatar name={user?.full_name} avatarUrl={user?.avatar_url} status={user?.status || "available"} size={40} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold truncate dark:text-gray-100">{user?.full_name}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user?.role}</div>
        </div>
      </div>

      {showBatches && (
        <div className="p-3 border-b border-gray-100 dark:border-gray-800" data-testid="batch-boards">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200">
              <LayoutGrid className="h-4 w-4" />
              Batch boards
            </div>
            <div className="text-[10px] text-gray-400" title="Batches are managed by an admin">
              Managed by admin
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => onSelectBatch?.(null)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                !selectedBatchId ? "bg-emerald-900 text-white border-emerald-900" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
              data-testid="batch-chip-all"
            >
              All
            </button>
            {(batches || []).map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => onSelectBatch?.(b.id)}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  selectedBatchId === b.id
                    ? "bg-emerald-900 text-white border-emerald-900"
                    : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
                data-testid={`batch-chip-${b.id}`}
                title={`${b.name} (${b.client_count || 0}/${b.max_clients || 20})`}
              >
                {b.name} <span className="text-[10px] opacity-80">({b.client_count || 0})</span>
              </button>
            ))}
            {(batches || []).length === 0 && (
              <div className="text-xs text-gray-400 py-1">No batches yet.</div>
            )}
          </div>
        </div>
      )}

      {!adminView && archivedList.length > 0 && (
        <div className="px-3 pt-2 border-b border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="flex w-full items-center gap-2 text-xs font-medium text-emerald-800 dark:text-emerald-300 py-2"
            data-testid="archived-chats-toggle"
          >
            {showArchived ? <ChevronLeft className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {showArchived ? "Back to chats" : `Archived chats (${archivedList.length})`}
          </button>
        </div>
      )}

      <div className="p-3 border-b border-gray-100 dark:border-gray-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
          <Input
            data-testid="chat-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={showArchived ? "Search archived" : "Search conversations"}
            className="pl-9 h-10 rounded-xl bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            type="search"
          />
        </div>
      </div>

      {showArchived && (
        <div className="px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-gray-400 border-b border-gray-50 dark:border-gray-800">
          Archived chats
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm" data-testid="no-conversations">
            {showArchived ? "No archived conversations." : "No conversations yet."}
            {!adminView && !showArchived && (
              <div className="mt-3">
                <Button onClick={onNewChat} variant="outline" className="rounded-full" data-testid="empty-state-new-chat-btn">
                  <Plus className="h-4 w-4 mr-1" /> Start a chat
                </Button>
              </div>
            )}
          </div>
        ) : (
          filtered.map((c) => (
            <ConversationRow
              key={c.id}
              c={c}
              adminView={adminView}
              onlineUsers={onlineUsers}
              selectedId={selectedId}
              onSelect={onSelect}
              onPreferenceChange={onPreferenceChange}
              readOnlyPrefs={readOnlyPrefs || adminView}
            />
          ))
        )}
      </div>
      <div className="hidden md:block shrink-0 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 py-2 text-center text-[10px] text-gray-400 dark:text-gray-500">
        ChatFlow · © {new Date().getFullYear()} vijay_anuganti
      </div>
    </aside>
  );
}
