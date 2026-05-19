import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, Phone, Stethoscope, ChevronRight, Sun, Moon, Monitor, Bell, Volume2 } from "lucide-react";
import Avatar from "@/components/Avatar";
import PasswordInput from "@/components/PasswordInput";
import MobilePageShell from "@/components/layout/MobilePageShell";
import { medicalPath, panelBase } from "@/lib/appRoutes";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useTheme, CHAT_THEMES } from "@/context/ThemeContext";
import {
  NOTIFICATION_TONES,
  getNotificationTone,
  setNotificationTone,
  NOTIFICATION_TONE_EVENT,
  playNotificationTone,
  getCustomToneDataUrl,
  setCustomToneDataUrl,
} from "@/lib/notificationTone";
import { isCapacitorNativeApp, pickPhotoFileForUpload } from "@/lib/nativeMedia";
import { Switch } from "@/components/ui/switch";
import {
  getConversationSoundsEnabled,
  setConversationSoundsEnabled,
  syncConversationSoundsFromNative,
} from "@/lib/conversationSounds";
import LoginHistorySection from "@/components/LoginHistorySection";

const STATUS_OPTIONS = [
  { value: "available", label: "Available", color: "bg-emerald-500" },
  { value: "busy", label: "Busy", color: "bg-rose-500" },
  { value: "away", label: "Away", color: "bg-amber-500" },
  { value: "dnd", label: "Do not disturb", color: "bg-gray-800" },
];

/** Mini gradient swatches for chat theme cards (approximate; real chat uses `data-chat-theme` CSS). */
const CHAT_THEME_SWATCH = {
  default: "from-slate-200 via-gray-100 to-emerald-100/70",
  plain: "from-gray-100 to-gray-300",
  mint: "from-emerald-100 via-teal-50 to-green-50",
  dusk: "from-violet-200 via-indigo-100 to-purple-50",
  warm: "from-amber-50 via-orange-50/80 to-stone-100",
  ocean: "from-cyan-100 via-sky-50 to-blue-50",
  dots: "from-gray-200 to-slate-300",
};

export default function ProfileSettingsPage() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const { theme, setTheme, chatTheme, setChatTheme } = useTheme();
  const backTo = panelBase(user?.role);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(backTo);
  };
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
  const [notificationTone, setNotificationToneState] = useState(() => getNotificationTone());
  const [conversationSounds, setConversationSounds] = useState(() => getConversationSoundsEnabled());
  const customToneInputRef = useRef(null);
  const CUSTOM_TONE_MAX_BYTES = 300 * 1024;

  const isClient = user?.role === "client";

  const tabTrig =
    "shrink-0 min-w-[3.5rem] sm:min-w-[4.5rem] flex-1 h-10 rounded-xl px-1 sm:px-0 text-xs sm:text-sm leading-none whitespace-nowrap border border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-900 data-[state=active]:border-emerald-700 dark:data-[state=active]:bg-emerald-500/15 dark:data-[state=active]:text-emerald-200 dark:data-[state=active]:border-emerald-500/40 data-[state=active]:shadow-none";

  useEffect(() => {
    setNotificationToneState(getNotificationTone());
    void syncConversationSoundsFromNative().then(setConversationSounds);
  }, []);

  useEffect(() => {
    const onTone = () => setNotificationToneState(getNotificationTone());
    window.addEventListener(NOTIFICATION_TONE_EVENT, onTone);
    return () => window.removeEventListener(NOTIFICATION_TONE_EVENT, onTone);
  }, []);

  useEffect(() => {
    if (user) {
      setForm({
        full_name: user.full_name || "",
        bio: user.bio || "",
        status: user.status || "available",
        avatar_url: user.avatar_url || null,
      });
    }
  }, [user]);

  const update = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await api.put("/users/me", form);
      setUser(res.data);
      toast.success("Profile updated");
      navigate(backTo);
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

  const uploadAvatarFile = async (file) => {
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

  const openAvatarPicker = async () => {
    if (isCapacitorNativeApp()) {
      try {
        const file = await pickPhotoFileForUpload();
        await uploadAvatarFile(file);
      } catch (err) {
        const msg = (err && (err.message || String(err))) || "";
        if (!/cancel|dismiss|denied|User cancelled/i.test(msg)) {
          toast.error(formatApiError(err) || msg || "Could not open camera");
        }
      }
      return;
    }
    fileRef.current?.click();
  };

  const uploadAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadAvatarFile(file);
  };

  return (
    <MobilePageShell
      title="Profile & Settings"
      description="Manage your identity on ChatFlow."
      onBack={handleBack}
      testId="profile-settings-page"
    >
        <Tabs value={tab} onValueChange={setTab} className="min-w-0 w-full">
          <TabsList className="flex w-full max-w-full gap-1.5 overflow-x-auto bg-transparent p-0 h-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsTrigger
              value="profile"
              data-testid="profile-tab-profile"
              className={tabTrig}
            >
              Profile
            </TabsTrigger>
            <TabsTrigger
              value="status"
              data-testid="profile-tab-status"
              className={tabTrig}
            >
              Status
            </TabsTrigger>
            <TabsTrigger
              value="themes"
              data-testid="profile-tab-themes"
              className={tabTrig}
            >
              Themes
            </TabsTrigger>
            <TabsTrigger
              value="alerts"
              data-testid="profile-tab-alerts"
              className={tabTrig}
            >
              <span className="inline-flex items-center justify-center gap-1">
                <Bell className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>Alerts</span>
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="security"
              data-testid="profile-tab-security"
              className={tabTrig}
            >
              Security
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-4 space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar name={form.full_name || "You"} avatarUrl={form.avatar_url} status={form.status} size={72} />
                <button
                  onClick={() => void openAvatarPicker()}
                  data-testid="upload-avatar-btn"
                  className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-emerald-900 text-white flex items-center justify-center shadow-md hover:bg-emerald-950"
                  title="Upload photo"
                >
                  {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </button>
                <input ref={fileRef} type="file" className="hidden" accept="image/*" onChange={uploadAvatar} data-testid="avatar-file-input" />
              </div>
              <div>
                <div className="font-display font-semibold text-lg dark:text-gray-100">{form.full_name || "Your name"}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 capitalize">@{user?.username} | {user?.role}</div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input data-testid="profile-fullname-input" value={form.full_name} onChange={(e) => update("full_name", e.target.value)} className="w-full h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>Phone number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                <Input data-testid="profile-phone-input" value={user?.phone_number || ""} disabled readOnly className="w-full pl-10 h-11 rounded-xl bg-gray-50 dark:bg-gray-900 dark:text-gray-300" />
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                Phone numbers are managed by your administrator. Contact them to change yours.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Bio</Label>
              <Textarea data-testid="profile-bio-input" value={form.bio} onChange={(e) => update("bio", e.target.value)} rows={3} maxLength={200} className="w-full rounded-xl" placeholder="A little about yourself" />
              <div className="text-xs text-gray-400 dark:text-gray-500 text-right">{(form.bio || "").length}/200</div>
            </div>
            <Button onClick={saveProfile} disabled={saving} data-testid="save-profile-btn" className="w-full rounded-full bg-emerald-900 hover:bg-emerald-950 h-11">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
            </Button>
            {isClient && (
              <button
                type="button"
                onClick={() => navigate(medicalPath(user?.role))}
                className="w-full flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-left dark:border-emerald-500/30 dark:bg-emerald-500/10"
                data-testid="profile-open-medical-page"
              >
                <Stethoscope className="h-5 w-5 text-emerald-800 dark:text-emerald-300 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">Medical profile</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">View your health details</span>
                </span>
                <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />
              </button>
            )}
          </TabsContent>

          <TabsContent value="status" className="mt-4 space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">Let others know if you're around.</p>
            <div className="space-y-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update("status", opt.value)}
                  data-testid={`status-${opt.value}`}
                  className={`w-full p-3 rounded-xl border flex items-center gap-3 transition-colors ${
                    form.status === opt.value
                      ? "border-emerald-800 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100"
                      : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
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

          <TabsContent value="themes" className="mt-4 space-y-8" data-testid="profile-themes-pane">
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">App theme</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Sidebar, top bar, dialogs, and the rest of the app follow this. Quick sun/moon in the header still toggles light and dark; choose System here to match your device.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  data-testid="theme-app-light"
                  onClick={() => setTheme("light")}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-xs font-medium transition-colors ${
                    theme === "light"
                      ? "border-emerald-700 bg-emerald-50 text-emerald-900 dark:border-emerald-500/50 dark:bg-emerald-500/15 dark:text-emerald-100"
                      : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                  }`}
                >
                  <Sun className="h-5 w-5" strokeWidth={1.5} />
                  Light
                </button>
                <button
                  type="button"
                  data-testid="theme-app-dark"
                  onClick={() => setTheme("dark")}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-xs font-medium transition-colors ${
                    theme === "dark"
                      ? "border-emerald-700 bg-emerald-50 text-emerald-900 dark:border-emerald-500/50 dark:bg-emerald-500/15 dark:text-emerald-100"
                      : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                  }`}
                >
                  <Moon className="h-5 w-5" strokeWidth={1.5} />
                  Dark
                </button>
                <button
                  type="button"
                  data-testid="theme-app-system"
                  onClick={() => setTheme("system")}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-xs font-medium transition-colors ${
                    theme === "system"
                      ? "border-emerald-700 bg-emerald-50 text-emerald-900 dark:border-emerald-500/50 dark:bg-emerald-500/15 dark:text-emerald-100"
                      : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                  }`}
                >
                  <Monitor className="h-5 w-5" strokeWidth={1.5} />
                  System
                </button>
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Chat background</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Only the message area behind your conversation (header and composer stay solid for readability).
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CHAT_THEMES.map((opt) => {
                  const active = chatTheme === opt.id;
                  const swatch = CHAT_THEME_SWATCH[opt.id] || CHAT_THEME_SWATCH.default;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      data-testid={`theme-chat-${opt.id}`}
                      onClick={() => setChatTheme(opt.id)}
                      className={`rounded-xl border text-left overflow-hidden transition-colors ${
                        active
                          ? "border-emerald-700 ring-2 ring-emerald-700/30 dark:border-emerald-500/60 dark:ring-emerald-500/25"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      }`}
                    >
                      <div className={`h-14 w-full bg-gradient-to-br ${swatch}`} />
                      <div className="px-2.5 py-2 bg-white dark:bg-gray-900">
                        <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">{opt.label}</div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">{opt.hint}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="alerts" className="mt-4 space-y-4" data-testid="profile-alerts-pane">
            <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor="conversation-sounds-toggle" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Conversation Sounds
                </Label>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  Play sounds for incoming and outgoing messages while inside a chat.
                </p>
              </div>
              <Switch
                id="conversation-sounds-toggle"
                data-testid="conversation-sounds-toggle"
                checked={conversationSounds}
                onCheckedChange={(checked) => {
                  setConversationSounds(checked);
                  void setConversationSoundsEnabled(checked);
                }}
                className="mt-0.5 data-[state=checked]:bg-emerald-700"
              />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 inline-flex items-center gap-2">
                <Bell className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                New message sound
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Default uses your phone&apos;s system message sound for push alerts. In-app presets play inside ChatFlow
                and mute the duplicate OS beep. Custom uploads a short clip stored on this device only.
              </p>
            </div>
            <div className="space-y-2">
              {NOTIFICATION_TONES.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`notification-tone-${opt.id}`}
                  onClick={() => {
                    setNotificationTone(opt.id);
                    setNotificationToneState(opt.id);
                  }}
                  className={`w-full p-3 rounded-xl border text-left transition-colors ${
                    notificationTone === opt.id
                      ? "border-emerald-800 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100"
                      : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                  }`}
                >
                  <div className="font-medium text-sm">{opt.label}</div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{opt.description}</div>
                </button>
              ))}
            </div>
            {notificationTone === "custom" && (
              <div className="space-y-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-3">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {getCustomToneDataUrl()
                    ? "Custom tone saved on this device."
                    : "Choose a short sound file (max 300 KB)."}
                </p>
                <input
                  ref={customToneInputRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
                  className="hidden"
                  data-testid="notification-tone-custom-file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    if (file.size > CUSTOM_TONE_MAX_BYTES) {
                      toast.error("Sound file must be 300 KB or smaller.");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      setCustomToneDataUrl(String(reader.result || ""));
                      setNotificationTone("custom");
                      setNotificationToneState("custom");
                      toast.success("Custom message tone saved.");
                    };
                    reader.onerror = () => toast.error("Could not read that file.");
                    reader.readAsDataURL(file);
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full h-10"
                    onClick={() => customToneInputRef.current?.click()}
                  >
                    {getCustomToneDataUrl() ? "Replace sound" : "Upload sound"}
                  </Button>
                  {getCustomToneDataUrl() && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="rounded-full h-10 text-rose-600"
                      onClick={() => {
                        setCustomToneDataUrl("");
                        toast.message("Custom tone removed.");
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-full h-11 gap-2"
              data-testid="notification-tone-preview"
              disabled={notificationTone === "off" || notificationTone === "system"}
              onClick={() => playNotificationTone(notificationTone)}
            >
              <Volume2 className="h-4 w-4" aria-hidden />
              Preview selected tone
            </Button>
          </TabsContent>

          <TabsContent value="security" className="mt-4 space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Change your password. Use at least 6 characters.</p>
            <div className="space-y-2">
              <Label>Current password</Label>
              <PasswordInput
                data-testid="current-password-input"
                leftIcon={null}
                value={passForm.current_password}
                onChange={(e) => setPassForm({ ...passForm, current_password: e.target.value })}
                className="w-full h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>New password</Label>
              <PasswordInput
                data-testid="new-password-input"
                leftIcon={null}
                value={passForm.new_password}
                onChange={(e) => setPassForm({ ...passForm, new_password: e.target.value })}
                className="w-full h-11 rounded-xl"
              />
            </div>
            <Button onClick={changePassword} disabled={saving} data-testid="change-password-btn" className="w-full rounded-full bg-emerald-900 hover:bg-emerald-950 h-11">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
            </Button>
            <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
              <LoginHistorySection />
            </div>
          </TabsContent>

        </Tabs>
    </MobilePageShell>
  );
}
