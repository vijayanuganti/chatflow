import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Plus,
  Sun,
  Moon,
  Sunrise,
  UtensilsCrossed,
  Camera,
  CheckCircle2,
  CircleDashed,
  Image as ImageIcon,
  Trash2,
  Save,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const SLOTS = [
  { id: "morning", label: "Morning", icon: Sunrise, accent: "text-amber-700" },
  { id: "afternoon", label: "Afternoon", icon: Sun, accent: "text-orange-700" },
  { id: "night", label: "Night", icon: Moon, accent: "text-indigo-700" },
];

/**
 * Day-by-day diet plan dialog.
 *
 * Roles:
 *  - admin / employee → can add new days and edit per-slot suggestions.
 *  - client → read-only suggestions; uploads a food photo (+ note) per slot
 *    to mark the meal as completed.
 *
 * The backend RBAC is authoritative; this UI just adjusts affordances.
 */
export default function DietPlanDialog({ open, onOpenChange, client }) {
  const { user: me } = useAuth();
  const role = me?.role;
  const canEditSuggestions = role === "admin" || role === "employee";
  const canUploadPhoto = role === "client" || role === "admin";
  const isClientViewer = role === "client";

  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [addingDay, setAddingDay] = useState(false);

  const reload = useCallback(async () => {
    if (!client?.id) return;
    setLoading(true);
    try {
      const res = await api.get(`/clients/${client.id}/diet-plans`);
      const list = res.data?.days || [];
      setDays(list);
      if (list.length && !activeId) setActiveId(list[list.length - 1].id);
      else if (list.length && !list.find((d) => d.id === activeId)) {
        setActiveId(list[list.length - 1].id);
      }
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [client?.id, activeId]);

  useEffect(() => {
    if (open) {
      setActiveId(null);
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client?.id]);

  const activeDay = useMemo(
    () => days.find((d) => d.id === activeId) || days[days.length - 1],
    [days, activeId],
  );

  const handleAddDay = async () => {
    if (!client?.id) return;
    setAddingDay(true);
    try {
      const res = await api.post(`/clients/${client.id}/diet-plans`, {});
      const newDay = res.data;
      setDays((prev) => [...prev, newDay]);
      setActiveId(newDay.id);
      toast.success(`Day ${newDay.day_number} created`);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setAddingDay(false);
    }
  };

  const upsertDay = (updated) => {
    setDays((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1rem)] sm:max-w-4xl max-h-[92dvh] overflow-hidden p-0 flex flex-col"
        data-testid="diet-plan-dialog"
      >
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-gray-100">
          <DialogTitle className="font-display flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 text-emerald-800" />
            Diet plan
            {client && (
              <span className="text-sm font-normal text-gray-500 truncate">
                · {client.full_name}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {isClientViewer
              ? "Your nutritionist's plan for each day. Upload a photo of what you actually ate to log it."
              : "Suggest morning, afternoon and night meals. The client uploads photos as they complete each one."}
          </DialogDescription>
        </DialogHeader>

        {/* Day tabs / picker */}
        <div className="px-4 sm:px-6 pt-3 pb-2 border-b border-gray-100 flex items-center gap-2 overflow-x-auto">
          {days.length === 0 && !loading && (
            <div className="text-xs text-gray-400 mr-2">No days yet.</div>
          )}
          {days.map((d) => {
            const completed = SLOTS.every((s) => !!d.meals?.[s.id]?.photo_url);
            const isActive = d.id === activeDay?.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setActiveId(d.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full border text-xs flex items-center gap-1.5 transition-colors ${
                  isActive
                    ? "bg-emerald-900 text-white border-emerald-900"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
                data-testid={`diet-day-tab-${d.day_number}`}
              >
                Day {d.day_number}
                {completed
                  ? <CheckCircle2 className="h-3.5 w-3.5 opacity-90" />
                  : <CircleDashed className="h-3.5 w-3.5 opacity-60" />}
              </button>
            );
          })}
          {canEditSuggestions && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddDay}
              disabled={addingDay || loading}
              className="shrink-0 rounded-full ml-auto"
              data-testid="diet-add-day-btn"
            >
              {addingDay ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
              Add day
            </Button>
          )}
        </div>

        {/* Active day */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {loading && days.length === 0 ? (
            <div className="py-10 flex items-center justify-center text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : !activeDay ? (
            <EmptyState canAdd={canEditSuggestions} onAdd={handleAddDay} adding={addingDay} />
          ) : (
            <>
              <div className="text-xs text-gray-500">
                Day {activeDay.day_number} · {activeDay.date || "—"}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {SLOTS.map((slot) => (
                  <MealSlotCard
                    key={slot.id}
                    slot={slot}
                    meal={activeDay.meals?.[slot.id] || {}}
                    canEditSuggestion={canEditSuggestions}
                    canUploadPhoto={canUploadPhoto}
                    planId={activeDay.id}
                    onSaved={upsertDay}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ canAdd, onAdd, adding }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
      <UtensilsCrossed className="h-8 w-8 mx-auto text-emerald-700 mb-2" />
      <div className="font-display text-lg font-semibold">No diet plan yet</div>
      <p className="text-sm text-gray-500 mt-1">
        {canAdd
          ? "Start by adding Day 1 — you can suggest morning, afternoon, and night meals."
          : "Your nutritionist hasn't started your plan yet."}
      </p>
      {canAdd && (
        <Button
          onClick={onAdd}
          disabled={adding}
          className="mt-4 rounded-full bg-emerald-900 hover:bg-emerald-950"
          data-testid="diet-empty-add-day-btn"
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
          Add Day 1
        </Button>
      )}
    </div>
  );
}

function MealSlotCard({ slot, meal, canEditSuggestion, canUploadPhoto, planId, onSaved }) {
  const Icon = slot.icon;
  const [suggestion, setSuggestion] = useState(meal.suggestion || "");
  const [savingSuggestion, setSavingSuggestion] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const [note, setNote] = useState(meal.client_note || "");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    setSuggestion(meal.suggestion || "");
    setNote(meal.client_note || "");
  }, [meal.suggestion, meal.client_note, planId]);

  const suggestionDirty = (suggestion || "") !== (meal.suggestion || "");
  const noteDirty = (note || "") !== (meal.client_note || "");

  const saveSuggestion = async () => {
    setSavingSuggestion(true);
    try {
      const res = await api.put(`/diet-plans/${planId}/suggestions`, {
        [slot.id]: suggestion.trim() ? suggestion.trim() : null,
      });
      onSaved?.(res.data);
      toast.success(`${slot.label} suggestion saved`);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSavingSuggestion(false);
    }
  };

  const uploadPhoto = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const upRes = await api.post("/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const photo_url = upRes.data.file_url;
      const res = await api.put(`/diet-plans/${planId}/meal/${slot.id}/photo`, {
        photo_url,
        note: note.trim() || null,
      });
      onSaved?.(res.data);
      toast.success(`${slot.label} photo uploaded`);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const saveNote = async () => {
    // We rely on the upload endpoint which also accepts a note. If no photo
    // exists yet, fall back to clearing the meal so we don't end up with
    // inconsistent state — easier UX is to ask the client to upload a photo first.
    if (!meal.photo_url) {
      toast.message("Upload a photo first, then you can add a note.");
      return;
    }
    setSavingNote(true);
    try {
      const res = await api.put(`/diet-plans/${planId}/meal/${slot.id}/photo`, {
        photo_url: meal.photo_url,
        note: note.trim() || null,
      });
      onSaved?.(res.data);
      toast.success("Note updated");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSavingNote(false);
    }
  };

  const clearPhoto = async () => {
    if (!meal.photo_url) return;
    try {
      const res = await api.delete(`/diet-plans/${planId}/meal/${slot.id}/photo`);
      onSaved?.(res.data);
      toast.success(`${slot.label} reset`);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const completed = !!meal.photo_url;

  return (
    <div
      className={`rounded-2xl border bg-white overflow-hidden ${
        completed ? "border-emerald-300" : "border-gray-200"
      }`}
      data-testid={`diet-slot-${slot.id}`}
    >
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <span className={`h-8 w-8 rounded-xl bg-gray-50 flex items-center justify-center ${slot.accent}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold text-sm">{slot.label}</div>
          {completed ? (
            <div className="text-[11px] text-emerald-700 inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Logged
            </div>
          ) : (
            <div className="text-[11px] text-gray-400">Awaiting upload</div>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Suggestion */}
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-900/70">Suggested</div>
          {canEditSuggestion ? (
            <>
              <Textarea
                rows={3}
                value={suggestion}
                onChange={(e) => setSuggestion(e.target.value)}
                placeholder="e.g. Oats, banana, and almonds"
                disabled={savingSuggestion}
                data-testid={`diet-suggestion-input-${slot.id}`}
              />
              {suggestionDirty && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={saveSuggestion}
                    disabled={savingSuggestion}
                    className="rounded-full bg-emerald-900 hover:bg-emerald-950"
                    data-testid={`diet-suggestion-save-${slot.id}`}
                  >
                    {savingSuggestion ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                    Save
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-800 whitespace-pre-wrap min-h-[2.5rem]">
              {meal.suggestion || <span className="italic text-gray-400">Not set yet.</span>}
            </p>
          )}
          {meal.suggestion_at && (
            <p className="text-[10px] text-gray-400">
              Updated {new Date(meal.suggestion_at).toLocaleString()}
            </p>
          )}
        </div>

        {/* Photo / upload */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-900/70">What I ate</div>
          {meal.photo_url ? (
            <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
              <img
                src={meal.photo_url}
                alt={`${slot.label} meal`}
                className="w-full h-40 object-cover"
                data-testid={`diet-photo-${slot.id}`}
              />
              <div className="px-3 py-2 text-[11px] text-gray-500 flex items-center justify-between">
                <span>{meal.photo_uploaded_at ? `Uploaded ${new Date(meal.photo_uploaded_at).toLocaleString()}` : ""}</span>
                {canUploadPhoto && (
                  <button
                    type="button"
                    onClick={clearPhoto}
                    className="text-rose-600 hover:text-rose-700 inline-flex items-center gap-1"
                    data-testid={`diet-photo-clear-${slot.id}`}
                  >
                    <Trash2 className="h-3 w-3" /> Re-take
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center">
              <ImageIcon className="h-6 w-6 mx-auto text-gray-400 mb-1" />
              <p className="text-xs text-gray-500">
                {canUploadPhoto
                  ? "Upload a photo of what you actually ate."
                  : "Client hasn't uploaded yet."}
              </p>
            </div>
          )}

          {canUploadPhoto && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => uploadPhoto(e.target.files?.[0])}
                data-testid={`diet-photo-input-${slot.id}`}
              />
              <Button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                variant="outline"
                className="w-full rounded-full"
                data-testid={`diet-photo-upload-${slot.id}`}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Camera className="h-4 w-4 mr-1.5" />}
                {meal.photo_url ? "Replace photo" : "Upload photo"}
              </Button>
            </>
          )}
        </div>

        {/* Client note (visible to everyone, editable by client/admin) */}
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-900/70">Client note</div>
          {canUploadPhoto ? (
            <>
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything you want to flag (skipped item, portion, etc.)"
                disabled={savingNote}
                data-testid={`diet-note-input-${slot.id}`}
              />
              {noteDirty && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={saveNote}
                    disabled={savingNote || !meal.photo_url}
                    variant="outline"
                    className="rounded-full"
                    data-testid={`diet-note-save-${slot.id}`}
                  >
                    {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                    Save note
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-800 whitespace-pre-wrap min-h-[1.5rem]">
              {meal.client_note || <span className="italic text-gray-400">No note yet.</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
