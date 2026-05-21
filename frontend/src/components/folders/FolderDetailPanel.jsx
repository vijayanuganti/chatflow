import React, { useState } from "react";
import {
  ExternalLink, Download, Trash2, Plus, Upload, Loader2, Link2, Film, ImageIcon, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ImageLightbox from "@/components/ImageLightbox";
import VideoLightbox from "@/components/chat/VideoLightbox";
import { fileUrl, formatApiError } from "@/lib/api";
import { FOLDER_CATEGORIES } from "@/lib/folderAccess";
import {
  addFolderLink,
  deleteFolderItem,
  folderMutationScope,
  uploadFolderFile,
} from "@/lib/foldersApi";
import { toast } from "sonner";

function formatBytes(n) {
  if (n == null || Number.isNaN(Number(n))) return "";
  const v = Number(n);
  if (v < 1024) return `${v} B`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`;
  return `${(v / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const TAB_ICONS = {
  links: Link2,
  videos: Film,
  photos: ImageIcon,
  documents: FileText,
};

export default function FolderDetailPanel({
  folder,
  isAdmin = false,
  onRefresh,
}) {
  const mutationScope = folderMutationScope(folder, { isAdmin });
  const canEdit = !!mutationScope;
  const [activeTab, setActiveTab] = useState("links");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploadPct, setUploadPct] = useState(null);
  const [busy, setBusy] = useState(false);
  const [photoView, setPhotoView] = useState(null);
  const [videoView, setVideoView] = useState(null);

  const itemsByCategory = folder?.items_by_category || {};

  const handleAddLink = async (e) => {
    e.preventDefault();
    if (!linkUrl.trim()) {
      toast.error("Enter a URL");
      return;
    }
    setBusy(true);
    try {
      await addFolderLink(folder.id, { title: linkTitle, url: linkUrl }, mutationScope);
      setLinkTitle("");
      setLinkUrl("");
      toast.success("Link added");
      onRefresh?.();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (category, fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    setUploadPct(0);
    setBusy(true);
    try {
      await uploadFolderFile(folder.id, category, file, {
        onProgress: (p) => setUploadPct(p),
        scope: mutationScope,
      });
      toast.success("Uploaded");
      onRefresh?.();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
      setUploadPct(null);
    }
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Remove "${item.title}"?`)) return;
    setBusy(true);
    try {
      await deleteFolderItem(folder.id, item.id, mutationScope);
      toast.success("Removed");
      onRefresh?.();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const openDownload = (item) => {
    const url = fileUrl(item.url_or_path);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = item.title || "download";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  };

  const renderEmpty = (label) => (
    <div className="py-12 text-center text-sm text-gray-400 dark:text-gray-500" data-testid="folder-empty-tab">
      No {label.toLowerCase()} yet.
    </div>
  );

  const renderLinks = () => {
    const items = itemsByCategory.links || [];
    return (
      <div className="space-y-4">
        {canEdit && (
          <form onSubmit={handleAddLink} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
            <div className="text-sm font-medium dark:text-gray-100">Add link</div>
            <div>
              <Label className="text-xs">Title</Label>
              <Input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="Company website" className="mt-1 rounded-xl" data-testid="folder-link-title" />
            </div>
            <div>
              <Label className="text-xs">URL</Label>
              <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." className="mt-1 rounded-xl" data-testid="folder-link-url" />
            </div>
            <Button type="submit" disabled={busy} className="rounded-full bg-emerald-900 hover:bg-emerald-950" data-testid="folder-link-add">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Add link
            </Button>
          </form>
        )}
        {items.length === 0 && renderEmpty("Links")}
        <div className="divide-y divide-gray-100 dark:divide-gray-800 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 min-w-0" data-testid={`folder-link-${item.id}`}>
              <Link2 className="h-5 w-5 text-emerald-800 shrink-0" />
              <div className="flex-1 min-w-0">
                <a
                  href={item.url_or_path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-sm text-emerald-900 dark:text-emerald-300 hover:underline truncate block"
                >
                  {item.title}
                </a>
                <div className="text-xs text-gray-500 truncate">{item.url_or_path}</div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 rounded-full" asChild>
                  <a href={item.url_or_path} target="_blank" rel="noopener noreferrer" title="Open link">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
                {canEdit && (
                  <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 rounded-full text-rose-600" onClick={() => handleDeleteItem(item)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderMediaGrid = (category, items) => {
    const isVideo = category === "videos";
    const isPhoto = category === "photos";
    const accept = isVideo ? "video/*" : isPhoto ? "image/*" : "*/*";
    return (
      <div className="space-y-4">
        {canEdit && (
          <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-4 flex flex-col items-center gap-2">
            <label className="cursor-pointer flex flex-col items-center gap-2 touch-manipulation">
              <Upload className="h-8 w-8 text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">Upload {category}</span>
              <input
                type="file"
                className="hidden"
                accept={accept}
                onChange={(e) => {
                  handleUpload(category, e.target.files);
                  e.target.value = "";
                }}
                data-testid={`folder-upload-${category}`}
              />
            </label>
            {uploadPct != null && (
              <div className="w-full max-w-xs h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div className="h-full bg-emerald-600 transition-all" style={{ width: `${uploadPct}%` }} />
              </div>
            )}
          </div>
        )}
        {items.length === 0 && renderEmpty(FOLDER_CATEGORIES.find((c) => c.id === category)?.label || category)}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((item) => {
            const src = fileUrl(item.thumbnail_path || item.url_or_path);
            return (
              <div
                key={item.id}
                className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden"
                data-testid={`folder-item-${item.id}`}
              >
                {isPhoto && src && (
                  <button type="button" className="w-full aspect-video bg-gray-100 dark:bg-gray-800" onClick={() => setPhotoView(src)}>
                    <img src={src} alt={item.title} className="w-full h-full object-cover" />
                  </button>
                )}
                {isVideo && (
                  <button type="button" className="w-full aspect-video bg-gray-900 flex items-center justify-center text-white" onClick={() => setVideoView(fileUrl(item.url_or_path))}>
                    <Film className="h-10 w-10 opacity-80" />
                  </button>
                )}
                {!isPhoto && !isVideo && (
                  <div className="w-full aspect-video bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                    <FileText className="h-12 w-12 text-gray-400" />
                  </div>
                )}
                <div className="p-3 space-y-1">
                  <div className="font-medium text-sm truncate dark:text-gray-100">{item.title}</div>
                  <div className="text-[10px] text-gray-500">
                    {formatBytes(item.file_size)}
                    {item.created_at ? ` · ${formatDate(item.created_at)}` : ""}
                  </div>
                  <div className="flex gap-1 pt-1">
                    {isVideo && (
                      <Button size="sm" variant="outline" className="rounded-full flex-1 text-xs" onClick={() => setVideoView(fileUrl(item.url_or_path))}>
                        Play
                      </Button>
                    )}
                    {isPhoto && (
                      <Button size="sm" variant="outline" className="rounded-full flex-1 text-xs" onClick={() => setPhotoView(fileUrl(item.url_or_path))}>
                        View
                      </Button>
                    )}
                    {category === "documents" && (
                      <Button size="sm" variant="outline" className="rounded-full flex-1 text-xs" asChild>
                        <a href={fileUrl(item.url_or_path)} target="_blank" rel="noopener noreferrer">View</a>
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="rounded-full" onClick={() => openDownload(item)} title="Download">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    {canEdit && (
                      <Button size="sm" variant="ghost" className="rounded-full text-rose-600" onClick={() => handleDeleteItem(item)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 min-w-0 w-full" data-testid="folder-detail-panel">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0 w-full">
        <div
          className="w-full min-w-0 overflow-x-auto overscroll-x-contain touch-pan-x scroll-smooth [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600"
          data-testid="folder-category-tabs-scroll"
        >
          <TabsList className="inline-flex h-auto w-max max-w-none flex-nowrap gap-1.5 rounded-none border-0 bg-transparent p-0 pb-2 justify-start shadow-none">
            {FOLDER_CATEGORIES.map((c) => {
              const Icon = TAB_ICONS[c.id];
              const count = (itemsByCategory[c.id] || []).length;
              return (
                <TabsTrigger
                  key={c.id}
                  value={c.id}
                  className="shrink-0 flex-none whitespace-nowrap rounded-full px-3.5 py-2 text-xs sm:text-sm bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200 data-[state=active]:bg-emerald-900 data-[state=active]:text-white data-[state=active]:shadow-sm"
                  data-testid={`folder-tab-${c.id}`}
                >
                  <Icon className="h-3.5 w-3.5 mr-1.5 inline shrink-0" />
                  {c.label}
                  {count > 0 && <span className="ml-1 opacity-80">({count})</span>}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>
        <TabsContent value="links" className="mt-4">{renderLinks()}</TabsContent>
        <TabsContent value="videos" className="mt-4">{renderMediaGrid("videos", itemsByCategory.videos || [])}</TabsContent>
        <TabsContent value="photos" className="mt-4">{renderMediaGrid("photos", itemsByCategory.photos || [])}</TabsContent>
        <TabsContent value="documents" className="mt-4">{renderMediaGrid("documents", itemsByCategory.documents || [])}</TabsContent>
      </Tabs>
      <ImageLightbox open={!!photoView} src={photoView} onClose={() => setPhotoView(null)} />
      <VideoLightbox open={!!videoView} src={videoView} onClose={() => setVideoView(null)} />
    </div>
  );
}
