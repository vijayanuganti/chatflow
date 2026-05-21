import React, { useCallback, useEffect, useState } from "react";
import {
  FolderPlus, LayoutGrid, List, ArrowLeft, Pencil, Trash2, FolderOpen, Loader2,
} from "lucide-react";
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
import FolderAccessForm, { accessRulesToSelection } from "@/components/folders/FolderAccessForm";
import { formatFolderCounts, buildAccessRulesFromSelection } from "@/lib/folderAccess";
import { formatApiError } from "@/lib/api";
import {
  createAdminFolder,
  deleteAdminFolder,
  getAdminFolder,
  listAdminFolders,
  updateAdminFolder,
} from "@/lib/foldersApi";
import { toast } from "sonner";

export default function AdminFoldersPane() {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("grid");
  const [selectedId, setSelectedId] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editAccessOpen, setEditAccessOpen] = useState(false);
  const [folderName, setFolderName] = useState("New Folder");
  const [accessSel, setAccessSel] = useState({ presets: [], specificUserIds: [], rules: [] });
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAdminFolders();
      setFolders(data || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setSelectedFolder(null);
      return;
    }
    try {
      const data = await getAdminFolder(id);
      setSelectedFolder(data);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const openCreate = () => {
    setFolderName("New Folder");
    setAccessSel({
      presets: ["all"],
      specificUserIds: [],
      rules: buildAccessRulesFromSelection({ presets: ["all"], specificUsers: [] }),
    });
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!accessSel.rules?.length) {
      toast.error("Select at least one access option");
      return;
    }
    setSaving(true);
    try {
      const created = await createAdminFolder({ name: folderName, access: accessSel.rules });
      toast.success("Folder created");
      setCreateOpen(false);
      await loadList();
      setSelectedId(created.id);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (f) => {
    if (!window.confirm(`Delete folder "${f.name}" and all its contents?`)) return;
    try {
      await deleteAdminFolder(f.id);
      toast.success("Folder deleted");
      if (selectedId === f.id) {
        setSelectedId(null);
        setSelectedFolder(null);
      }
      loadList();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const openEditAccess = () => {
    if (!selectedFolder) return;
    const sel = accessRulesToSelection(selectedFolder.access || []);
    setFolderName(selectedFolder.name || "");
    setAccessSel({ ...sel, rules: selectedFolder.access || [] });
    setEditAccessOpen(true);
  };

  const handleSaveAccess = async () => {
    if (!selectedId || !accessSel.rules?.length) {
      toast.error("Select at least one access option");
      return;
    }
    setSaving(true);
    try {
      await updateAdminFolder(selectedId, { name: folderName, access: accessSel.rules });
      toast.success("Folder updated");
      setEditAccessOpen(false);
      await loadDetail(selectedId);
      loadList();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  if (selectedId && selectedFolder) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-6 lg:p-10" data-testid="admin-folder-detail">
        <div className="flex items-center gap-3 mb-4 shrink-0">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => { setSelectedId(null); setSelectedFolder(null); }}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-xl sm:text-2xl font-semibold truncate dark:text-gray-100">{selectedFolder.name}</h1>
            <p className="text-xs text-gray-500 truncate">{selectedFolder.access_summary}</p>
          </div>
          <Button variant="outline" size="sm" className="rounded-full" onClick={openEditAccess}>
            <Pencil className="h-4 w-4 mr-1" /> Access
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {selectedFolder.view_only && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/15 px-2 py-1 rounded-full mb-2">
              View only (employee-owned)
            </span>
          )}
          <FolderDetailPanel
            folder={selectedFolder}
            isAdmin
            onRefresh={() => loadDetail(selectedId)}
          />
        </div>
        <Dialog open={editAccessOpen} onOpenChange={setEditAccessOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit folder</DialogTitle>
              <DialogDescription>Rename the folder or change who can view it.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Folder name</Label>
                <Input value={folderName} onChange={(e) => setFolderName(e.target.value)} className="mt-1 rounded-xl" />
              </div>
              <FolderAccessForm value={accessSel} onChange={setAccessSel} />
              <Button className="w-full rounded-full bg-emerald-900" onClick={handleSaveAccess} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 overflow-y-auto space-y-6" data-testid="admin-folders-pane">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-800 dark:text-emerald-300">Admin · Media Library</div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold mt-1 dark:text-gray-100">Folders</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Share links and files with employees and clients.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="rounded-full" onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}>
            {viewMode === "grid" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          </Button>
          <Button className="rounded-full bg-emerald-900 hover:bg-emerald-950" onClick={openCreate} data-testid="admin-create-folder-btn">
            <FolderPlus className="h-4 w-4 mr-1.5" />
            Create folder
          </Button>
        </div>
      </div>

      {loading && <div className="text-sm text-gray-500">Loading folders...</div>}
      {!loading && folders.length === 0 && (
        <div className="py-16 text-center text-gray-500 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
          No folders yet. Create one to get started.
        </div>
      )}

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {folders.map((f) => (
            <div
              key={f.id}
              className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedId(f.id)}
              data-testid={`admin-folder-card-${f.id}`}
            >
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-xl bg-emerald-50 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-900 dark:text-emerald-200">
                  <FolderOpen className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate dark:text-gray-100">{f.name}</div>
                  <div className="text-xs text-gray-500 mt-1 line-clamp-2">{formatFolderCounts(f.item_counts)}</div>
                  <div className="text-[10px] text-gray-400 mt-1 truncate">{f.creator_label || f.access_summary}</div>
                </div>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <Button size="sm" variant="outline" className="rounded-full flex-1" onClick={(e) => { e.stopPropagation(); setSelectedId(f.id); }}>
                  Open
                </Button>
                <Button size="sm" variant="ghost" className="rounded-full text-rose-600" onClick={(e) => { e.stopPropagation(); handleDelete(f); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
          {folders.map((f) => (
            <div key={f.id} className="flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer" onClick={() => setSelectedId(f.id)}>
              <FolderOpen className="h-5 w-5 text-emerald-800 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium dark:text-gray-100">{f.name}</div>
                <div className="text-xs text-gray-500">{formatFolderCounts(f.item_counts)} · {f.access_summary}</div>
              </div>
              <Button size="sm" variant="ghost" className="text-rose-600" onClick={(e) => { e.stopPropagation(); handleDelete(f); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create folder</DialogTitle>
            <DialogDescription>Set a name and choose which employees or clients can access this folder.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Folder name</Label>
              <Input
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="New Folder"
                className="mt-1 rounded-xl"
                data-testid="folder-create-name"
              />
            </div>
            <FolderAccessForm value={accessSel} onChange={setAccessSel} />
            <Button className="w-full rounded-full bg-emerald-900 hover:bg-emerald-950" onClick={handleCreate} disabled={saving} data-testid="folder-create-submit">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create folder"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
