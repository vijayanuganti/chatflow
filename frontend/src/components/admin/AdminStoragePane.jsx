import React, { useCallback, useEffect, useState } from "react";
import { Cloud, Database, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import StorageRingCard from "@/components/admin/StorageRingCard";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

const REFRESH_MS = 5 * 60 * 1000;

function formatStatValue(value) {
  if (value == null || value === "") return "0";
  if (typeof value === "number" && Number.isNaN(value)) return "0";
  return String(value);
}

export default function AdminStoragePane({
  allConvs = [],
  onDeleteConversation,
  refreshSignal = 0,
}) {
  const [storage, setStorage] = useState(null);
  const [storageLoading, setStorageLoading] = useState(false);

  const loadStorage = useCallback(async () => {
    setStorageLoading(true);
    try {
      const res = await api.get("/admin/storage");
      setStorage(res.data);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setStorageLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStorage();
  }, [loadStorage, refreshSignal]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadStorage();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [loadStorage]);

  const fetchedAt = storage?.fetched_at;

  const mongoMeta = storage?.database?.error
    ? null
    : `${formatStatValue(storage?.database?.collections)} collections · ${formatStatValue(storage?.database?.objects)} objects`;

  const s3Meta = storage?.object_storage?.error
    ? null
    : storage?.object_storage?.configured
      ? `${storage.object_storage.object_count ?? 0} objects · ${storage.object_storage.prefix || "uploads/"}`
      : "S3 not configured — local disk uploads not counted here";

  return (
    <div className="p-4 sm:p-6 lg:p-10 overflow-y-auto space-y-6" data-testid="admin-storage-pane">
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-800 dark:text-emerald-300">
          Admin · Storage
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold mt-1 dark:text-gray-100">
          Storage & cleanup
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 max-w-2xl text-sm">
          MongoDB Atlas (512 MB) and AWS S3 Standard (5 GB) capacity versus current usage.
        </p>
      </div>

      {storageLoading && !storage && (
        <div className="py-12 text-center text-sm text-gray-400 dark:text-gray-500 flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading storage…
        </div>
      )}

      {storage && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
          <StorageRingCard
            title={storage.database?.provider || "MongoDB Atlas"}
            subtitle={storage.database?.capacity_label || "512 MB"}
            totalLabel={storage.database?.capacity_label || "512 MB"}
            icon={Database}
            usedBytes={storage.database?.used_bytes}
            quotaBytes={storage.database?.quota_bytes}
            freeBytes={storage.database?.free_bytes}
            percentUsed={storage.database?.percent_used}
            error={storage.database?.error}
            metaLine={mongoMeta}
            lastUpdated={fetchedAt}
            onRefresh={() => void loadStorage()}
            refreshing={storageLoading}
            testId="storage-ring-mongodb"
          />
          <StorageRingCard
            title={storage.object_storage?.provider || "Amazon Web Services (AWS) S3"}
            subtitle={
              storage.object_storage?.storage_class
                ? `${storage.object_storage.storage_class} · ${storage.object_storage?.capacity_label || "5 GB"}`
                : storage.object_storage?.capacity_label || "5 GB"
            }
            totalLabel={storage.object_storage?.capacity_label || "5 GB"}
            icon={Cloud}
            usedBytes={storage.object_storage?.used_bytes}
            quotaBytes={storage.object_storage?.quota_bytes}
            freeBytes={storage.object_storage?.free_bytes}
            percentUsed={storage.object_storage?.percent_used}
            error={storage.object_storage?.error}
            metaLine={s3Meta}
            lastUpdated={fetchedAt}
            onRefresh={() => void loadStorage()}
            refreshing={storageLoading}
            testId="storage-ring-s3"
          />
        </div>
      )}

      <div className="rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 p-4 sm:p-6 space-y-4 max-w-4xl">
        <div className="flex items-center gap-2 text-rose-900 dark:text-rose-200 font-display font-semibold">
          <Trash2 className="h-5 w-5" />
          Free space — delete data
        </div>
        <p className="text-sm text-rose-900/90 dark:text-rose-200/90">
          Deleting a user removes their account, complaints, diet days, and chat they participated in.
          Deleting a conversation removes all messages and S3 attachments for that thread.
        </p>
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
            Conversations (first 80 — use Monitor for full list)
          </div>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
            {(allConvs || []).slice(0, 80).map((c) => (
              <div key={c.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate dark:text-gray-100">
                    {c.type === "group"
                      ? c.name
                      : (c.participants_info || []).map((p) => p.full_name).join(", ")}
                  </div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 font-mono truncate">{c.id}</div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full shrink-0 text-rose-700 border-rose-200 dark:text-rose-300 dark:border-rose-800"
                  onClick={() => onDeleteConversation?.(c)}
                  data-testid={`storage-delete-conv-${c.id}`}
                >
                  Delete
                </Button>
              </div>
            ))}
            {(allConvs || []).length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-gray-400">No conversations loaded.</div>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          To remove a user account, open the Users tab and use Delete on that row (also refreshes storage
          meters).
        </p>
      </div>
    </div>
  );
}
