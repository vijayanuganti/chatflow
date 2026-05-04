import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MessageCircle, Briefcase, User, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({
    username: "",
    password: "",
    full_name: "",
    email: "",
    role: "client",
    employee_id: "",
    batch_id: "",
    email_verification_token: "",
  });
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(false);

  const update = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const loadEmployees = async () => {
    setLoadingMeta(true);
    try {
      const res = await api.get("/public/employees");
      setEmployees(res.data || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoadingMeta(false);
    }
  };

  const loadBatches = async (employeeId = form.employee_id) => {
    if (!employeeId) {
      setBatches([]);
      setLoadingMeta(false);
      return;
    }
    setLoadingMeta(true);
    try {
      const res = await api.get("/public/batches", { params: { employee_id: employeeId } });
      setBatches(res.data || []);
    } catch (err) {
      toast.error(formatApiError(err));
      setBatches([]);
    } finally {
      setLoadingMeta(false);
    }
  };

  useEffect(() => {
    // Preload for client flow so dropdowns are instant
    loadEmployees();
  }, []);

  const employeeMap = useMemo(() => {
    const m = {};
    (employees || []).forEach((e) => { m[e.id] = e; });
    return m;
  }, [employees]);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { ...form };
      if (payload.role !== "client") {
        delete payload.employee_id;
        delete payload.batch_id;
      }
      const res = await api.post("/auth/register", payload);
      login(res.data.token, res.data.user);
      toast.success(`Account created. Welcome, ${res.data.user.full_name}!`);
      navigate("/chat");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const sendOtp = async () => {
    const email = (form.email || "").trim();
    if (!email) return toast.error("Enter your email first");
    setSendingOtp(true);
    try {
      await api.post("/auth/email/send-otp", { email });
      setOtpSent(true);
      toast.success("Check your email for the verification code.");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtp = async () => {
    const email = (form.email || "").trim();
    if (!email) return toast.error("Enter your email first");
    if (!otp.trim()) return toast.error("Enter OTP");
    setVerifying(true);
    try {
      const res = await api.post("/auth/email/verify-otp", { email, otp: otp.trim() });
      update("email_verification_token", res.data.email_verification_token);
      toast.success("Email verified");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setVerifying(false);
    }
  };

  const RoleCard = ({ value, icon: Icon, title, desc }) => (
    <button
      type="button"
      onClick={async () => {
        update("role", value);
        if (value === "client") {
          await loadEmployees();
        } else {
          update("employee_id", "");
          update("batch_id", "");
          setEmployees([]);
          setBatches([]);
        }
      }}
      data-testid={`role-${value}-btn`}
      className={`relative p-5 rounded-2xl border-2 text-left transition-all duration-200 ${
        form.role === value ? "border-emerald-900 bg-emerald-50" : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-3 ${
        form.role === value ? "bg-emerald-900 text-white" : "bg-gray-100 text-gray-600"
      }`}>
        <Icon className="h-5 w-5" strokeWidth={1.5} />
      </div>
      <div className="font-display font-semibold">{title}</div>
      <div className="text-xs text-gray-500 mt-1">{desc}</div>
    </button>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-gray-50" data-testid="register-page">
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-sm border border-gray-100 p-5 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-emerald-900 text-white flex items-center justify-center">
            <MessageCircle className="h-6 w-6" />
          </div>
          <span className="font-display text-2xl font-semibold">ChatFlow</span>
        </div>

        <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-1">Create your account</h2>
        <p className="text-gray-500 mb-6">Pick how you'll use ChatFlow.</p>

        <form onSubmit={submit} className="space-y-5" data-testid="register-form">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <RoleCard value="client" icon={User} title="Client" desc="I want to talk to my service provider" />
            <RoleCard value="employee" icon={Briefcase} title="Employee" desc="I support clients at my company" />
          </div>

          {form.role === "client" && (
            <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4" data-testid="client-allocation-panel">
              <div className="text-sm font-medium text-emerald-950">Client allocation</div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Employee</Label>
                  <Select
                    value={form.employee_id || undefined}
                    onValueChange={async (v) => {
                      update("employee_id", v);
                      update("batch_id", "");
                      await loadBatches(v);
                    }}
                    disabled={loadingMeta}
                  >
                    <SelectTrigger className="h-12 rounded-xl bg-white" data-testid="register-employee-select">
                      <SelectValue placeholder={loadingMeta ? "Loading..." : "Select employee"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(employees || []).map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.full_name} (@{e.username})
                        </SelectItem>
                      ))}
                      {(!employees || employees.length === 0) && (
                        <SelectItem value="__none" disabled>
                          No employees found
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Batch</Label>
                  <Select
                    value={form.batch_id || undefined}
                    onValueChange={(v) => update("batch_id", v)}
                    disabled={!form.employee_id || loadingMeta}
                  >
                    <SelectTrigger className="h-12 rounded-xl bg-white" data-testid="register-batch-select">
                      <SelectValue placeholder={!form.employee_id ? "Select employee first" : (loadingMeta ? "Loading..." : "Select batch")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(batches || []).map((b) => (
                        <SelectItem key={b.id} value={b.id} disabled={!!b.is_full}>
                        {(employeeMap[b.employee_id]?.full_name || "Employee")} — {b.name} ({b.client_count || 0}/{b.max_clients || 20}){b.is_full ? " · Full" : ""}
                        </SelectItem>
                      ))}
                      {(!batches || batches.length === 0) && (
                        <SelectItem value="__none" disabled>
                          No batches found
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-emerald-900/70">
                You’ll be auto-connected to your selected employee after signup.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" data-testid="register-fullname-input" className="h-12 rounded-xl" value={form.full_name} onChange={(e) => update("full_name", e.target.value)} placeholder="Jane Doe" required />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" data-testid="register-username-input" className="h-12 rounded-xl" value={form.username} onChange={(e) => update("username", e.target.value)} placeholder="janedoe" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email (required)</Label>
              <div className="relative flex flex-col sm:block gap-2">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    data-testid="register-email-input"
                    className="pl-10 h-12 rounded-xl pr-4 sm:pr-28 w-full min-w-0"
                    value={form.email}
                    onChange={(e) => {
                      update("email", e.target.value);
                      update("email_verification_token", "");
                      setOtp("");
                      setOtpSent(false);
                    }}
                    placeholder="jane@example.com"
                    required
                  />
                </div>
                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={sendingOtp}
                  className="sm:absolute sm:right-2 sm:top-1/2 sm:-translate-y-1/2 text-[11px] sm:text-xs px-3 py-2 sm:py-1.5 rounded-full bg-emerald-900 text-white hover:bg-emerald-950 disabled:opacity-60 w-full sm:w-auto"
                  data-testid="send-email-otp-btn"
                >
                  {sendingOtp ? "Sending…" : "Send OTP"}
                </button>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="email_otp">Email OTP</Label>
              <Input
                id="email_otp"
                data-testid="register-email-otp-input"
                className="h-12 rounded-xl"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder={otpSent ? "Enter the 6-digit OTP" : "Send OTP first"}
                disabled={!otpSent}
              />
            </div>
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button
                type="button"
                onClick={verifyOtp}
                disabled={!otpSent || verifying}
                data-testid="verify-email-otp-btn"
                className="w-full h-12 rounded-xl bg-emerald-900 hover:bg-emerald-950"
              >
                {verifying ? "Verifying…" : (form.email_verification_token ? "Verified" : "Verify OTP")}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" data-testid="register-password-input" className="h-12 rounded-xl" value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="At least 4 characters" required />
          </div>

          <Button
            type="submit"
            disabled={submitting || !form.email_verification_token}
            data-testid="register-submit-btn"
            className="w-full h-12 rounded-full bg-emerald-900 hover:bg-emerald-950 text-white font-medium"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-sm text-gray-600 text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-emerald-900 font-medium hover:underline" data-testid="register-to-login-link">
            Sign in
          </Link>
        </p>
        <p className="mt-4 text-xs text-gray-400 text-center">
          © {new Date().getFullYear()} ChatFlow · Built by vijay_anuganti
        </p>
      </div>
    </div>
  );
}
