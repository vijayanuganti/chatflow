import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Avatar from "@/components/Avatar";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

function conversationLabel(c, t) {
  if (c.type === "group") return c.name || t("common.group");
  return c.other_user?.full_name || t("common.chat");
}

export default function ForwardMessageSheet({
  open,
  onOpenChange,
  message,
  conversations = [],
  currentConversationId,
  onDone,
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [sending, setSending] = useState(false);

  const targets = useMemo(() => {
    const list = (conversations || []).filter((c) => c.id && c.id !== currentConversationId);
    const query = q.trim().toLowerCase();
    if (!query) return list;
    return list.filter((c) => conversationLabel(c, t).toLowerCase().includes(query));
  }, [conversations, currentConversationId, q, t]);

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleForward = async () => {
    if (!message || selectedIds.size === 0) return;
    setSending(true);
    try {
      const body = {
        content: message.content || "",
        message_type: message.message_type || "text",
        file_url: message.file_url || undefined,
        file_name: message.file_name || undefined,
      };
      await Promise.all(
        [...selectedIds].map((conversation_id) =>
          api.post("/messages", { ...body, conversation_id }),
        ),
      );
      toast.success(
        selectedIds.size === 1
          ? t("forward.toastOne")
          : t("forward.toastMany", { count: selectedIds.size }),
      );
      setSelectedIds(new Set());
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-gray-100 dark:border-gray-800">
          <SheetTitle className="text-left font-display">{t("forward.title")}</SheetTitle>
        </SheetHeader>
        <div className="px-4 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("forward.search")}
              className="pl-9 h-10 rounded-xl"
              data-testid="forward-search"
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
          {targets.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">{t("forward.empty")}</p>
          ) : (
            targets.map((c) => {
              const checked = selectedIds.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left touch-manipulation ${
                    checked ? "bg-emerald-50 dark:bg-emerald-500/10" : "hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                  data-testid={`forward-target-${c.id}`}
                >
                  <Avatar
                    name={conversationLabel(c, t)}
                    avatarUrl={c.other_user?.avatar_url}
                    size={40}
                  />
                  <span className="flex-1 min-w-0 text-sm font-medium truncate dark:text-gray-100">
                    {conversationLabel(c, t)}
                  </span>
                  <span
                    className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                      checked ? "border-emerald-600 bg-emerald-600" : "border-gray-300 dark:border-gray-600"
                    }`}
                  />
                </button>
              );
            })
          )}
        </div>
        <div className="shrink-0 p-4 border-t border-gray-100 dark:border-gray-800 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button
            className="w-full rounded-full bg-emerald-900 hover:bg-emerald-950"
            disabled={selectedIds.size === 0 || sending}
            onClick={() => void handleForward()}
            data-testid="forward-submit"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : selectedIds.size ? (
              t("forward.buttonCount", { count: selectedIds.size })
            ) : (
              t("forward.button")
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
