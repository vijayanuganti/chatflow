import React, { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Camera, Loader2 } from "lucide-react";
import Avatar from "./Avatar";
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
    email: user?.email || "",
    bio: user?.bio || "",
    status: user?.status || "available",
    avatar_url: user?.avatar_url || null,
  });
  const [passForm, setPassForm] = useState({ current_password: "", new_password: "" });
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef(null);

  React.useEffect(() => {
    if (user) {
      setForm({
        full_name: user.full_name || "",
        email: user.email || "",
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
              <Label>Email</Label>
              <Input data-testid="profile-email-input" type="email" value={form.email || ""} onChange={(e) => update("email", e.target.value)} className="h-11 rounded-xl" placeholder="you@example.com" />
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
            <p className="text-sm text-gray-500">Change your password.</p>
            <div className="space-y-2">
              <Label>Current password</Label>
              <Input data-testid="current-password-input" type="password" value={passForm.current_password} onChange={(e) => setPassForm({ ...passForm, current_password: e.target.value })} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>New password</Label>
              <Input data-testid="new-password-input" type="password" value={passForm.new_password} onChange={(e) => setPassForm({ ...passForm, new_password: e.target.value })} className="h-11 rounded-xl" />
            </div>
            <Button onClick={changePassword} disabled={saving} data-testid="change-password-btn" className="w-full rounded-full bg-emerald-900 hover:bg-emerald-950 h-11">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
