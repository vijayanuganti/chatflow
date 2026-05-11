import React, { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import PasswordInput from "@/components/PasswordInput";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

/**
 * Admin-only dialog to reset another user's password.
 */
export default function ResetPasswordDialog({ open, onOpenChange, targetUser, onResetted }) {
  const [pwd, setPwd] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setPwd("");
    }
  }, [open]);

  if (!targetUser) return null;

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!pwd || pwd.length < 6) {
      return toast.error("Password must be at least 6 characters");
    }
    setSubmitting(true);
    try {
      await api.post(`/admin/users/${targetUser.id}/reset-password`, { new_password: pwd });
      toast.success(`Password reset for ${targetUser.full_name}`);
      onResetted?.(targetUser);
      onOpenChange?.(false);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1rem)] sm:max-w-md p-4 sm:p-6"
        data-testid="reset-password-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-emerald-800" />
            Reset password
          </DialogTitle>
          <DialogDescription>
            Set a new password for{" "}
            <span className="font-medium text-gray-800">{targetUser.full_name}</span> (@
            {targetUser.username}). Share it with them through a secure channel.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reset-new-password">New password</Label>
            <PasswordInput
              id="reset-new-password"
              data-testid="reset-password-input"
              className="h-11 rounded-xl"
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
      </DialogContent>
    </Dialog>
  );
}
