import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import TopBar from "@/components/TopBar";
import FolderDetailPanel from "@/components/folders/FolderDetailPanel";
import { useAuth } from "@/context/AuthContext";
import { profilePath, resolveBackTo } from "@/lib/appRoutes";
import { getMyFolder } from "@/lib/foldersApi";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function FolderDetailPage() {
  const { folderId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = resolveBackTo(location.state, "/chat/folders");
  const [folder, setFolder] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!folderId) return;
    setLoading(true);
    try {
      const data = await getMyFolder(folderId);
      setFolder(data);
    } catch (err) {
      toast.error(formatApiError(err));
      navigate(backTo, { replace: true });
    } finally {
      setLoading(false);
    }
  }, [folderId, navigate, backTo]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-gray-50 dark:bg-gray-950"
      data-testid="folder-detail-page"
    >
      <TopBar
        title={folder?.name || "Folder"}
        onOpenSettings={() => navigate(profilePath(user?.role), { state: { backTo: location.pathname } })}
        onBack={() => navigate(backTo)}
      />
      <div className="flex-1 overflow-y-auto p-4 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-4">
        {loading && <p className="text-sm text-gray-500">Loading...</p>}
        {!loading && folder && (
          <FolderDetailPanel folder={folder} isAdmin={false} onRefresh={load} />
        )}
      </div>
    </div>
  );
}
