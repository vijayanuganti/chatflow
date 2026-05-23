import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { MessageCircle, Phone, User as UserIcon, Loader2, ShieldCheck, Search, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import PasswordInput from "@/components/PasswordInput";
import { api, formatApiError, BROWSER_ID_KEY } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import COUNTRIES, { DEFAULT_COUNTRY_CODE, getCountry } from "@/lib/countries";
import ForceLogoutModal from "@/components/ForceLogoutModal";
import {
  consumeForceLogoutPending,
  LOGOUT_REASON_ANOTHER_DEVICE,
} from "@/lib/forcedLogout";

// Heuristic: any character that's not a digit / space / dash / plus / brackets
// means the user is typing a username rather than a phone number.
const USERNAME_RE = /[A-Za-z_]/;

function looksLikeUsername(value) {
  if (!value) return false;
  return USERNAME_RE.test(value);
}

function digitsOnly(value) {
  return (value || "").replace(/[^\d]/g, "");
}

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, user, loading } = useAuth();
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [identifier, setIdentifier] = useState(""); // either phone digits or username
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");
  /** When false, session is tab-only (no token in localStorage); new tabs in this profile start logged out. */
  const [staySignedIn, setStaySignedIn] = useState(true);
  const loginCardRef = useRef(null);
  const passwordRef = useRef(null);
  const [forceLogoutOpen, setForceLogoutOpen] = useState(false);

  useEffect(() => {
    if (consumeForceLogoutPending()) {
      setForceLogoutOpen(true);
    }
  }, []);

  // If the user is already authenticated (e.g. they pressed the system Back
  // button from inside the app and somehow landed here), bounce them right
  // back to their dashboard instead of asking them to log in again.
  useEffect(() => {
    if (loading || !user) return;
    const target = user.role === "admin" ? "/admin" : "/chat";
    navigate(target, { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.minHeight = "100dvh";
    const handler = () => {
      const card = loginCardRef.current;
      if (!card || !window.visualViewport) return;
      const keyboardHeight = Math.max(0, window.innerHeight - window.visualViewport.height);
      card.style.transform = keyboardHeight > 0 ? `translateY(-${keyboardHeight * 0.4}px)` : "";
    };
    window.visualViewport?.addEventListener("resize", handler);
    window.visualViewport?.addEventListener("scroll", handler);
    return () => {
      root.style.minHeight = "";
      if (loginCardRef.current) loginCardRef.current.style.transform = "";
      window.visualViewport?.removeEventListener("resize", handler);
      window.visualViewport?.removeEventListener("scroll", handler);
    };
  }, []);

  const country = getCountry(countryCode);
  const isUsername = useMemo(() => looksLikeUsername(identifier), [identifier]);

  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.dial.includes(q) ||
      c.code.toLowerCase().includes(q),
    );
  }, [countryQuery]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = (identifier || "").trim();
    if (!trimmed) return toast.error(t("login.toastIdentifier"));
    if (!password) return toast.error(t("login.toastPassword"));

    const localDigits = digitsOnly(trimmed);
    const looksLikePhone =
      trimmed.startsWith("+") ||
      (/^\d{7,15}$/.test(localDigits) && !isUsername);
    const resolvedIdentifier = looksLikePhone
      ? (trimmed.startsWith("+") ? trimmed : `${country.dial}${localDigits}`)
      : trimmed;
    if (looksLikePhone && !localDigits) {
      return toast.error(t("login.toastInvalid"));
    }
    // Send legacy fields too — production API may not have `identifier` until backend is redeployed.
    const payload = {
      identifier: resolvedIdentifier,
      password,
      ...(looksLikePhone
        ? { phone_number: resolvedIdentifier }
        : { username: resolvedIdentifier }),
    };

    setSubmitting(true);
    try {
      const res = await api.post("/auth/login", payload);
      const installId = res.data?.browser_install_id;
      if (installId && typeof installId === "string") {
        try {
          localStorage.setItem(BROWSER_ID_KEY, installId.trim());
        } catch {
          /* ignore */
        }
      }
      login(res.data.user, res.data.access_token, staySignedIn);
      if (Capacitor.isNativePlatform()) {
        void SplashScreen.hide({ fadeOutDuration: 0 }).catch(() => {});
      }
      toast.success(t("login.toastWelcome", { name: res.data.user.full_name }));
      if ((res.data.user.role || "").toLowerCase() === "admin") navigate("/admin", { replace: true });
      else navigate("/chat", { replace: true });
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-[100dvh] flex flex-col max-w-[100vw] bg-white dark:bg-gray-950 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] pb-[max(1rem,env(safe-area-inset-bottom,0px))]"
      data-testid="login-page"
    >
      <div className="flex flex-col w-full min-h-0 flex-1 lg:grid lg:grid-cols-2 overflow-y-auto overflow-x-hidden">
      {/* Brand panel */}
      <div className="hidden lg:flex min-h-0 flex-col justify-between py-12 pl-[max(3rem,env(safe-area-inset-left,0px))] pr-[max(3rem,env(safe-area-inset-right,0px))] pb-[max(3rem,env(safe-area-inset-bottom,0px))] bg-emerald-900 text-white relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-emerald-700 opacity-30 blur-3xl" />
        <div className="absolute bottom-0 -left-16 w-80 h-80 rounded-full bg-emerald-500 opacity-20 blur-3xl" />

        <div className="flex items-center gap-3 z-10">
          <div className="h-10 w-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
            <MessageCircle className="h-6 w-6" />
          </div>
          <span className="font-display text-2xl font-semibold tracking-tight">{t("common.appName")}</span>
        </div>

        <div className="z-10 space-y-6">
          <h1 className="font-display text-5xl font-light leading-tight">
            {t("login.headline1")}
            <br />
            <span className="font-semibold">{t("login.headline2")}</span>
          </h1>
          <p className="text-emerald-100 text-lg max-w-md">
            {t("login.subtitle")}
          </p>
          <div className="flex items-center gap-3 text-sm text-emerald-100/90">
            <ShieldCheck className="h-5 w-5 text-emerald-200" />
            <span>
              {t("login.adminNotice")}
            </span>
          </div>
        </div>

        <div className="text-xs text-emerald-200 z-10">
          © {new Date().getFullYear()} ChatFlow — Crafted by{" "}
          <span className="font-semibold text-white">vijay_anuganti</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-col bg-white dark:bg-gray-950 p-6 md:p-12 pl-[max(1.5rem,env(safe-area-inset-left,0px))] pr-[max(1.5rem,env(safe-area-inset-right,0px))]">
        <div ref={loginCardRef} className="m-auto w-full max-w-md min-w-0 transition-transform duration-200 ease-out">
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-emerald-900 text-white flex items-center justify-center">
              <MessageCircle className="h-6 w-6" />
            </div>
            <span className="font-display text-2xl font-semibold dark:text-gray-100">{t("common.appName")}</span>
          </div>

          <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-2 dark:text-gray-100">{t("login.welcome")}</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6 sm:mb-8">
            {t("login.signInHint")}
          </p>

          <form onSubmit={handleSubmit} className="space-y-5 w-full min-w-0" data-testid="login-form">
            <div className="space-y-2 w-full min-w-0">
              <Label htmlFor="identifier">{t("login.identifier")}</Label>
              <div className="flex w-full min-w-0 items-stretch gap-2">
                {/* Country code selector — disabled when the input looks like
                    a username (we don't need a dial code in that case). */}
                <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={`flex items-center gap-1.5 h-12 px-3 rounded-xl border bg-white dark:bg-gray-900 transition-colors text-sm font-medium select-none ${
                        isUsername
                          ? "border-gray-100 dark:border-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed"
                          : "border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 hover:border-emerald-700"
                      }`}
                      disabled={isUsername}
                      data-testid="login-country-trigger"
                      aria-label={t("login.countryAria")}
                      title={isUsername ? t("login.countryTitleDisabled") : `${country.name} (${country.dial})`}
                    >
                      <span className="text-base leading-none">{country.flag}</span>
                      <span className="tabular-nums">{country.dial}</span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    sideOffset={6}
                    className="p-0 w-72 max-h-80 overflow-hidden flex flex-col"
                    data-testid="login-country-menu"
                  >
                    <div className="p-2 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                      <Search className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                      <input
                        autoFocus
                        value={countryQuery}
                        onChange={(e) => setCountryQuery(e.target.value)}
                        placeholder={t("login.countrySearch")}
                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500 dark:text-gray-100"
                        data-testid="login-country-search"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {filteredCountries.length === 0 && (
                        <div className="py-6 text-center text-xs text-gray-400 dark:text-gray-500">
                          {t("login.countryNoMatches")}
                        </div>
                      )}
                      {filteredCountries.map((c) => (
                        <button
                          type="button"
                          key={c.code}
                          onClick={() => {
                            setCountryCode(c.code);
                            setCountryOpen(false);
                            setCountryQuery("");
                          }}
                          data-testid={`login-country-option-${c.code}`}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${
                            c.code === countryCode ? "bg-emerald-50 dark:bg-emerald-500/10" : ""
                          }`}
                        >
                          <span className="text-base leading-none">{c.flag}</span>
                          <span className="flex-1 min-w-0 truncate dark:text-gray-100">{c.name}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{c.dial}</span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                <div className="relative flex-1 min-w-0">
                  {isUsername
                    ? <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    : <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />}
                  <Input
                    id="identifier"
                    data-testid="login-identifier-input"
                    className="w-full pl-10 h-12 rounded-xl"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={t("login.identifierPlaceholder")}
                    inputMode={isUsername ? "text" : "tel"}
                    autoComplete={isUsername ? "username" : "tel"}
                    required
                  />
                </div>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                {isUsername
                  ? t("login.hintUsername")
                  : t("login.hintPhone", { dial: country.dial })}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t("login.password")}</Label>
              <PasswordInput
                ref={passwordRef}
                id="password"
                data-testid="login-password-input"
                className="w-full h-12 rounded-xl"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => {
                  window.setTimeout(() => {
                    passwordRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
                  }, 300);
                }}
                placeholder={t("login.passwordPlaceholder")}
                autoComplete="current-password"
                required
              />
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/50 px-3 py-3">
              <Checkbox
                id="stay-signed-in"
                checked={staySignedIn}
                onCheckedChange={(v) => setStaySignedIn(v === true)}
                data-testid="login-stay-signed-in"
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <Label htmlFor="stay-signed-in" className="text-sm font-medium cursor-pointer leading-snug">
                  {t("login.staySignedIn")}
                </Label>
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              data-testid="login-submit-btn"
              className="w-full h-12 rounded-full bg-emerald-900 hover:bg-emerald-950 text-white font-medium"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("login.submit")}
            </Button>
          </form>

          <div
            className="mt-8 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300 flex gap-3"
            data-testid="login-help"
          >
            <ShieldCheck className="h-5 w-5 text-emerald-800 dark:text-emerald-300 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">{t("login.needAccount")}</div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t("login.noSelfSignup")}
              </p>
            </div>
          </div>

          <p className="mt-6 text-xs text-gray-400 dark:text-gray-500 text-center">
            © {new Date().getFullYear()} ChatFlow · Designed & built by vijay_anuganti
          </p>
        </div>
      </div>
      </div>

      <ForceLogoutModal
        open={forceLogoutOpen}
        reason={LOGOUT_REASON_ANOTHER_DEVICE}
        onConfirm={() => setForceLogoutOpen(false)}
      />
    </div>
  );
}
