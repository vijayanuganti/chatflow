import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, Phone, Stethoscope, ShieldAlert } from "lucide-react";
import Avatar from "./Avatar";
import PasswordInput from "./PasswordInput";
import { MedicalProfileReadOnly } from "./MedicalProfileFields";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const STATUS_OPTIONS = [
  { value: "available", label: "Available", color: "bg-emerald-500" },
  { value: "busy", label: "Busy", color: "bg-rose-500" },
  { value: "away", label: "Away", color: "bg-amber-500" },
  { value: "dnd", label: "Do not disturb", color: "bg-gray-800" },
];

export default function ProfileDialog({ open, onOpenChange }) {
  const { user, setUser } = useAuth();
  const [tab, setTab] = useState("profile");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: user?.full_name || "",
    bio: user?.bio || "",
    status: user?.status || "available",
    avatar_url: user?.avatar_url || null,
  });
  const [passForm, setPassForm] = useState({ current_password: "", new_password: "" });
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef(null);
  const [medical, setMedical] = useState(null);
  const [medicalLoading, setMedicalLoading] = useState(false);

  const isClient = user?.role === "client";

  useEffect(() => {
    if (!open || !isClient || tab !== "medical" || medical) return;
    setMedicalLoading(true);
    api.get(`/users/${user.id}/medical-profile`)
      .then((res) => setMedical(res.data))
      .catch((err) => toast.error(formatApiError(err)))
      .finally(() => setMedicalLoading(false));
  }, [open, isClient, tab, medical, user?.id]);

  useEffect(() => {
    if (!open) setMedical(null);
  }, [open]);

  React.useEffect(() => {
    if (user) {
      setForm({
        full_name: user.full_name || "",
        bio: user.bio || "",
        status: user.status || "available",
        avatar_url: user.avatar_url || null,
      });
    }
  }, [user, open]);

  const update = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await api.put("/users/me", form);
      setUser(res.data);
      toast.success("Profile updated");
      onOpenChange(false);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!passForm.current_password || !passForm.new_password) return toast.error("Fill both fields");
    setSaving(true);
    try {
      await api.post("/users/me/password", passForm);
      toast.success("Password changed");
      setPassForm({ current_password: "", new_password: "" });
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      update("avatar_url", res.data.file_url);
      toast.success("Avatar uploaded. Click Save to apply.");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploadingAvatar(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1rem)] max-w-lg sm:w-full max-h-[88dvh] overflow-y-auto p-4 sm:p-6"
        data-testid="profile-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display">Profile & Settings</DialogTitle>
          <DialogDescription>Manage your identity on ChatFlow.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <TabsList className="flex w-full gap-2 bg-transparent p-0 h-auto">
            <TabsTrigger
              value="profile"
              data-testid="profile-tab-profile"
              className="flex-1 h-10 rounded-xl px-0 text-xs sm:text-sm leading-none whitespace-nowrap border border-gray-200 bg-white data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-900 data-[state=active]:border-emerald-700 data-[state=active]:shadow-none"
            >
              Profile
            </TabsTrigger>
            <TabsTrigger
              value="status"
              data-testid="profile-tab-status"
              className="flex-1 h-10 rounded-xl px-0 text-xs sm:text-sm leading-none whitespace-nowrap border border-gray-200 bg-white data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-900 data-[state=active]:border-emerald-700 data-[state=active]:shadow-none"
            >
              Status
            </TabsTrigger>
            <TabsTrigger
              value="security"
              data-testid="profile-tab-security"
              className="flex-1 h-10 rounded-xl px-0 text-xs sm:text-sm leading-none whitespace-nowrap border border-gray-200 bg-white data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-900 data-[state=active]:border-emerald-700 data-[state=active]:shadow-none"
            >
              Security
            </TabsTrigger>
            {isClient && (
              <TabsTrigger
                value="medical"
                data-testid="profile-tab-medical"
                className="flex-1 h-10 rounded-xl px-0 text-xs sm:text-sm leading-none whitespace-nowrap border border-gray-200 bg-white data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-900 data-[state=active]:border-emerald-700 data-[state=active]:shadow-none"
              >
                Medical
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="profile" className="mt-4 space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar name={form.full_name || "You"} avatarUrl={form.avatar_url} status={form.status} size={72} />
                <button
                  onClick={() => fileRef.current?.click()}
                  data-testid="upload-avatar-btn"
                  className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-emerald-900 text-white flex items-center justify-center shadow-md hover:bg-emerald-950"
                  title="Upload photo"
                >
                  {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </button>
                <input ref={fileRef} type="file" className="hidden" accept="image/*" onChange={uploadAvatar} data-testid="avatar-file-input" />
              </div>
              <div>
                <div className="font-display font-semibold text-lg">{form.full_name || "Your name"}</div>
                <div className="text-sm text-gray-500 capitalize">@{user?.username} · {user?.role}</div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input data-testid="profile-fullname-input" value={form.full_name} onChange={(e) => update("full_name", e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>Phone number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input data-testid="profile-phone-input" value={user?.phone_number || ""} disabled readOnly className="pl-10 h-11 rounded-xl bg-gray-50" />
              </div>
              <p className="text-[11px] text-gray-400">
                Phone numbers are managed by your administrator. Contact them to change yours.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Bio</Label>
              <Textarea data-testid="profile-bio-input" value={form.bio} onChange={(e) => update("bio", e.target.value)} rows={3} maxLength={200} className="rounded-xl" placeholder="A little about yourself" />
              <div className="text-xs text-gray-400 text-right">{(form.bio || "").length}/200</div>
            </div>
            <Button onClick={saveProfile} disabled={saving} data-testid="save-profile-btn" className="w-full rounded-full bg-emerald-900 hover:bg-emerald-950 h-11">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
            </Button>
          </TabsContent>

          <TabsContent value="status" className="mt-4 space-y-3">
            <p className="text-sm text-gray-500">Let others know if you're around.</p>
            <div className="space-y-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update("status", opt.value)}
                  data-testid={`status-${opt.value}`}
                  className={`w-full p-3 rounded-xl border flex items-center gap-3 transition-colors ${
                    form.status === opt.value ? "border-emerald-800 bg-emerald-50" : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  <span className={`h-3 w-3 rounded-full ${opt.color}`} />
                  <span className="font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
            <Button onClick={saveProfile} disabled={saving} data-testid="save-status-btn" className="w-full rounded-full bg-emerald-900 hover:bg-emerald-950 h-11">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save status"}
            </Button>
          </TabsContent>

          <TabsContent value="security" className="mt-4 space-y-4">
            <p className="text-sm text-gray-500">Change your password. Use at least 6 characters.</p>
            <div className="space-y-2">
              <Label>Current password</Label>
              <PasswordInput
                data-testid="current-password-input"
                leftIcon={null}
                value={passForm.current_password}
                onChange={(e) => setPassForm({ ...passForm, current_password: e.target.value })}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>New password</Label>
              <PasswordInput
                data-testid="new-password-input"
                leftIcon={null}
                value={passForm.new_password}
                onChange={(e) => setPassForm({ ...passForm, new_password: e.target.value })}
                className="h-11 rounded-xl"
              />
            </div>
            <Button onClick={changePassword} disabled={saving} data-testid="change-password-btn" className="w-full rounded-full bg-emerald-900 hover:bg-emerald-950 h-11">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
            </Button>
          </TabsContent>

          {isClient && (
            <TabsContent value="medical" className="mt-4 space-y-4" data-testid="profile-medical-pane">
              <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-[12px] text-emerald-900">
                <Stethoscope className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  Your medical profile is maintained by your administrator for your care team.
                  Need a correction? Message them and they'll update it for you.
                </div>
              </div>
              {medicalLoading ? (
                <div className="py-10 flex items-center justify-center text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
                </div>
              ) : (
                <>
                  {medical?.updated_at && (
                    <p className="text-xs text-gray-500" data-testid="profile-medical-meta">
                      Last updated {new Date(medical.updated_at).toLocaleString()}
                      {medical.updated_by ? ` by ${medical.updated_by.full_name}` : ""}
                    </p>
                  )}
                  <MedicalProfileReadOnly profile={medical?.medical_profile} />
                  <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-[11px] text-amber-900 inline-flex items-center gap-2">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Read-only for clients. Only your administrator can edit these details.
                  </div>
                </>
              )}
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
