import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MessageCircle, Briefcase, User, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  });
  const [submitting, setSubmitting] = useState(false);

  const update = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { ...form };
      if (!payload.email) delete payload.email;
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

  const RoleCard = ({ value, icon: Icon, title, desc }) => (
    <button
      type="button"
      onClick={() => update("role", value)}
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
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50" data-testid="register-page">
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-sm border border-gray-100 p-8 sm:p-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-emerald-900 text-white flex items-center justify-center">
            <MessageCircle className="h-6 w-6" />
          </div>
          <span className="font-display text-2xl font-semibold">ChatFlow</span>
        </div>

        <h2 className="font-display text-3xl font-semibold mb-1">Create your account</h2>
        <p className="text-gray-500 mb-6">Pick how you'll use ChatFlow.</p>

        <form onSubmit={submit} className="space-y-5" data-testid="register-form">
          <div className="grid grid-cols-2 gap-3">
            <RoleCard value="client" icon={User} title="Client" desc="I want to talk to my service provider" />
            <RoleCard value="employee" icon={Briefcase} title="Employee" desc="I support clients at my company" />
          </div>

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
              <Label htmlFor="email">Email (for password reset)</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input id="email" type="email" data-testid="register-email-input" className="pl-10 h-12 rounded-xl" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="jane@example.com" />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" data-testid="register-password-input" className="h-12 rounded-xl" value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="At least 4 characters" required />
          </div>

          <Button type="submit" disabled={submitting} data-testid="register-submit-btn" className="w-full h-12 rounded-full bg-emerald-900 hover:bg-emerald-950 text-white font-medium">
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
