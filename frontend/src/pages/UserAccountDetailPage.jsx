import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  KeyRound,
  Loader2,
  Power,
  PowerOff,
  ShieldCheck,
  Stethoscope,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Avatar from "@/components/Avatar";
import MobilePageShell from "@/components/layout/MobilePageShell";
import { dietPlanPath, medicalPath, resetPasswordPath, resolveBackTo } from "@/lib/appRoutes";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import SharedMediaSection from "@/components/SharedMediaSection";

export default function UserAccountDetailPage() {
  const { userId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const backTo = resolveBackTo(location.state, "/admin/accounts");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/users/${userId}`);
      setData(res.data);
    } catch (err) {
      toast.error(formatApiError(err));
      navigate(backTo, { replace: true });
    } finally {
      setLoading(false);
    }
  }, [userId, navigate, backTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const user = data?.user;

  const toggleActive = async (target, nextActive) => {
    if (!target || target.role === "admin") return;
    setToggleBusy(true);
    try {
      await api.post(`/admin/users/${target.id}/active`, { is_active: nextActive });
      toast.success(
        nextActive ? `${target.full_name} reactivated` : `${target.full_name} marked inactive`,
      );
      await load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setToggleBusy(false);
    }
  };

  return (
    <MobilePageShell
      title="Account details"
      description="Account lineage and the most recent admin actions on this user."
      backTo={backTo}
      testId="user-account-detail-page"
    >
      {loading && !user ? (
        <div className="py-12 flex items-center justify-center text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : !user ? (
        <p className="text-sm text-gray-500 text-center py-12">User not found.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={user.full_name} avatarUrl={user.avatar_url} status={user.status} size={56} />
            <div className="min-w-0 flex-1">
              <div className="font-display font-semibold text-lg truncate">{user.full_name}</div>
              <div className="text-xs text-gray-500 truncate">
                @{user.username} · <span className="capitalize">{user.role}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DetailCard label="Phone number" value={<span className="font-mono">{user.phone_number || "-"}</span>} />
            <DetailCard
              label="Created at"
              value={user.created_at ? new Date(user.created_at).toLocaleString() : "-"}
            />
            <DetailCard
              label="Created by"
              value={
                data?.created_by_user ? (
                  <span>
                    <span className="font-medium">{data.created_by_user.full_name}</span>{" "}
                    <span className="text-gray-500">(@{data.created_by_user.username})</span>
                  </span>
                ) : (
                  <span className="italic text-gray-500">System / seed</span>
                )
              }
            />
            {user.role === "employee" && (
              <DetailCard
                label="Account creation access"
                value={
                  user.account_creation_access ? (
                    <span className="inline-flex items-center gap-1 text-emerald-800">
                      <ShieldCheck className="h-4 w-4" /> Granted
                    </span>
                  ) : (
                    <span className="text-gray-500">Not granted</span>
                  )
                }
              />
            )}
            {user.role === "client" && user.employee_id && (
              <DetailCard label="Assigned employee" value={<span className="font-mono text-xs">{user.employee_id}</span>} />
            )}
            <DetailCard
              label="Last password reset"
              value={
                data?.password_reset_by_user ? (
                  <span>
                    by <span className="font-medium">{data.password_reset_by_user.full_name}</span>
                    {user.password_reset_at ? ` · ${new Date(user.password_reset_at).toLocaleString()}` : ""}
                  </span>
                ) : (
                  <span className="text-gray-500">Never</span>
                )
              }
            />
            {user.role !== "admin" && (
              <DetailCard
                label="Active status"
                value={
                  user.is_active === false ? (
                    <span className="inline-flex items-center gap-1 text-rose-700">
                      <PowerOff className="h-4 w-4" /> Inactive{" "}
                      {user.inactive_at ? `· ${new Date(user.inactive_at).toLocaleDateString()}` : ""}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-800">
                      <Power className="h-4 w-4" /> Active
                    </span>
                  )
                }
              />
            )}
          </div>

          {user.role === "client" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="w-full rounded-full h-11"
                onClick={() => navigate(medicalPath("admin", user.id))}
                data-testid="user-detail-view-medical"
              >
                <Stethoscope className="h-4 w-4 mr-1.5" /> View medical profile
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-full h-11 text-emerald-900 border-emerald-200 hover:bg-emerald-50"
                onClick={() => navigate(`${medicalPath("admin", user.id)}?mode=edit`)}
                data-testid="user-detail-edit-medical"
              >
                <Stethoscope className="h-4 w-4 mr-1.5" /> Edit medical profile
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-full h-11 sm:col-span-2"
                onClick={() =>
                  navigate(dietPlanPath("admin", user.id), {
                    state: { client: user, backTo: `/admin/users/${user.id}` },
                  })
                }
                data-testid="user-detail-diet-plan"
              >
                <UtensilsCrossed className="h-4 w-4 mr-1.5" /> Diet plan
              </Button>
            </div>
          )}

          {user.role !== "admin" && user.id !== me?.id && (
            <SharedMediaSection profileUserId={user.id} />
          )}

          {user.role !== "admin" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                onClick={() => navigate(resetPasswordPath(user.id))}
                className="w-full rounded-full h-11 bg-emerald-900 hover:bg-emerald-950"
                data-testid="user-detail-reset-password"
              >
                <KeyRound className="h-4 w-4 mr-1.5" /> Reset password
              </Button>
              {user.role === "client" &&
                (user.is_active === false ? (
                  <Button
                    onClick={() => toggleActive(user, true)}
                    disabled={toggleBusy}
                    variant="outline"
                    className="w-full rounded-full h-11 text-emerald-800 border-emerald-200 hover:bg-emerald-50"
                    data-testid="user-detail-activate"
                  >
                    <Power className="h-4 w-4 mr-1.5" /> Reactivate client
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      if (
                        window.confirm(
                          `Mark ${user.full_name} as inactive? They will lose login access but their chat history is preserved.`,
                        )
                      ) {
                        toggleActive(user, false);
                      }
                    }}
                    disabled={toggleBusy}
                    variant="outline"
                    className="w-full rounded-full h-11 text-rose-700 border-rose-200 hover:bg-rose-50"
                    data-testid="user-detail-deactivate"
                  >
                    <PowerOff className="h-4 w-4 mr-1.5" /> Deactivate client
                  </Button>
                ))}
            </div>
          )}
        </div>
      )}
    </MobilePageShell>
  );
}

function DetailCard({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/40 p-4 flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm text-gray-800 dark:text-gray-200 break-words">{value}</span>
    </div>
  );
}
