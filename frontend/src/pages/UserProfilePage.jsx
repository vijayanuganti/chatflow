import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Bell, ChevronRight, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import MobilePageShell from "@/components/layout/MobilePageShell";
import SharedMediaSection from "@/components/SharedMediaSection";
import Avatar from "@/components/Avatar";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCall } from "@/context/CallContext";
import { updateConversationPreferences } from "@/lib/conversationPreferences";
import { ringtoneSettingsPath } from "@/lib/appRoutes";
import { toast } from "sonner";

export default function UserProfilePage() {
  const { userId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const { ringtoneSettings } = useCall();
  const backTo = location.state?.backTo || "/chat";
  const pendingChat = location.state?.pendingChat;
  const conversationId = location.state?.conversationId;

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

  const [profile, setProfile] = useState(location.state?.profile || null);
  const [loading, setLoading] = useState(!profile);
  const [muted, setMuted] = useState(!!location.state?.isMuted);
  const [muteBusy, setMuteBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await api.get(`/users/${userId}/public`);
      setProfile(res.data);
    } catch {
      try {
        const adminRes = await api.get(`/admin/users/${userId}`);
        setProfile(adminRes.data?.user || adminRes.data);
      } catch (err) {
        toast.error(formatApiError(err));
        navigate(backTo, { replace: true });
      }
    } finally {
      setLoading(false);
    }
  }, [userId, navigate, backTo]);

  useEffect(() => {
    if (!profile?.id) void load();
  }, [load, profile?.id]);

  const toggleMute = async () => {
    if (!conversationId) {
      toast.message("Open this contact from a chat to manage mute");
      return;
    }
    setMuteBusy(true);
    try {
      const data = await updateConversationPreferences(conversationId, { is_muted: !muted });
      setMuted(!!data.is_muted);
      toast.success(data.is_muted ? "Notifications muted" : "Notifications unmuted");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setMuteBusy(false);
    }
  };

  const displayName = profile?.full_name || "Contact";
  const hasCustomRingtone = !!ringtoneSettings?.contactOverrides?.[userId];

  return (
    <MobilePageShell
      title="Contact info"
      description={displayName}
      onBack={handleBack}
      testId="user-profile-page"
    >
      {loading && !profile ? (
        <div className="py-16 flex justify-center text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <div className="h-36 bg-gradient-to-br from-emerald-800 via-emerald-900 to-emerald-950" />
            <div className="px-4 pb-5 -mt-14 flex flex-col items-center text-center">
              <Avatar
                name={displayName}
                avatarUrl={profile?.avatar_url}
                status={profile?.status}
                online={profile?.online}
                size={96}
              />
              <h1 className="mt-3 font-display text-xl font-semibold dark:text-gray-100">{displayName}</h1>
              {profile?.bio && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm">{profile.bio}</p>
              )}
              <p className="mt-1 text-xs text-gray-400 capitalize">{profile?.role || "user"}</p>
            </div>
          </div>

          {profile?.id && profile.id !== me?.id && (
            <button
              type="button"
              className="w-full flex items-center justify-between rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 text-left"
              onClick={() =>
                navigate(`${ringtoneSettingsPath(me?.role)}?contactId=${encodeURIComponent(userId)}`, {
                  state: { contactId: userId, contactName: displayName, backTo: location.pathname },
                })
              }
              data-testid="contact-custom-ringtone"
            >
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-violet-500" strokeWidth={1.75} />
                <div>
                  <div className="text-sm font-medium dark:text-gray-100 inline-flex items-center gap-2">
                    Custom ringtone
                    {hasCustomRingtone ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-500 bg-violet-500/10 px-1.5 py-0.5 rounded">
                        Custom
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Override default for this contact</div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>
          )}

          {conversationId && me?.id && profile?.id !== me.id && (
            <div
              className="flex items-center justify-between rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3"
              data-testid="profile-mute-toggle"
            >
              <div>
                <div className="text-sm font-medium dark:text-gray-100">Mute notifications</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Stop alerts for this chat</div>
              </div>
              <Switch checked={muted} onCheckedChange={() => void toggleMute()} disabled={muteBusy} />
            </div>
          )}

          {profile?.id && profile.id !== me?.id && (
            <SharedMediaSection profileUserId={profile.id} variant="profile" title="" />
          )}
        </div>
      )}
    </MobilePageShell>
  );
}
