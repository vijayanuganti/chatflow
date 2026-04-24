import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MessageCircle, Lock, User as UserIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post("/auth/login", { username, password });
      login(res.data.token, res.data.user);
      toast.success(`Welcome back, ${res.data.user.full_name}!`);
      if (res.data.user.role === "admin") navigate("/admin");
      else navigate("/chat");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const quickFill = (u, p) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2" data-testid="login-page">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-emerald-900 text-white relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-emerald-700 opacity-30 blur-3xl" />
        <div className="absolute bottom-0 -left-16 w-80 h-80 rounded-full bg-emerald-500 opacity-20 blur-3xl" />
        <div className="flex items-center gap-3 z-10">
          <div className="h-10 w-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
            <MessageCircle className="h-6 w-6" />
          </div>
          <span className="font-display text-2xl font-semibold tracking-tight">ChatFlow</span>
        </div>
        <div className="z-10 space-y-6">
          <h1 className="font-display text-5xl font-light leading-tight">
            Conversations that
            <br />
            <span className="font-semibold">build trust.</span>
          </h1>
          <p className="text-emerald-100 text-lg max-w-md">
            Real-time chat for teams, clients, and admins — with groups, media and live typing.
          </p>
          <div className="space-y-2 text-sm text-emerald-200">
            <p className="tracking-[0.2em] text-[11px] uppercase">Demo credentials</p>
            <button type="button" onClick={() => quickFill("admin", "admin123")} className="block hover:text-white underline-offset-4 hover:underline" data-testid="quickfill-admin-btn">
              admin / admin123 (Admin)
            </button>
            <button type="button" onClick={() => quickFill("employee1", "employee123")} className="block hover:text-white underline-offset-4 hover:underline" data-testid="quickfill-employee-btn">
              employee1 / employee123 (Employee)
            </button>
            <button type="button" onClick={() => quickFill("client1", "client123")} className="block hover:text-white underline-offset-4 hover:underline" data-testid="quickfill-client-btn">
              client1 / client123 (Client)
            </button>
          </div>
        </div>
        <div className="text-xs text-emerald-200 z-10">
          © {new Date().getFullYear()} ChatFlow — Crafted by <span className="font-semibold text-white">vijay_anuganti</span>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-white">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-xl bg-emerald-900 text-white flex items-center justify-center">
              <MessageCircle className="h-6 w-6" />
            </div>
            <span className="font-display text-2xl font-semibold">ChatFlow</span>
          </div>

          <h2 className="font-display text-3xl font-semibold mb-2">Welcome back</h2>
          <p className="text-gray-500 mb-8">Sign in to continue your conversations.</p>

          <form onSubmit={handleSubmit} className="space-y-5" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="username">Username or email</Label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="username"
                  data-testid="login-username-input"
                  className="pl-10 h-12 rounded-xl"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your username or email"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-xs text-emerald-900 hover:underline" data-testid="forgot-password-link">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="password"
                  data-testid="login-password-input"
                  type="password"
                  className="pl-10 h-12 rounded-xl"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>
            <Button type="submit" disabled={submitting} data-testid="login-submit-btn" className="w-full h-12 rounded-full bg-emerald-900 hover:bg-emerald-950 text-white font-medium">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
            </Button>
          </form>

          <p className="mt-8 text-sm text-gray-600">
            New here?{" "}
            <Link to="/register" className="text-emerald-900 font-medium hover:underline" data-testid="login-to-register-link">
              Create an account
            </Link>
          </p>
          <p className="mt-6 text-xs text-gray-400 text-center">
            © {new Date().getFullYear()} ChatFlow · Designed & built by vijay_anuganti
          </p>
        </div>
      </div>
    </div>
  );
}
