import React from "react";
import { ArrowLeft, Star } from "lucide-react";
import { fileUrl } from "@/lib/api";
import { messageReplySnippet } from "@/lib/messageReply";
import { Button } from "@/components/ui/button";

function formatDateTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function StarredRow({ item, onSelect }) {
  const isImage = item.message_type === "image" && item.file_url;
  const isVideo = item.message_type === "video" && item.file_url;
  const preview = item.content || messageReplySnippet(item) || "[Media]";

  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      className="flex w-full gap-3 border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900/80 touch-manipulation"
      data-testid={`starred-row-${item.id}`}
    >
      {isImage || isVideo ? (
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
          {isImage ? (
            <img src={fileUrl(item.file_url)} alt="" className="h-full w-full object-cover" />
          ) : (
            <video src={fileUrl(item.file_url)} className="h-full w-full object-cover" muted playsInline />
          )}
        </div>
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
          <Star className="h-5 w-5 fill-current" strokeWidth={1.5} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 truncate">
          {item.sender_name || "User"}
        </p>
        <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2 mt-0.5">{preview}</p>
        <p className="text-[11px] text-gray-500 mt-1">{formatDateTime(item.starred_at || item.created_at)}</p>
      </div>
    </button>
  );
}

export default function StarredMessagesPanel({
  open,
  items,
  loading,
  onBack,
  onSelectMessage,
}) {
  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col bg-white dark:bg-gray-950"
      data-testid="starred-messages-panel"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-3 py-2.5 dark:border-gray-800">
        <Button
          size="icon"
          variant="ghost"
          className="rounded-full shrink-0"
          onClick={onBack}
          data-testid="starred-messages-back"
          aria-label="Back to chat"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="font-display font-semibold text-sm sm:text-base dark:text-gray-100">Starred Messages</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-center text-sm text-gray-500 py-12">Loading…</p>
        ) : items.length === 0 ? (
          <p
            className="text-center text-sm text-gray-500 dark:text-gray-400 py-16 px-6"
            data-testid="starred-messages-empty"
          >
            No starred messages yet.
          </p>
        ) : (
          items.map((item) => (
            <StarredRow key={item.id} item={item} onSelect={onSelectMessage} />
          ))
        )}
      </div>
    </div>
  );
}
