import React, { useMemo, useState } from "react";
import { CheckCircle2, Loader2, UserPlus, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { COMPANY_PRIMARY } from "@/lib/appInfo";
import COUNTRIES, { DEFAULT_COUNTRY_CODE, getCountry } from "@/lib/countries";
import { HEALTH_GOALS } from "@/lib/referrals";
import { toast } from "sonner";

const NOTES_MAX = 200;

const EMPTY_FORM = {
  referred_name: "",
  phone_local: "",
  referred_email: "",
  referred_age: "",
  health_goal: "",
  health_goal_other: "",
  notes: "",
};

export default function ReferClientSheet({ open, onOpenChange }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [countryOpen, setCountryOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const country = getCountry(countryCode);
  const referredByLabel = user?.full_name || "—";
  const referredById = user?.id || "—";

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setCountryCode(DEFAULT_COUNTRY_CODE);
    setSuccess(false);
  };

  const handleOpenChange = (next) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const submit = async () => {
    if (submitting) return;
    const name = form.referred_name.trim();
    const digits = (form.phone_local || "").replace(/[^\d]/g, "");
    if (!name) {
      toast.error("Full name is required");
      return;
    }
    if (!digits || digits.length < 7) {
      toast.error("A valid phone number is required");
      return;
    }
    if (!form.health_goal) {
      toast.error("Please select a health goal");
      return;
    }
    if (form.health_goal === "other" && !form.health_goal_other.trim()) {
      toast.error("Please describe the health goal");
      return;
    }

    const phone = `${country.dial}${digits}`;
    setSubmitting(true);
    try {
      await api.post("/referrals", {
        referred_name: name,
        referred_phone: phone,
        referred_email: form.referred_email.trim() || null,
        referred_age: form.referred_age ? Number(form.referred_age) : null,
        health_goal: form.health_goal,
        health_goal_other:
          form.health_goal === "other" ? form.health_goal_other.trim() : null,
        notes: form.notes.trim().slice(0, NOTES_MAX) || null,
      });
      setSuccess(true);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const notesLen = form.notes.length;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-[20px] border-0 bg-white p-0 max-h-[92vh] overflow-hidden flex flex-col dark:bg-gray-950 [&>button]:hidden"
        data-testid="refer-client-sheet"
      >
        <SheetTitle className="sr-only">Refer a Client</SheetTitle>
        <div className="shrink-0 flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden />
        </div>

        {success ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <CheckCircle2
              className="h-16 w-16 mb-4"
              style={{ color: COMPANY_PRIMARY }}
              strokeWidth={1.5}
            />
            <h2 className="text-[18px] font-bold text-[#1A1A2E] dark:text-gray-100">
              Referral Sent!
            </h2>
            <p className="mt-3 max-w-sm text-[13px] text-[#6B7280] dark:text-gray-400 leading-relaxed">
              Thank you! Admin will review and reach out to your referral soon.
            </p>
            <div className="mt-8 flex w-full max-w-sm flex-col gap-2">
              <Button
                type="button"
                className="w-full rounded-lg h-11 text-white"
                style={{ backgroundColor: COMPANY_PRIMARY }}
                onClick={resetForm}
                data-testid="refer-another-btn"
              >
                Refer Another
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-lg h-11"
                onClick={() => handleOpenChange(false)}
                data-testid="refer-done-btn"
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
            <div className="pt-2 pb-4">
              <h2
                className="text-[18px] font-bold"
                style={{ color: COMPANY_PRIMARY }}
              >
                Refer a Client
              </h2>
              <p className="mt-1 text-[12px] text-[#6B7280] dark:text-gray-400 leading-relaxed">
                Know someone who could benefit? Send us their details and we&apos;ll reach out.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-xs text-gray-600 dark:text-gray-400">
                  Full Name <span className="text-rose-600">*</span>
                </Label>
                <Input
                  value={form.referred_name}
                  onChange={(e) => setForm((f) => ({ ...f, referred_name: e.target.value }))}
                  placeholder="Enter full name"
                  className="mt-1 rounded-lg"
                  data-testid="refer-name-input"
                />
              </div>

              <div>
                <Label className="text-xs text-gray-600 dark:text-gray-400">
                  Phone Number <span className="text-rose-600">*</span>
                </Label>
                <div className="mt-1 flex gap-2">
                  <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0 rounded-lg px-2 gap-1 h-10"
                      >
                        <span>{country.flag}</span>
                        <span className="text-xs">{country.dial}</span>
                        <ChevronDown className="h-3 w-3 opacity-60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2 max-h-56 overflow-y-auto" align="start">
                      {COUNTRIES.map((c) => (
                        <button
                          key={c.code}
                          type="button"
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-gray-100 dark:hover:bg-gray-800 text-left"
                          onClick={() => {
                            setCountryCode(c.code);
                            setCountryOpen(false);
                          }}
                        >
                          <span>{c.flag}</span>
                          <span className="flex-1 truncate">{c.name}</span>
                          <span className="text-gray-500">{c.dial}</span>
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                  <Input
                    type="tel"
                    inputMode="numeric"
                    value={form.phone_local}
                    onChange={(e) => setForm((f) => ({ ...f, phone_local: e.target.value }))}
                    placeholder="Enter phone number"
                    className="flex-1 rounded-lg"
                    data-testid="refer-phone-input"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs text-gray-600 dark:text-gray-400">Email Address</Label>
                <Input
                  type="email"
                  value={form.referred_email}
                  onChange={(e) => setForm((f) => ({ ...f, referred_email: e.target.value }))}
                  placeholder="Enter email address (optional)"
                  className="mt-1 rounded-lg"
                  data-testid="refer-email-input"
                />
              </div>

              <div>
                <Label className="text-xs text-gray-600 dark:text-gray-400">Age</Label>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={form.referred_age}
                  onChange={(e) => setForm((f) => ({ ...f, referred_age: e.target.value }))}
                  placeholder="Enter age (optional)"
                  className="mt-1 rounded-lg"
                  data-testid="refer-age-input"
                />
              </div>

              <div>
                <Label className="text-xs text-gray-600 dark:text-gray-400">
                  Health Goal / Reason for Referral
                </Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {HEALTH_GOALS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, health_goal: g.id }))}
                      className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                        form.health_goal === g.id
                          ? "border-[#064e3b] bg-[#ecfdf5] text-[#064e3b] dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-600"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400"
                      }`}
                      data-testid={`refer-goal-${g.id}`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
                {form.health_goal === "other" && (
                  <Input
                    value={form.health_goal_other}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, health_goal_other: e.target.value }))
                    }
                    placeholder="Describe health goal"
                    className="mt-2 rounded-lg"
                    data-testid="refer-goal-other-input"
                  />
                )}
              </div>

              <div>
                <Label className="text-xs text-gray-600 dark:text-gray-400">
                  Any Notes for Admin
                </Label>
                <div className="relative mt-1">
                  <Textarea
                    value={form.notes}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        notes: e.target.value.slice(0, NOTES_MAX),
                      }))
                    }
                    placeholder="Any additional info admin should know... (optional)"
                    rows={3}
                    className="rounded-lg resize-none pr-12"
                    data-testid="refer-notes-input"
                  />
                  <span className="absolute bottom-2 right-2 text-[10px] text-gray-400 tabular-nums">
                    {notesLen}/{NOTES_MAX}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-[#E5E7EB] bg-gray-50/80 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/50">
                <p className="text-[10px] text-[#6B7280] dark:text-gray-500 uppercase tracking-wide">
                  Referred by
                </p>
                <p className="text-[11px] font-bold text-[#1A1A2E] dark:text-gray-100 mt-0.5">
                  {referredByLabel}
                </p>
                <p className="text-[10px] text-gray-500 font-mono mt-0.5">{referredById}</p>
              </div>

              <Button
                type="button"
                disabled={submitting}
                className="w-full rounded-lg h-11 text-white mt-2"
                style={{ backgroundColor: COMPANY_PRIMARY }}
                onClick={() => void submit()}
                data-testid="refer-submit-btn"
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Send Referral
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
