import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loader2, ShieldAlert, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import MobilePageShell from "@/components/layout/MobilePageShell";
import MedicalProfileFields, {
  MedicalProfileReadOnly,
  medicalProfileToForm,
  formToMedicalProfile,
  MEDICAL_PROFILE_DEFAULTS,
} from "@/components/MedicalProfileFields";
import {
  medicalPath,
  panelBase,
  profilePath,
  resolveBackTo,
  userAccountPath,
} from "@/lib/appRoutes";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function MedicalProfilePage() {
  const { userId: routeUserId } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user: me } = useAuth();

  const userId = routeUserId || me?.id;
  const initialMode = searchParams.get("mode") === "edit" ? "edit" : "view";

  const defaultBackTo = useMemo(() => {
    if (me?.role === "admin" && routeUserId) return userAccountPath(routeUserId);
    if (me?.role === "client") return profilePath("client");
    return panelBase(me?.role);
  }, [me?.role, routeUserId]);

  const backTo = resolveBackTo(location.state, defaultBackTo);
  const pendingChat = location.state?.pendingChat;

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    if (pendingChat?.selectedConv?.id) {
      navigate(backTo, { replace: true, state: { pendingChat } });
      return;
    }
    navigate(backTo);
  };

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState(initialMode);
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ ...MEDICAL_PROFILE_DEFAULTS });

  const isAdmin = me?.role === "admin";

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode, userId]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    api
      .get(`/users/${userId}/medical-profile`)
      .then((res) => {
        setData(res.data);
        setForm(medicalProfileToForm(res.data?.medical_profile));
      })
      .catch((err) => {
        toast.error(formatApiError(err));
        navigate(backTo);
      })
      .finally(() => setLoading(false));
  }, [userId, backTo, navigate]);

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
      if (me?.role === "admin" && routeUserId) {
        navigate(medicalPath("admin", userId), { replace: true });
      }
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const headerSubject = data?.user?.full_name || me?.full_name || "client";
  const editable = isAdmin && data?.editable !== false;
  const description =
    mode === "edit" && editable
      ? `Update the medical record for ${headerSubject}. Changes are audit-logged.`
      : `Medical record for ${headerSubject}.`;

  const footer =
    editable && (mode === "view" || mode === "edit") ? (
      <div className="flex flex-col sm:flex-row gap-2 w-full">
        {mode === "view" && (
          <Button
            type="button"
            onClick={() => navigate(`${medicalPath("admin", userId)}?mode=edit`)}
            className="w-full rounded-full bg-emerald-900 hover:bg-emerald-950"
            data-testid="med-edit-btn"
          >
            Edit profile
          </Button>
        )}
        {mode === "edit" && (
          <>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-full"
              onClick={() => {
                setForm(medicalProfileToForm(data?.medical_profile));
                navigate(medicalPath("admin", userId), { replace: true });
              }}
              disabled={saving}
              data-testid="med-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={save}
              disabled={saving}
              className="w-full rounded-full bg-emerald-900 hover:bg-emerald-950"
              data-testid="med-save-btn"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
              Save changes
            </Button>
          </>
        )}
      </div>
    ) : null;

  return (
    <MobilePageShell
      title="Medical profile"
      description={description}
      onBack={handleBack}
      testId="medical-profile-page"
      footer={footer}
    >
      {loading ? (
        <div className="py-10 flex items-center justify-center text-gray-400 dark:text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <div className="space-y-4 w-full">
          {data?.updated_at && (
            <p className="text-xs text-gray-500 dark:text-gray-400" data-testid="med-updated-meta">
              Last updated {new Date(data.updated_at).toLocaleString()}
              {data.updated_by ? ` by ${data.updated_by.full_name}` : ""}
            </p>
          )}

          {!editable && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-200 flex items-start gap-2 w-full">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <span>This profile is maintained by your administrator and cannot be changed here.</span>
            </div>
          )}

          {mode === "edit" && editable ? (
            <MedicalProfileFields value={form} onChange={updateField} disabled={saving} />
          ) : (
            <MedicalProfileReadOnly profile={data?.medical_profile} />
          )}
        </div>
      )}
    </MobilePageShell>
  );
}
