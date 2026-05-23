import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, FolderOpen, X, FileText, Image as ImageIcon, Film } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatFileSize } from "@/lib/chatMedia";
import { getFileCategory } from "@/lib/shareIntent/categories";
import { SHARE_FOLDER_CATEGORIES } from "@/lib/shareIntent/constants";
import { shareToConversation, shareToFolder, loadShareableFolders } from "@/lib/shareIntent/executeShare";
import { loadShareConversations } from "@/lib/shareIntent/loadShareTargets";
import { isClientPortalUser } from "@/lib/clientChat";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";

function fileIcon(mime) {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return ImageIcon;
  if (m.startsWith("video/")) return Film;
  return FileText;
}

export default function ShareDestinationSheet({
  open,
  onOpenChange,
  user,
  files = [],
  texts = [],
  onComplete,
  onCancel,
}) {
  const isClient = isClientPortalUser(user);
  const [step, setStep] = useState("dest");
  const [conversations, setConversations] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [category, setCategory] = useState("photos");
  const [progress, setProgress] = useState(null);
  const [uploading, setUploading] = useState(false);

  const preview = useMemo(() => {
    if (files.length === 1) {
      return {
        label: files[0].name,
        size: files[0].size,
        mime: files[0].type,
      };
    }
    if (files.length > 1) {
      return { label: `${files.length} files selected`, size: files.reduce((s, f) => s + f.size, 0), mime: "" };
    }
    if (texts.length) {
      const t = texts[0];
      return { label: t.length > 48 ? `${t.slice(0, 45)}…` : t, size: 0, mime: "text/plain" };
    }
    return { label: "Shared item", size: 0, mime: "" };
  }, [files, texts]);

  const defaultCategory = useMemo(() => {
    if (texts.length && !files.length) return "links";
    if (files[0]) return getFileCategory(files[0].type);
    return "documents";
  }, [files, texts]);

  useEffect(() => {
    if (!open) {
      setStep("dest");
      setSelectedFolder(null);
      setCategory("photos");
      setProgress(null);
      setUploading(false);
      return;
    }
    setCategory(defaultCategory);
  }, [open, defaultCategory]);

  const loadTargets = useCallback(async (targetStep) => {
    setLoading(true);
    try {
      if (targetStep === "chat") {
        setConversations(await loadShareConversations(user));
      } else if (targetStep === "folder") {
        setFolders(await loadShareableFolders(user));
      }
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  const runUpload = async (fn) => {
    setUploading(true);
    setStep("uploading");
    setProgress({ current: 0, total: files.length + texts.length, percent: 0 });
    try {
      await fn({
        onProgress: (p) => setProgress(p),
      });
      toast.success("Shared successfully");
      onComplete?.();
      onOpenChange(false);
    } catch (err) {
      const msg = formatApiError(err);
      if (/network/i.test(msg)) {
        toast.error("No internet connection. Please try again.");
      } else {
        toast.error(msg || "Upload failed. Please try again.");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const Icon = fileIcon(preview.mime);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!uploading) onOpenChange(v); }}>
      <SheetContent
        side="bottom"
        hideClose
        className="rounded-t-[20px] border-0 bg-white p-0 max-h-[88vh] flex flex-col dark:bg-gray-950"
        data-testid="share-destination-sheet"
      >
        <SheetTitle className="sr-only">Share to ChatFlow</SheetTitle>
        <div className="shrink-0 flex items-center justify-between px-5 pt-4 pb-2 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Share to…</h2>
          <button
            type="button"
            onClick={handleCancel}
            disabled={uploading}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-3 flex items-center gap-3 border-b border-gray-50 dark:border-gray-900">
          <div className="h-12 w-12 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center shrink-0">
            <Icon className="h-6 w-6 text-emerald-800 dark:text-emerald-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">{preview.label}</p>
            {preview.size > 0 ? (
              <p className="text-xs text-gray-500">{formatFileSize(preview.size)}</p>
            ) : null}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {step === "dest" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">Where do you want to share this?</p>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-900"
                onClick={() => {
                  setStep("chat");
                  void loadTargets("chat");
                }}
              >
                <MessageCircle className="h-5 w-5 text-emerald-700" />
                <span className="font-medium">Send in Chat</span>
              </button>
              {!isClient ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-900"
                  onClick={() => {
                    setStep("folder");
                    void loadTargets("folder");
                  }}
                >
                  <FolderOpen className="h-5 w-5 text-emerald-700" />
                  <span className="font-medium">Upload to Folder</span>
                </button>
              ) : null}
            </div>
          )}

          {step === "chat" && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Choose a chat</p>
              {loading ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : conversations.length === 0 ? (
                <p className="text-sm text-gray-500">No chats available.</p>
              ) : (
                conversations.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={uploading}
                    className="flex w-full flex-col rounded-lg border border-gray-100 dark:border-gray-800 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-900"
                    onClick={() => {
                      void runUpload((opts) =>
                        shareToConversation(c.id, files, texts, opts),
                      );
                    }}
                  >
                    <span className="font-medium text-sm">{c.name || c.other_user?.full_name || "Chat"}</span>
                    {c.other_user?.full_name && c.name ? (
                      <span className="text-xs text-gray-500">{c.other_user.full_name}</span>
                    ) : null}
                  </button>
                ))
              )}
              <Button variant="ghost" className="w-full mt-2" onClick={() => setStep("dest")}>
                Back
              </Button>
            </div>
          )}

          {step === "folder" && !selectedFolder && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Choose a folder</p>
              {loading ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : folders.length === 0 ? (
                <p className="text-sm text-gray-500">No folders you can upload to.</p>
              ) : (
                folders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="flex w-full rounded-lg border border-gray-100 dark:border-gray-800 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-900"
                    onClick={() => {
                      setSelectedFolder(f);
                      setCategory(defaultCategory);
                      setStep("category");
                    }}
                  >
                    <span className="font-medium text-sm">{f.name || "Folder"}</span>
                  </button>
                ))
              )}
              <Button variant="ghost" className="w-full mt-2" onClick={() => setStep("dest")}>
                Back
              </Button>
            </div>
          )}

          {step === "category" && selectedFolder && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Upload to <span className="font-medium">{selectedFolder.name}</span>
              </p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Category</p>
              <div className="grid grid-cols-2 gap-2">
                {SHARE_FOLDER_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-sm capitalize ${
                      category === cat
                        ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950"
                        : "border-gray-200 dark:border-gray-700"
                    }`}
                    onClick={() => setCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <Button
                className="w-full bg-emerald-800 hover:bg-emerald-900"
                disabled={uploading}
                onClick={() => {
                  void runUpload((opts) =>
                    shareToFolder(selectedFolder.id, category, files, texts, user, opts),
                  );
                }}
              >
                Upload
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => { setSelectedFolder(null); setStep("folder"); }}>
                Back
              </Button>
            </div>
          )}

          {step === "uploading" && (
            <div className="py-6 space-y-4 text-center">
              <p className="text-sm text-gray-600">
                {progress
                  ? `Uploading ${progress.current} of ${progress.total}…`
                  : "Uploading…"}
              </p>
              <Progress value={progress?.percent ?? 0} className="h-2" />
              <p className="text-lg font-semibold text-emerald-800">{progress?.percent ?? 0}%</p>
            </div>
          )}
        </div>

        {step === "dest" && (
          <div className="shrink-0 px-5 pb-6 pt-2">
            <Button variant="outline" className="w-full" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
