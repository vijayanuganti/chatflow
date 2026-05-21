import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import PasswordInput from "@/components/PasswordInput";
import MobilePageShell from "@/components/layout/MobilePageShell";
import { userAccountPath } from "@/lib/appRoutes";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function ResetPasswordPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const backTo = userAccountPath(userId);
  const [targetUser, setTargetUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pwd, setPwd] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(`/admin/users/${userId}`)
      .then((res) => {
        if (!cancelled) setTargetUser(res.data?.user || null);
      })
      .catch((err) => {
        toast.error(formatApiError(err));
        navigate("/admin/users", { replace: true });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, navigate]);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!targetUser) return;
    if (!pwd || pwd.length < 6) {
      return toast.error("Password must be at least 6 characters");
    }
    setSubmitting(true);
    try {
      await api.post(`/admin/users/${targetUser.id}/reset-password`, { new_password: pwd });
      toast.success(`Password reset for ${targetUser.full_name}`);
      navigate(backTo);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MobilePageShell
      title="Reset password"
      description={
        targetUser
          ? `Set a new password for ${targetUser.full_name} (@${targetUser.username}). Share it through a secure channel.`
          : "Set a new password for this user."
      }
      backTo={backTo}
      testId="reset-password-page"
    >
      {loading ? (
        <div className="py-12 flex items-center justify-center text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : !targetUser ? (
        <p className="text-sm text-gray-500 text-center py-12">User not found.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4 max-w-lg">
          <div className="space-y-1.5">
            <Label htmlFor="reset-new-password">New password</Label>
            <PasswordInput
              id="reset-new-password"
              data-testid="reset-password-input"
              className="w-full h-11 rounded-xl"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="At least 6 characters"
              required
            />
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="w-full h-11 rounded-full bg-emerald-900 hover:bg-emerald-950 text-white"
            data-testid="reset-password-submit"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset password"}
          </Button>
        </form>
      )}
    </MobilePageShell>
  );
}
