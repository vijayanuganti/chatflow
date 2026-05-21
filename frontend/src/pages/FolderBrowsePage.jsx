import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderOpen, FolderPlus, Lock, Loader2, Pencil, Trash2 } from "lucide-react";
import TopBar from "@/components/TopBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import EmployeeFolderAccessForm from "@/components/folders/EmployeeFolderAccessForm";
import { useAuth } from "@/context/AuthContext";
import { profilePath } from "@/lib/appRoutes";
import {
  buildEmployeeAccessRulesFromSelection,
  employeeAccessRulesToSelection,
  formatFolderCounts,
} from "@/lib/folderAccess";
import {
  createEmployeeFolder,
  deleteEmployeeFolder,
  listMyFolders,
  updateEmployeeFolder,
} from "@/lib/foldersApi";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";

function FolderCard({ folder, onOpen, showViewOnly, onDelete, onEdit }) {
  return (
    <div
      className="w-full flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-left hover:shadow-sm transition-shadow"
      data-testid={`folder-card-${folder.id}`}
    >
      <button type="button" className="flex flex-1 items-center gap-3 min-w-0 text-left" onClick={onOpen}>
        <div className="h-12 w-12 rounded-xl bg-emerald-50 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
          <FolderOpen className="h-6 w-6 text-emerald-900 dark:text-emerald-200" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate dark:text-gray-100">{folder.name}</div>
          <div className="text-xs text-gray-500 mt-0.5">{folder.creator_label || ""}</div>
          <div className="text-xs text-gray-400 mt-0.5">{formatFolderCounts(folder.item_counts)}</div>
        </div>
      </button>
      {showViewOnly && (
        <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/15 px-2 py-1 rounded-full">
          <Lock className="h-3 w-3" />
          View only
        </span>
      )}
      {onEdit && (
        <Button type="button" size="icon" variant="ghost" className="shrink-0 rounded-full" onClick={onEdit} title="Edit folder">
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      {onDelete && (
        <Button type="button" size="icon" variant="ghost" className="shrink-0 rounded-full text-rose-600" onClick={onDelete} title="Delete folder">
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function FolderList({ folders, emptyMessage, onOpen, showViewOnly, onDelete, onEdit }) {
  if (!folders?.length) {
    return (
      <div className="py-16 text-center text-sm text-gray-500 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
        {emptyMessage}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {folders.map((f) => (
        <FolderCard
          key={f.id}
          folder={f}
          onOpen={() => onOpen(f)}
          showViewOnly={showViewOnly}
          onDelete={onDelete ? () => onDelete(f) : undefined}
          onEdit={onEdit ? () => onEdit(f) : undefined}
        />
      ))}
    </div>
  );
}

export default function FolderBrowsePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;
  const isClient = role === "client";
  const isEmployee = role === "employee";
  const backTo = "/chat/folders";

  const [loading, setLoading] = useState(true);
  const [adminMedia, setAdminMedia] = useState([]);
  const [employeeMedia, setEmployeeMedia] = useState([]);
  const [myFolders, setMyFolders] = useState([]);
  const [tab, setTab] = useState(isClient ? "admin" : "admin");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [folderName, setFolderName] = useState("New Folder");
  const [accessSel, setAccessSel] = useState({ presets: [], specificClientIds: [], rules: [] });
  const [editingFolder, setEditingFolder] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMyFolders();
      setAdminMedia(data?.admin_media || []);
      setEmployeeMedia(data?.employee_media || []);
      setMyFolders(data?.my_folders || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openFolder = (f, section) => {
    navigate(`/chat/folders/${f.id}`, { state: { backTo, section } });
  };

  const openCreate = () => {
    setFolderName("New Folder");
    setAccessSel({
      presets: ["all_clients"],
      specificClientIds: [],
      rules: buildEmployeeAccessRulesFromSelection({ presets: ["all_clients"], specificClients: [] }),
    });
    setCreateOpen(true);
  };

  const openEdit = (f) => {
    const sel = employeeAccessRulesToSelection(f.access || []);
    setEditingFolder(f);
    setFolderName(f.name || "");
    setAccessSel({
      ...sel,
      rules: f.access || [],
    });
    setEditOpen(true);
  };

  const handleCreate = async () => {
    if (!accessSel.rules?.length) {
      toast.error("Select at least one access option");
      return;
    }
    setSaving(true);
    try {
      await createEmployeeFolder({ name: folderName, access: accessSel.rules });
      toast.success("Folder created");
      setCreateOpen(false);
      setTab("mine");
      await load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingFolder?.id || !accessSel.rules?.length) {
      toast.error("Select at least one access option");
      return;
    }
    setSaving(true);
    try {
      await updateEmployeeFolder(editingFolder.id, { name: folderName, access: accessSel.rules });
      toast.success("Folder updated");
      setEditOpen(false);
      await load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (f) => {
    if (!window.confirm(`Delete folder "${f.name}" and all its contents?`)) return;
    try {
      await deleteEmployeeFolder(f.id);
      toast.success("Folder deleted");
      await load();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const sectionTabClass =
    "shrink-0 flex-none whitespace-nowrap rounded-lg text-xs sm:text-sm py-2 px-3 data-[state=active]:bg-white data-[state=active]:text-emerald-900 data-[state=active]:shadow-sm dark:data-[state=active]:bg-gray-950 dark:data-[state=active]:text-emerald-200";

  const employeeTabs = (
    <Tabs value={tab} onValueChange={setTab} className="w-full min-w-0">
      <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain touch-pan-x scroll-smooth [-webkit-overflow-scrolling:touch]">
        <TabsList className="inline-flex h-auto w-max min-w-full flex-nowrap gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-900 justify-start">
          <TabsTrigger value="admin" className={sectionTabClass} data-testid="folders-tab-admin">
            Admin Media
          </TabsTrigger>
          <TabsTrigger value="mine" className={sectionTabClass} data-testid="folders-tab-mine">
            My Folders
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="admin" className="mt-4">
        <p className="text-xs text-gray-500 mb-3">Folders shared by administrators. View only.</p>
        <FolderList
          folders={adminMedia}
          emptyMessage="No admin folders shared with you yet."
          onOpen={(f) => openFolder(f, "admin")}
          showViewOnly
        />
      </TabsContent>
      <TabsContent value="mine" className="mt-4 space-y-3">
        <div className="flex justify-end">
          <Button
            className="rounded-full bg-emerald-900 hover:bg-emerald-950"
            onClick={openCreate}
            data-testid="employee-create-folder-btn"
          >
            <FolderPlus className="h-4 w-4 mr-1.5" />
            Create folder
          </Button>
        </div>
        <FolderList
          folders={myFolders}
          emptyMessage="You have not created any folders yet."
          onOpen={(f) => openFolder(f, "mine")}
          onDelete={handleDelete}
          onEdit={openEdit}
        />
      </TabsContent>
    </Tabs>
  );

  const clientTabs = (
    <Tabs value={tab} onValueChange={setTab} className="w-full min-w-0">
      <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain touch-pan-x scroll-smooth [-webkit-overflow-scrolling:touch]">
        <TabsList className="inline-flex h-auto w-max min-w-full flex-nowrap gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-900 justify-start">
          <TabsTrigger value="admin" className={sectionTabClass} data-testid="folders-tab-admin">
            Admin Media
          </TabsTrigger>
          <TabsTrigger value="employee" className={sectionTabClass} data-testid="folders-tab-employee">
            Employee Media
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="admin" className="mt-4">
        <p className="text-xs text-gray-500 mb-3">Media shared by your organization. View only.</p>
        <FolderList
          folders={adminMedia}
          emptyMessage="No admin media shared with you yet."
          onOpen={(f) => openFolder(f, "admin")}
          showViewOnly
        />
      </TabsContent>
      <TabsContent value="employee" className="mt-4">
        <p className="text-xs text-gray-500 mb-3">Media shared by your nutrition team. View only.</p>
        <FolderList
          folders={employeeMedia}
          emptyMessage="No employee media shared with you yet."
          onOpen={(f) => openFolder(f, "employee")}
          showViewOnly
        />
      </TabsContent>
    </Tabs>
  );

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
      <div className="flex-1 overflow-y-auto p-4 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-4">
        {loading && <p className="text-sm text-gray-500">Loading...</p>}
        {!loading && isEmployee && employeeTabs}
        {!loading && isClient && clientTabs}
      </div>

      {isEmployee && (
        <>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create folder</DialogTitle>
                <DialogDescription>Name your folder and choose which clients can access it.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Folder name</Label>
                  <Input
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    className="mt-1 rounded-xl"
                    data-testid="employee-folder-create-name"
                  />
                </div>
                <EmployeeFolderAccessForm value={accessSel} onChange={setAccessSel} />
                <Button
                  className="w-full rounded-full bg-emerald-900 hover:bg-emerald-950"
                  onClick={handleCreate}
                  disabled={saving}
                  data-testid="employee-folder-create-submit"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create folder"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit folder</DialogTitle>
                <DialogDescription>Update the name or client access for this folder.</DialogDescription>
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
        </>
      )}
    </div>
  );
}
