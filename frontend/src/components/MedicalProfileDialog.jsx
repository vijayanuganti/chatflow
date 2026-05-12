import React, { useEffect, useState } from "react";
import { Loader2, Stethoscope, ShieldAlert, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import MedicalProfileFields, {
  MedicalProfileReadOnly,
  medicalProfileToForm,
  formToMedicalProfile,
  MEDICAL_PROFILE_DEFAULTS,
} from "@/components/MedicalProfileFields";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

/**
 * Medical profile dialog used by every role:
 *   - Admin opens it from the user details / inactive list and can edit.
 *   - Employees open it from chat and see a read-only view of their client.
 *   - Clients open it from their own profile and see a read-only view of themselves.
 *
 * Backend gates write access to admins only, regardless of what the UI sends.
 */
export default function MedicalProfileDialog({
  open,
  onOpenChange,
  userId,
  initialMode = "view", // "view" | "edit"  (only effective for admins)
  onSaved,
}) {
  const { user: me } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState(initialMode);
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ ...MEDICAL_PROFILE_DEFAULTS });

  const isAdmin = me?.role === "admin";

  useEffect(() => {
    if (!open || !userId) return;
    setMode(initialMode);
    setLoading(true);
    api.get(`/users/${userId}/medical-profile`)
      .then((res) => {
        setData(res.data);
        setForm(medicalProfileToForm(res.data?.medical_profile));
      })
      .catch((err) => {
        toast.error(formatApiError(err));
        onOpenChange?.(false);
      })
      .finally(() => setLoading(false));
  }, [open, userId, initialMode, onOpenChange]);

  const updateField = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      const payload = formToMedicalProfile(form);
      const res = await api.put(`/admin/users/${userId}/medical-profile`, payload);
      setData((prev) => ({
        ...(prev || {}),
        medical_profile: res.data.medical_profile,
        updated_at: res.data.updated_at,
        updated_by: res.data.updated_by,
      }));
      setForm(medicalProfileToForm(res.data.medical_profile));
      setMode("view");
      toast.success("Medical profile saved");
      onSaved?.(res.data);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const headerSubject = data?.user?.full_name || "client";
  const editable = isAdmin && data?.editable !== false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1rem)] sm:max-w-3xl max-h-[90dvh] overflow-y-auto p-4 sm:p-6 bg-white dark:bg-gray-950"
        data-testid="medical-profile-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2 dark:text-gray-100">
            <Stethoscope className="h-5 w-5 text-emerald-800 dark:text-emerald-300" />
            Medical profile
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            {mode === "edit"
              ? `Update the medical record for ${headerSubject}. Changes are audit-logged.`
              : `Medical record for ${headerSubject}.`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex items-center justify-center text-gray-400 dark:text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            {data?.updated_at && (
              <p className="text-xs text-gray-500 dark:text-gray-400" data-testid="med-updated-meta">
                Last updated {new Date(data.updated_at).toLocaleString()}
                {data.updated_by ? ` by ${data.updated_by.full_name}` : ""}
              </p>
            )}

            {!editable && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-200 inline-flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                This profile is maintained by your administrator and cannot be changed here.
              </div>
            )}

            {mode === "edit" && editable ? (
              <MedicalProfileFields value={form} onChange={updateField} disabled={saving} />
            ) : (
              <MedicalProfileReadOnly profile={data?.medical_profile} />
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              {editable && mode === "view" && (
                <Button
                  type="button"
                  onClick={() => setMode("edit")}
                  className="rounded-full bg-emerald-900 hover:bg-emerald-950"
                  data-testid="med-edit-btn"
                >
                  Edit profile
                </Button>
              )}
              {editable && mode === "edit" && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setForm(medicalProfileToForm(data?.medical_profile));
                      setMode("view");
                    }}
                    disabled={saving}
                    className="rounded-full"
                    data-testid="med-cancel-btn"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    className="rounded-full bg-emerald-900 hover:bg-emerald-950"
                    data-testid="med-save-btn"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                    Save changes
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
