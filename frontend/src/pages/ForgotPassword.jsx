import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MessageCircle, KeyRound, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: request otp, 2: reset
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [devOtp, setDevOtp] = useState(null);

  const requestOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/auth/forgot-password", { identifier });
      toast.success(res.data.message);
      if (res.data.dev_otp) {
        setDevOtp(res.data.dev_otp);
        toast.info(`Dev OTP: ${res.data.dev_otp}`, { duration: 10000 });
      }
      setStep(2);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { identifier, otp, new_password: newPassword });
      toast.success("Password updated. Please sign in.");
      navigate("/login");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-gray-50" data-testid="forgot-password-page">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-gray-100 p-5 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-emerald-900 text-white flex items-center justify-center">
            <KeyRound className="h-5 w-5" />
          </div>
          <span className="font-display text-xl sm:text-2xl font-semibold">Reset password</span>
        </div>

        {step === 1 ? (
          <>
            <p className="text-gray-500 mb-6 text-sm">
              Enter your username or email. We'll generate a one-time code you can use to reset your password.
            </p>
            <form onSubmit={requestOtp} className="space-y-5" data-testid="forgot-form">
              <div className="space-y-2">
                <Label>Username or email</Label>
                <Input data-testid="forgot-identifier-input" className="h-12 rounded-xl" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="jane or jane@example.com" required />
              </div>
              <Button type="submit" disabled={loading} data-testid="forgot-submit-btn" className="w-full h-12 rounded-full bg-emerald-900 hover:bg-emerald-950 text-white">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send OTP"}
              </Button>
            </form>
          </>
        ) : (
          <>
            <p className="text-gray-500 mb-4 text-sm">
              Enter the 6-digit code you received{devOtp ? " (shown as toast in dev mode)" : " in your email"}.
            </p>
            {devOtp && (
              <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm" data-testid="dev-otp-notice">
                <strong>Dev OTP:</strong> <code className="font-mono text-base">{devOtp}</code>
                <div className="text-xs text-amber-700 mt-1">Expires in 10 minutes. In production this is emailed.</div>
              </div>
            )}
            <form onSubmit={resetPassword} className="space-y-5" data-testid="reset-form">
              <div className="space-y-2">
                <Label>OTP code</Label>
                <Input data-testid="reset-otp-input" className="h-12 rounded-xl tracking-widest font-mono text-lg" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" maxLength={6} required />
              </div>
              <div className="space-y-2">
                <Label>New password</Label>
                <Input type="password" data-testid="reset-password-input" className="h-12 rounded-xl" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 4 characters" required />
              </div>
              <Button type="submit" disabled={loading} data-testid="reset-submit-btn" className="w-full h-12 rounded-full bg-emerald-900 hover:bg-emerald-950 text-white">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset password"}
              </Button>
              <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => setStep(1)} data-testid="back-to-request-btn">
                ← Use a different account
              </button>
            </form>
          </>
        )}

        <Link to="/login" className="mt-6 inline-flex items-center text-sm text-gray-600 hover:text-gray-900" data-testid="back-to-login-link">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to sign in
        </Link>
        <p className="mt-6 text-xs text-gray-400 text-center">© {new Date().getFullYear()} ChatFlow · vijay_anuganti</p>
      </div>
    </div>
  );
}
