import React, { useMemo, useState } from "react";
import { Search, Plus, Users as UsersIcon, LayoutGrid, FolderPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Avatar from "./Avatar";
import { useAuth } from "@/context/AuthContext";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

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
  adminView = false,
  batches = [],
  selectedBatchId = null,
  onSelectBatch,
  onBatchesChanged,
}) {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newBatchName, setNewBatchName] = useState("");
  const [creating, setCreating] = useState(false);

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

  const showBatches = !adminView && user?.role === "employee";

  const createBatch = async () => {
    const name = newBatchName.trim();
    if (!name) return toast.error("Batch name required");
    setCreating(true);
    try {
      await api.post("/batches", { name });
      toast.success("Batch created");
      setCreateOpen(false);
      setNewBatchName("");
      onBatchesChanged?.();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <aside className="h-full w-full md:w-80 lg:w-96 bg-white border-r border-gray-200 flex flex-col" data-testid="chat-sidebar">
      {/* Header / Profile */}
      <div className="p-4 border-b border-gray-100 flex items-center gap-3">
        <div data-testid="sidebar-profile" className="shrink-0">
          <Avatar name={user?.full_name} avatarUrl={user?.avatar_url} status={user?.status || "available"} size={40} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold truncate">{user?.full_name}</div>
          <div className="text-xs text-gray-500 capitalize">{user?.role}</div>
        </div>
      </div>

      {/* Batch boards (employee) */}
      {showBatches && (
        <div className="p-3 border-b border-gray-100" data-testid="batch-boards">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
              <LayoutGrid className="h-4 w-4" />
              Batch boards
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setCreateOpen(true)}
              className="rounded-full"
              data-testid="add-batch-btn"
              title="Add batch"
            >
              <FolderPlus className="h-5 w-5" strokeWidth={1.5} />
            </Button>
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
                  selectedBatchId === b.id ? "bg-emerald-900 text-white border-emerald-900" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
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
            const unreadCount = Number(c.unread_count || 0);
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
                    <span className={`font-medium truncate ${unreadCount > 0 ? "text-gray-950" : "text-gray-900"}`}>{title}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {unreadCount > 0 && (
                        <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-emerald-600 text-white text-[10px] font-semibold flex items-center justify-center">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      )}
                      <span className={`text-[11px] ${unreadCount > 0 ? "text-emerald-700 font-medium" : "text-gray-400"}`}>{formatLastTime(c.last_message_at)}</span>
                    </div>
                  </div>
                  <div className={`text-sm truncate ${unreadCount > 0 ? "text-gray-800 font-medium" : "text-gray-500"}`}>
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md max-h-[88dvh] overflow-y-auto p-4 sm:p-6" data-testid="create-batch-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">Create batch</DialogTitle>
            <DialogDescription>Add a new board for your clients.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="batch_name">Batch name</Label>
              <Input
                id="batch_name"
                value={newBatchName}
                onChange={(e) => setNewBatchName(e.target.value)}
                placeholder="Batch 1"
                className="h-11 rounded-xl"
                data-testid="create-batch-name-input"
              />
            </div>
            <Button
              onClick={createBatch}
              disabled={creating}
              className="w-full h-11 rounded-full bg-emerald-900 hover:bg-emerald-950"
              data-testid="create-batch-submit"
            >
              {creating ? "Creating..." : "Create batch"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
