import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NO_SELECT_STYLE } from "@/lib/noSelectStyles";
import {
  Search,
  Plus,
  Users as UsersIcon,
  LayoutGrid,
  Pin,
  Archive,
  VolumeX,
  Volume2,
  Phone,
  ChevronLeft,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Avatar from "./Avatar";
import { useAuth } from "@/context/AuthContext";
import { partitionConversations } from "@/lib/conversationPreferences";
import { loadChatListScroll, saveChatListScroll } from "@/lib/chatListScroll";
import { hapticSelectionStart } from "@/lib/selectionHaptics";
import ComposeIcon from "@/components/icons/ComposeIcon";
import { getLastMsgPreview, LastMessageTicks, isUnreadMissedCall } from "@/lib/chatListPreview";

function formatLastTime(iso, t) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
  if (yesterday) return t("sidebar.yesterday");
  return d.toLocaleDateString();
}

function ConversationRow({
  c,
  adminView,
  onlineUsers,
  activeChatId,
  selectionModeId,
  onOpenChat,
  onLongPressSelect,
  onAvatarPress,
  readOnlyPrefs,
  currentUserId,
}) {
  const { t } = useTranslation();
  const longPressRef = useRef(null);
  const didLongPressRef = useRef(false);
  const isGroup = c.type === "group";
  const other = adminView ? null : c.other_user;
  const unreadCount = Number(c.unread_count || 0);
  const title = isGroup
    ? c.name
    : adminView
      ? (c.participants_info || []).map((p) => p?.full_name || "?").join(" ↔ ")
      : (other?.full_name || t("common.unknown"));
  const isOnline = adminView || isGroup ? false : !!(onlineUsers[other?.id] || other?.online);
  const missedCallUnread = !adminView && currentUserId ? isUnreadMissedCall(c, currentUserId) : false;
  const outgoingNoAnswer =
    !adminView &&
    currentUserId &&
    c.last_message_type === "call" &&
    c.last_message_call_subtype === "call_missed" &&
    String(c.last_message_sender_id) === String(currentUserId);
  const isSelectionHighlight = selectionModeId === c.id;
  const isActiveChat = activeChatId === c.id;

  const handlePointerDown = (e) => {
    if (readOnlyPrefs) return;
    didLongPressRef.current = false;
    clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      void hapticSelectionStart();
      onLongPressSelect?.(c);
    }, 480);
  };

  const clearPress = () => clearTimeout(longPressRef.current);

  const handleRowClick = () => {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    onOpenChat(c);
  };

  const handleAvatarClick = (e) => {
    e.stopPropagation();
    clearPress();
    if (isGroup || adminView) return;
    onAvatarPress?.(c, other);
  };

  return (
    <div
      className={`chat-list-row w-full text-left px-4 py-3 flex gap-3 items-center border-b border-gray-50 dark:border-gray-800/60 transition-colors duration-200 ease-out ${
        isSelectionHighlight
          ? "bg-emerald-200/70 dark:bg-emerald-800/55 ring-1 ring-inset ring-emerald-500/35"
          : isActiveChat
            ? "bg-emerald-50 dark:bg-emerald-900/30"
            : "hover:bg-gray-50 dark:hover:bg-gray-900/50"
      }`}
      data-testid={`conversation-item-${c.id}`}
      style={NO_SELECT_STYLE}
    >
      <button
        type="button"
        onClick={handleRowClick}
        onPointerDown={handlePointerDown}
        onPointerUp={clearPress}
        onPointerLeave={clearPress}
        onPointerCancel={clearPress}
        className="flex flex-1 gap-3 items-center min-w-0 text-left touch-manipulation"
      >
        {isGroup ? (
          <div className="h-11 w-11 rounded-full bg-emerald-100 text-emerald-900 flex items-center justify-center shrink-0">
            <UsersIcon className="h-5 w-5" strokeWidth={1.5} />
          </div>
        ) : (
          <button
            type="button"
            onClick={handleAvatarClick}
            className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            data-testid={`conv-avatar-${c.id}`}
            aria-label={t("sidebar.viewProfile", { name: title })}
          >
            <Avatar
              name={title}
              avatarUrl={other?.avatar_url}
              online={adminView ? undefined : isOnline}
              status={adminView ? undefined : other?.status}
              size={44}
            />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`font-medium truncate flex items-center gap-1.5 ${unreadCount > 0 ? "text-gray-950 dark:text-white" : "text-gray-900 dark:text-gray-100"}`}>
              {c.is_pinned && <Pin className="h-3 w-3 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden />}
              {title}
              {c.is_muted && (
                <VolumeX className="h-3.5 w-3.5 text-gray-400 shrink-0" data-testid={`conv-muted-${c.id}`} aria-label={t("sidebar.mutedAria")} />
              )}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {missedCallUnread ? (
                <span
                  className="h-5 w-5 rounded-full bg-rose-500/15 text-rose-500 flex items-center justify-center"
                  data-testid={`conv-missed-call-${c.id}`}
                  aria-label="Missed call"
                >
                  <Phone className="h-3 w-3" strokeWidth={2} />
                </span>
              ) : unreadCount > 0 ? (
                <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-emerald-600 text-white text-[10px] font-semibold flex items-center justify-center">
                  {unreadCount > 99 ? t("common.badgeOverflow") : unreadCount}
                </span>
              ) : null}
              <span className={`text-[11px] ${unreadCount > 0 ? "text-emerald-700 dark:text-emerald-300 font-medium" : "text-gray-400"}`}>
                {formatLastTime(c.last_message_at, t)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-sm min-w-0">
            {!adminView && currentUserId ? (
              <span className="shrink-0 flex items-center">
                <LastMessageTicks conv={c} currentUserId={currentUserId} />
              </span>
            ) : null}
            <span
              className={`truncate ${
                missedCallUnread
                  ? "text-rose-600 dark:text-rose-400 font-medium"
                  : outgoingNoAnswer
                    ? "text-amber-600 dark:text-amber-400 font-medium"
                    : unreadCount > 0
                      ? "text-gray-800 dark:text-gray-200 font-medium"
                      : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {getLastMsgPreview(c, currentUserId) || (adminView ? t("sidebar.monitoring") : t("sidebar.sayHello"))}
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}

function SelectionActionBar({ conversation, selectionCount = 1, onClear, onPreferenceChange }) {
  const { t } = useTranslation();
  if (!conversation) return null;
  const run = (patch) => onPreferenceChange?.(conversation.id, patch);
  const countLabel = selectionCount === 1
    ? t("common.selectedOne")
    : t("common.selected", { count: selectionCount });

  return (
    <div
      className="flex items-center gap-0.5 px-2 py-2 bg-emerald-900 text-white min-h-[58px]"
      data-testid="chat-list-selection-bar"
      role="toolbar"
      aria-label={t("sidebar.conversationSelection")}
    >
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-10 w-10 shrink-0 rounded-full text-white hover:bg-white/15 touch-manipulation"
        onClick={onClear}
        data-testid="chat-list-selection-clear"
        aria-label={t("sidebar.clearSelection")}
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <span className="flex-1 text-sm font-medium truncate px-1 tabular-nums" data-testid="chat-list-selection-count">
        {countLabel}
      </span>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={`h-10 w-10 rounded-full hover:bg-white/15 ${conversation.is_pinned ? "text-amber-300" : "text-white"}`}
        onClick={() => run({ is_pinned: !conversation.is_pinned })}
        data-testid="selection-action-pin"
        title={conversation.is_pinned ? t("sidebar.unpin") : t("sidebar.pin")}
      >
        <Pin className="h-5 w-5" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={`h-10 w-10 rounded-full hover:bg-white/15 ${conversation.is_muted ? "text-rose-300" : "text-white"}`}
        onClick={() => run({ is_muted: !conversation.is_muted })}
        data-testid="selection-action-mute"
        title={conversation.is_muted ? t("sidebar.unmute") : t("sidebar.mute")}
      >
        {conversation.is_muted ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-10 w-10 rounded-full text-white hover:bg-white/15"
        onClick={() => run({ is_archived: !conversation.is_archived })}
        data-testid="selection-action-archive"
        title={conversation.is_archived ? t("sidebar.unarchive") : t("sidebar.archive")}
      >
        <Archive className="h-5 w-5" />
      </Button>
    </div>
  );
}

export default function ChatSidebar({
  conversations,
  isLoading = false,
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
  selectedConversation = null,
  onSelectedConversationChange,
  onAvatarPress,
  listScrollRef: externalListScrollRef,
  clientHomeList = false,
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const internalListRef = useRef(null);
  const listRef = externalListScrollRef || internalListRef;

  const activeList = useMemo(
    () => partitionConversations(conversations, { archived: false }),
    [conversations],
  );
  const archivedList = useMemo(
    () => partitionConversations(conversations, { archived: true }),
    [conversations],
  );

  const sourceList = showArchived ? archivedList : activeList;
  const inSelectionMode = !!selectedConversation && !readOnlyPrefs;

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

  const showBatches = !adminView && user?.role === "employee" && !showArchived && !clientHomeList;

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const saved = loadChatListScroll();
    if (saved > 0) el.scrollTop = saved;
  }, [listRef]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    let t;
    const onScroll = () => {
      clearTimeout(t);
      t = setTimeout(() => saveChatListScroll(el.scrollTop), 120);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      clearTimeout(t);
    };
  }, [listRef]);

  const clearSelection = () => onSelectedConversationChange?.(null);

  return (
    <aside
      className={`chat-sidebar flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-white dark:border-gray-800 dark:bg-gray-950 md:h-full md:w-80 md:flex-none lg:w-96 ${
        clientHomeList ? "border-r-0" : "border-r border-gray-200"
      }`}
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
              {t("sidebar.batchBoards")}
            </div>
            <div className="text-[10px] text-gray-400" title={t("sidebar.managedByAdmin")}>
              {t("sidebar.managedByAdmin")}
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
              {t("sidebar.all")}
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
              >
                {b.name} <span className="text-[10px] opacity-80">({b.client_count || 0})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!clientHomeList && !adminView && archivedList.length > 0 && (
        <div className="px-3 pt-2 border-b border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="flex w-full items-center gap-2 text-xs font-medium text-emerald-800 dark:text-emerald-300 py-2"
            data-testid="archived-chats-toggle"
          >
            {showArchived ? <ChevronLeft className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {showArchived ? t("sidebar.backToChats") : t("sidebar.archivedCount", { count: archivedList.length })}
          </button>
        </div>
      )}

      {!clientHomeList && (
      <div className="shrink-0 border-b border-gray-100 dark:border-gray-800">
        {inSelectionMode ? (
          <SelectionActionBar
            conversation={selectedConversation}
            selectionCount={1}
            onClear={clearSelection}
            onPreferenceChange={onPreferenceChange}
          />
        ) : (
          <div className="p-3" data-testid="chat-search-slot">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <Input
                data-testid="chat-search-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={showArchived ? t("sidebar.searchArchived") : t("sidebar.searchConversations")}
                className="pl-9 h-10 rounded-xl bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                type="search"
              />
            </div>
          </div>
        )}
      </div>
      )}

      {showArchived && !inSelectionMode && (
        <div className="px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-gray-400 border-b border-gray-50 dark:border-gray-800">
          {t("sidebar.archivedSection")}
        </div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto" data-testid="chat-list-scroll">
        {isLoading ? (
          <div
            className="flex flex-col items-center justify-center gap-2 p-8 text-center text-gray-400 text-sm"
            data-testid="chat-list-loading"
          >
            <Loader2 className="h-5 w-5 animate-spin text-emerald-800 dark:text-emerald-300" aria-hidden />
            <span>{t("sidebar.loadingConversations")}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm" data-testid="no-conversations">
            {showArchived ? t("sidebar.noArchived") : t("sidebar.noConversations")}
            {!adminView && !showArchived && !inSelectionMode && (
              <div className="mt-3">
                <Button onClick={onNewChat} variant="outline" className="rounded-full" data-testid="empty-state-new-chat-btn" title={t("chat.newChat")}>
                  <ComposeIcon className="mr-1.5" width={18} height={18} /> {t("sidebar.startChat")}
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
              activeChatId={selectedId}
              selectionModeId={selectedConversation?.id}
              onOpenChat={onSelect}
              onLongPressSelect={readOnlyPrefs ? undefined : onSelectedConversationChange}
              onAvatarPress={onAvatarPress}
              readOnlyPrefs={readOnlyPrefs}
              currentUserId={user?.id}
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
