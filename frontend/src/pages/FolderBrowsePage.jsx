import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderOpen } from "lucide-react";
import TopBar from "@/components/TopBar";
import { useAuth } from "@/context/AuthContext";
import { profilePath } from "@/lib/appRoutes";
import { formatFolderCounts } from "@/lib/folderAccess";
import { listMyFolders } from "@/lib/foldersApi";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function FolderBrowsePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const backTo = "/chat/folders";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMyFolders();
      setFolders(data || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-gray-50 dark:bg-gray-950"
      data-testid="folders-browse-page"
    >
      <TopBar
        title="Folders"
        onOpenSettings={() => navigate(profilePath(user?.role), { state: { backTo } })}
        onBack={() => navigate("/chat")}
      />
      <div className="flex-1 overflow-y-auto p-4 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-4 space-y-3">
        {loading && <p className="text-sm text-gray-500">Loading...</p>}
        {!loading && folders.length === 0 && (
          <div className="py-16 text-center text-sm text-gray-500 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
            No folders shared with you yet.
          </div>
        )}
        {folders.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => navigate(`/chat/folders/${f.id}`, { state: { backTo } })}
            className="w-full flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-left hover:shadow-sm transition-shadow"
            data-testid={`folder-card-${f.id}`}
          >
            <div className="h-12 w-12 rounded-xl bg-emerald-50 dark:bg-emerald-500/20 flex items-center justify-center">
              <FolderOpen className="h-6 w-6 text-emerald-900 dark:text-emerald-200" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate dark:text-gray-100">{f.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">{formatFolderCounts(f.item_counts)}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
