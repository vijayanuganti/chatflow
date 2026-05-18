import React, { useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Avatar from "@/components/Avatar";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

function conversationLabel(c) {
  if (c.type === "group") return c.name || "Group";
  return c.other_user?.full_name || "Chat";
}

function lastPreview(c) {
  const t = (c.last_message || "").trim();
  if (!t) return "No messages yet";
  return t.length > 60 ? `${t.slice(0, 60)}…` : t;
}

export default function ForwardModal({
  open,
  onOpenChange,
  messages = [],
  conversations = [],
  currentConversationId,
  onDone,
}) {
  const [q, setQ] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [sending, setSending] = useState(false);

  const targets = useMemo(() => {
    const list = (conversations || []).filter((c) => c.id && c.id !== currentConversationId);
    const query = q.trim().toLowerCase();
    if (!query) return list;
    return list.filter((c) => conversationLabel(c).toLowerCase().includes(query));
  }, [conversations, currentConversationId, q]);

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const close = () => {
    if (sending) return;
    setSelectedIds(new Set());
    setQ("");
    onOpenChange(false);
  };

  const handleSend = async () => {
    const msgs = (messages || []).filter(Boolean);
    if (msgs.length === 0 || selectedIds.size === 0) return;
    setSending(true);
    try {
      const convIds = [...selectedIds];
      for (const conversation_id of convIds) {
        for (const msg of msgs) {
          await api.post("/messages", {
            conversation_id,
            content: msg.content || "",
            message_type: msg.message_type || "text",
            file_url: msg.file_url || undefined,
            file_name: msg.file_name || undefined,
            is_forwarded: true,
          });
        }
      }
      toast.success(`Forwarded to ${convIds.length} chat${convIds.length === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      setQ("");
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      data-testid="forward-modal"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 dark:bg-black/60"
        aria-label="Close"
        onClick={close}
      />
      <div className="relative flex max-h-[85dvh] flex-col rounded-t-2xl bg-white shadow-xl dark:bg-gray-950">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <h2 className="flex-1 font-display text-base font-semibold text-gray-900 dark:text-gray-100">
            Forward to…
          </h2>
          <button
            type="button"
            onClick={close}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 touch-manipulation"
            aria-label="Close"
            data-testid="forward-modal-close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-4 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search conversations"
              className="h-10 rounded-xl pl-9"
              data-testid="forward-search"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {targets.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No conversations found.</p>
          ) : (
            targets.map((c) => {
              const checked = selectedIds.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left touch-manipulation ${
                    checked ? "bg-emerald-50 dark:bg-emerald-500/10" : "hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                  data-testid={`forward-target-${c.id}`}
                >
                  <Avatar name={conversationLabel(c)} avatarUrl={c.other_user?.avatar_url} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium dark:text-gray-100">{conversationLabel(c)}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{lastPreview(c)}</p>
                  </div>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      checked ? "border-emerald-600 bg-emerald-600" : "border-gray-300 dark:border-gray-600"
                    }`}
                    aria-hidden
                  />
                </button>
              );
            })
          )}
        </div>
        <div className="shrink-0 border-t border-gray-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-gray-800">
          <Button
            className="w-full rounded-full bg-emerald-900 hover:bg-emerald-950"
            disabled={selectedIds.size === 0 || sending}
            onClick={() => void handleSend()}
            data-testid="forward-submit"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
