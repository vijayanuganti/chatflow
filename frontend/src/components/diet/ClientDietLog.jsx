import React, { useCallback, useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Camera,
  ChevronDown,
  ChevronRight,
  Loader2,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { api, fileUrl, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { isCapacitorNativeApp, pickPhotoFileForUpload } from "@/lib/nativeMedia";
import { toast } from "sonner";

function formatDayDate(entryDate) {
  if (!entryDate) return "";
  try {
    return format(parseISO(entryDate.length === 10 ? `${entryDate}T12:00:00` : entryDate), "d MMM yyyy");
  } catch {
    return entryDate;
  }
}

function formatTs(iso) {
  if (!iso) return "";
  try {
    return format(parseISO(iso), "d MMM yyyy, h:mm a");
  } catch {
    return iso;
  }
}

export default function ClientDietLog({ client }) {
  const { user: me } = useAuth();
  const readOnly = me?.role === "employee";
  const canUpload = me?.role === "client" && me?.id === client?.id;

  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [openDays, setOpenDays] = useState({});
  const fileRef = useRef(null);

  const reload = useCallback(async () => {
    if (!client?.id) return;
    setLoading(true);
    try {
      const res = await api.get(`/clients/${client.id}/diet-entries`);
      const list = res.data?.days || [];
      setDays(list);
      setOpenDays((prev) => {
        const next = { ...prev };
        list.forEach((d) => {
          if (next[d.day_number] === undefined) next[d.day_number] = true;
        });
        return next;
      });
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [client?.id]);

  useEffect(() => {
    if (client?.id) void reload();
  }, [client?.id, reload]);

  const uploadFile = async (file) => {
    if (!file || !client?.id) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      await api.post(`/clients/${client.id}/diet-entries/upload`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Photo added to your diet log");
      await reload();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploading(false);
    }
  };

  const handlePickPhoto = async () => {
    if (isCapacitorNativeApp()) {
      try {
        const file = await pickPhotoFileForUpload();
        await uploadFile(file);
      } catch (err) {
        const msg = (err && (err.message || String(err))) || "";
        if (!/cancel|dismiss|denied/i.test(msg)) toast.error(formatApiError(err) || msg);
      }
      return;
    }
    fileRef.current?.click();
  };

  const handleDelete = async (entryId) => {
    if (!window.confirm("Remove this photo from your diet log?")) return;
    try {
      await api.delete(`/diet-entries/${entryId}`);
      toast.success("Photo removed");
      await reload();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayDay = days.find((d) => d.entry_date === todayStr);

  return (
    <div className="w-full min-w-0 space-y-4" data-testid="client-diet-log">
      {readOnly && (
        <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/10 border border-amber-200/80 dark:border-amber-500/30 rounded-xl px-3 py-2 flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          View only — clients upload their own meal photos.
        </p>
      )}

      {canUpload && (
        <div className="rounded-2xl border border-dashed border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/30 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-emerald-950 dark:text-emerald-100">Log what you ate today</div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
              Upload a photo — a new day is created automatically when the date changes.
            </p>
          </div>
          <Button
            type="button"
            className="rounded-full bg-emerald-900 hover:bg-emerald-950 shrink-0"
            disabled={uploading}
            onClick={() => void handlePickPhoto()}
            data-testid="diet-upload-photo-btn"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Camera className="h-4 w-4 mr-1" />}
            Upload photo
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void uploadFile(f);
            }}
          />
        </div>
      )}

      {loading && days.length === 0 && (
        <div className="py-12 flex justify-center text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading diet log...
        </div>
      )}

      {!loading && days.length === 0 && (
        <div className="py-16 text-center text-sm text-gray-500 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
          {canUpload ? "No entries yet. Upload your first meal photo above." : "No diet photos logged yet."}
        </div>
      )}

      <div className="space-y-3">
        {days.map((day) => {
          const isOpen = openDays[day.day_number] !== false;
          const isToday = day.entry_date === todayStr;
          return (
            <Collapsible
              key={`day-${day.day_number}-${day.entry_date}`}
              open={isOpen}
              onOpenChange={(o) => setOpenDays((p) => ({ ...p, [day.day_number]: o }))}
            >
              <div
                className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden"
                data-testid={`diet-day-card-${day.day_number}`}
              >
                <CollapsibleTrigger className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm dark:text-gray-100">
                      Day {day.day_number}
                      {isToday && (
                        <span className="ml-2 text-[10px] font-medium uppercase text-emerald-700 dark:text-emerald-300">
                          Today
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">{formatDayDate(day.entry_date)}</div>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {(day.photos || []).length} photo{(day.photos || []).length === 1 ? "" : "s"}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-100 dark:border-gray-800">
                    {canUpload && isToday && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        disabled={uploading}
                        onClick={() => void handlePickPhoto()}
                        data-testid={`diet-day-upload-${day.day_number}`}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add photo today
                      </Button>
                    )}
                    {(day.photos || []).length === 0 && (
                      <p className="text-xs text-gray-400 py-2">No photos for this day.</p>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {(day.photos || []).map((photo) => {
                        const src = fileUrl(photo.photo_path);
                        return (
                          <div
                            key={photo.id}
                            className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-800"
                            data-testid={`diet-photo-${photo.id}`}
                          >
                            {src ? (
                              <img src={src} alt="" className="w-full aspect-square object-cover" />
                            ) : (
                              <div className="aspect-square flex items-center justify-center text-gray-400 text-xs">
                                No preview
                              </div>
                            )}
                            <div className="p-2 flex items-start justify-between gap-1">
                              <p className="text-[10px] text-gray-500 leading-tight">
                                {formatTs(photo.captured_at || photo.uploaded_at)}
                              </p>
                              {canUpload && (
                                <button
                                  type="button"
                                  className="text-rose-600 p-1 shrink-0"
                                  onClick={() => void handleDelete(photo.id)}
                                  aria-label="Delete photo"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>

      {canUpload && !todayDay && days.length > 0 && (
        <p className="text-xs text-center text-gray-500">
          Use &quot;Upload photo&quot; above to start today&apos;s entry.
        </p>
      )}
    </div>
  );
}
