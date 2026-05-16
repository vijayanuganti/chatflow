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

/** Shared diet plan UI (used by full-screen page; no dialog). */
export default function DietPlanContent({ client, startFromDayOne = false }) {
  const { user: me } = useAuth();
  const role = me?.role;
  const canEditSuggestions = role === "admin" || role === "employee";
  const canUploadPhoto = role === "client" || role === "admin";

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
      setActiveId((prev) => {
        if (list.length === 0) return null;
        if (prev && list.find((d) => d.id === prev)) return prev;
        if (startFromDayOne) {
          const day1 = list.find((d) => d.day_number === 1) || list[0];
          return day1?.id ?? null;
        }
        return list[list.length - 1].id;
      });
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [client?.id, startFromDayOne]);

  useEffect(() => {
    if (client?.id) {
      setActiveId(null);
      void reload();
    }
  }, [client?.id, reload]);

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
    <div className="w-full min-w-0 space-y-4" data-testid="diet-plan-content">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 w-full [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {days.length === 0 && !loading && (
          <div className="text-xs text-gray-400 dark:text-gray-500 mr-2 shrink-0">No days yet.</div>
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
                  : "bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700"
              }`}
              data-testid={`diet-day-tab-${d.day_number}`}
            >
              Day {d.day_number}
              {completed ? (
                <CheckCircle2 className="h-3.5 w-3.5 opacity-90" />
              ) : (
                <CircleDashed className="h-3.5 w-3.5 opacity-60" />
              )}
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
            {addingDay ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Plus className="h-3.5 w-3.5 mr-1" />
            )}
            Add day
          </Button>
        )}
      </div>

      {loading && days.length === 0 ? (
        <div className="py-10 flex items-center justify-center text-gray-400 dark:text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
        </div>
      ) : !activeDay ? (
        <EmptyState canAdd={canEditSuggestions} onAdd={handleAddDay} adding={addingDay} />
      ) : (
        <>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Day {activeDay.day_number} | {activeDay.date || "-"}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
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
  );
}

function EmptyState({ canAdd, onAdd, adding }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50 px-6 py-10 text-center w-full">
      <UtensilsCrossed className="h-8 w-8 mx-auto text-emerald-700 dark:text-emerald-300 mb-2" />
      <div className="font-display text-lg font-semibold dark:text-gray-100">No diet plan yet</div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
        {canAdd
          ? "Start by adding Day 1 - you can suggest morning, afternoon, and night meals."
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
      className={`rounded-2xl border bg-white dark:bg-zinc-900 overflow-hidden w-full ${
        completed ? "border-emerald-300 dark:border-emerald-600" : "border-gray-200 dark:border-zinc-700"
      }`}
      data-testid={`diet-slot-${slot.id}`}
    >
      <div className="px-4 py-3 border-b border-gray-100 dark:border-zinc-800 flex items-center gap-2">
        <span className={`h-8 w-8 rounded-xl bg-gray-50 dark:bg-zinc-800 flex items-center justify-center ${slot.accent}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold text-sm dark:text-gray-100">{slot.label}</div>
          {completed ? (
            <div className="text-[11px] text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Logged
            </div>
          ) : (
            <div className="text-[11px] text-gray-400">Awaiting upload</div>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-900/70 dark:text-emerald-300/80">Suggested</div>
          {canEditSuggestion ? (
            <>
              <Textarea
                rows={3}
                value={suggestion}
                onChange={(e) => setSuggestion(e.target.value)}
                placeholder="e.g. Oats, banana, and almonds"
                disabled={savingSuggestion}
                className="w-full rounded-xl"
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
                    {savingSuggestion ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Save className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Save
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap min-h-[2.5rem]">
              {meal.suggestion || <span className="italic text-gray-400">Not set yet.</span>}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-900/70 dark:text-emerald-300/80">What I ate</div>
          {meal.photo_url ? (
            <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800">
              <img
                src={meal.photo_url}
                alt={`${slot.label} meal`}
                className="w-full h-40 object-cover"
                data-testid={`diet-photo-${slot.id}`}
              />
              <div className="px-3 py-2 text-[11px] text-gray-500 flex items-center justify-between">
                <span>
                  {meal.photo_uploaded_at
                    ? `Uploaded ${new Date(meal.photo_uploaded_at).toLocaleString()}`
                    : ""}
                </span>
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
            <div className="rounded-xl border border-dashed border-gray-300 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-800 px-4 py-6 text-center">
              <ImageIcon className="h-6 w-6 mx-auto text-gray-400 mb-1" />
              <p className="text-xs text-gray-500 dark:text-gray-400">
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
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Camera className="h-4 w-4 mr-1.5" />
                )}
                {meal.photo_url ? "Replace photo" : "Upload photo"}
              </Button>
            </>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-900/70 dark:text-emerald-300/80">Client note</div>
          {canUploadPhoto ? (
            <>
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything you want to flag (skipped item, portion, etc.)"
                disabled={savingNote}
                className="w-full rounded-xl"
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
                    {savingNote ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Save className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Save note
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap min-h-[1.5rem]">
              {meal.client_note || <span className="italic text-gray-400">No note yet.</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
