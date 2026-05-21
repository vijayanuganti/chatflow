import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Lock, Pencil, Loader2 } from "lucide-react";
import TopBar from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import FolderDetailPanel from "@/components/folders/FolderDetailPanel";
import EmployeeFolderAccessForm from "@/components/folders/EmployeeFolderAccessForm";
import { useAuth } from "@/context/AuthContext";
import { profilePath, resolveBackTo } from "@/lib/appRoutes";
import { employeeAccessRulesToSelection } from "@/lib/folderAccess";
import { getMyFolder, updateEmployeeFolder } from "@/lib/foldersApi";
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
  const [editOpen, setEditOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [accessSel, setAccessSel] = useState({ presets: [], specificClientIds: [], rules: [] });
  const [saving, setSaving] = useState(false);

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

  const openEdit = () => {
    if (!folder) return;
    const sel = employeeAccessRulesToSelection(folder.access || []);
    setFolderName(folder.name || "");
    setAccessSel({ ...sel, rules: folder.access || [] });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!folder?.id || !accessSel.rules?.length) return;
    setSaving(true);
    try {
      await updateEmployeeFolder(folder.id, { name: folderName, access: accessSel.rules });
      toast.success("Folder updated");
      setEditOpen(false);
      await load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

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
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span>{folder.creator_label}</span>
              {folder.view_only && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/15 px-2 py-1 rounded-full">
                  <Lock className="h-3 w-3" />
                  View only
                </span>
              )}
              {folder.can_edit && user?.role === "employee" && (
                <Button size="sm" variant="outline" className="rounded-full ml-auto" onClick={openEdit}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit folder
                </Button>
              )}
            </div>
            <FolderDetailPanel folder={folder} isAdmin={false} onRefresh={load} />
          </div>
        )}
      </div>

      {folder?.can_edit && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit folder</DialogTitle>
              <DialogDescription>Update name or client access.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Folder name</Label>
                <Input value={folderName} onChange={(e) => setFolderName(e.target.value)} className="mt-1 rounded-xl" />
              </div>
              <EmployeeFolderAccessForm value={accessSel} onChange={setAccessSel} />
              <Button className="w-full rounded-full bg-emerald-900" onClick={handleSaveEdit} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
