import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldAlert,
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Send,
  Inbox,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Avatar from "@/components/Avatar";
import MobilePageShell from "@/components/layout/MobilePageShell";
import {
  COMPLAINT_QUESTIONS,
  ComplaintHistoryCard,
} from "@/components/complaint/complaintShared";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import usePanelMobileBack from "@/hooks/usePanelMobileBack";

export default function RaiseComplaintPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [view, setView] = useState("intro"); // intro | wizard | sent
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [employee, setEmployee] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await api.get("/complaints/me");
      setHistory(res.data || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchEmployee() {
      if (!user?.employee_id) {
        setEmployee(null);
        return;
      }
      try {
        const res = await api.get("/users");
        if (cancelled) return;
        const found = (res.data || []).find((u) => u.id === user.employee_id);
        setEmployee(found || null);
      } catch {
        /* optional */
      }
    }
    void fetchEmployee();
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [user?.employee_id, loadHistory]);

  const totalSteps = COMPLAINT_QUESTIONS.length + 1;
  const isDescriptionStep = step === COMPLAINT_QUESTIONS.length;
  const currentQuestion = COMPLAINT_QUESTIONS[step];

  const canGoNext = useMemo(() => {
    if (isDescriptionStep) return description.trim().length >= 10;
    if (!currentQuestion) return false;
    return Boolean(answers[currentQuestion.id]);
  }, [answers, currentQuestion, description, isDescriptionStep]);

  const pickAnswer = (opt) => {
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: opt }));
  };

  const goNext = () => {
    if (!canGoNext) return;
    if (step < totalSteps - 1) setStep((s) => s + 1);
  };

  const goWizardBack = () => {
    if (step === 0) {
      setView("intro");
      return;
    }
    setStep((s) => Math.max(0, s - 1));
  };

  const handlePageBack = useCallback(() => {
    if (view === "wizard") {
      goWizardBack();
      return true;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return true;
    }
    navigate("/chat", { replace: true });
    return true;
  }, [view, navigate]);

  usePanelMobileBack({
    enabled: true,
    onBack: handlePageBack,
    onExitApp: () => false,
  });

  const submit = async () => {
    if (!canGoNext || submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        description: description.trim(),
        answers: COMPLAINT_QUESTIONS.filter((q) => answers[q.id]).map((q) => ({
          question: q.title,
          answer: answers[q.id],
        })),
      };
      await api.post("/complaints", payload);
      toast.success("Complaint sent. Admin will review it shortly.");
      setView("sent");
      void loadHistory();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const shellDescription =
    view === "intro"
      ? "Tell us what's wrong — we'll keep it confidential."
      : view === "wizard"
        ? `Step ${step + 1} of ${totalSteps}`
        : "Submitted successfully";

  const wizardFooter =
    view === "wizard" ? (
      <div className="flex items-center justify-between gap-2 w-full">
        <Button
          type="button"
          variant="ghost"
          className="rounded-full"
          onClick={goWizardBack}
          disabled={submitting}
          data-testid="complaint-back-btn"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        {isDescriptionStep ? (
          <Button
            type="button"
            onClick={submit}
            disabled={!canGoNext || submitting}
            className="rounded-full bg-emerald-900 hover:bg-emerald-950"
            data-testid="complaint-submit-btn"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="h-4 w-4 mr-1" /> Send complaint
              </>
            )}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={goNext}
            disabled={!canGoNext}
            className="rounded-full bg-emerald-900 hover:bg-emerald-950"
            data-testid="complaint-next-btn"
          >
            Next <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    ) : null;

  return (
    <MobilePageShell
      title="Raise a complaint"
      description={shellDescription}
      onBack={handlePageBack}
      testId="raise-complaint-page"
      footer={wizardFooter}
    >
      <div className="w-full max-w-lg mx-auto space-y-4">
        {view === "intro" && (
          <div className="space-y-4" data-testid="complaint-intro">
            <div className="rounded-2xl border border-rose-200/80 dark:border-rose-500/30 bg-rose-50/80 dark:bg-rose-500/10 p-4">
              <div className="flex items-center gap-2 text-rose-800 dark:text-rose-200 mb-2">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium">We're here to help</span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Hi {user?.full_name?.split(" ")[0] || "there"} — sorry something isn't right.
                An admin will review your complaint and follow up.
              </p>
              {employee && (
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 px-3 py-2">
                  <Avatar
                    name={employee.full_name}
                    avatarUrl={employee.avatar_url}
                    size={36}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                      Your dietitian
                    </div>
                    <div className="text-sm font-medium truncate dark:text-gray-100">
                      {employee.full_name}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Button
              type="button"
              onClick={() => {
                setView("wizard");
                setStep(0);
              }}
              className="w-full h-11 rounded-full bg-emerald-900 hover:bg-emerald-950"
              data-testid="complaint-start-btn"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Start a new complaint
            </Button>

            <div>
              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 mt-2 mb-2">
                <span className="inline-flex items-center gap-1">
                  <Inbox className="h-3 w-3" /> Your complaints
                </span>
                <span>{history.length}</span>
              </div>
              <div className="space-y-3">
                {historyLoading && (
                  <div className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">
                    Loading…
                  </div>
                )}
                {!historyLoading && history.length === 0 && (
                  <div className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
                    You haven't raised any complaints yet.
                  </div>
                )}
                {history.map((c) => (
                  <ComplaintHistoryCard key={c.id} c={c} />
                ))}
              </div>
            </div>
          </div>
        )}

        {view === "wizard" && (
          <div className="space-y-4" data-testid="complaint-wizard">
            <div className="flex items-center gap-1">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <span
                  key={`dot-${i}`}
                  className={`h-1.5 flex-1 rounded-full ${
                    i <= step
                      ? "bg-emerald-700 dark:bg-emerald-400"
                      : "bg-gray-200 dark:bg-gray-700"
                  }`}
                />
              ))}
            </div>

            {!isDescriptionStep && currentQuestion && (
              <div className="space-y-3" data-testid={`complaint-q-${currentQuestion.id}`}>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-300">
                    Question {step + 1} of {totalSteps}
                  </div>
                  <h2 className="font-display text-lg font-semibold mt-1 dark:text-gray-100">
                    {currentQuestion.title}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {currentQuestion.helper}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-1">
                  {currentQuestion.options.map((opt) => {
                    const active = answers[currentQuestion.id] === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => pickAnswer(opt)}
                        data-testid={`complaint-option-${opt}`}
                        className={`text-left text-sm px-4 py-3 rounded-2xl border transition-colors touch-manipulation min-h-[48px] ${
                          active
                            ? "bg-emerald-900 text-white border-emerald-900"
                            : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:border-emerald-700"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {isDescriptionStep && (
              <div className="space-y-3" data-testid="complaint-description-step">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-300">
                    Question {totalSteps} of {totalSteps}
                  </div>
                  <h2 className="font-display text-lg font-semibold mt-1 dark:text-gray-100">
                    Tell us what happened
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Describe the issue in your own words. Minimum 10 characters.
                  </p>
                </div>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  maxLength={4000}
                  placeholder="Share as much detail as you can — what happened, when, and how it's affecting you."
                  data-testid="complaint-description"
                  className="min-h-[140px] w-full rounded-2xl border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 dark:text-gray-100"
                />
                <div className="text-[11px] text-gray-400 dark:text-gray-500 text-right">
                  {description.trim().length} / 4000
                </div>
              </div>
            )}
          </div>
        )}

        {view === "sent" && (
          <div className="text-center space-y-4 py-8" data-testid="complaint-sent">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold dark:text-gray-100">
                Complaint sent
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
                An admin will review it and reach out. You can track the status below.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setView("intro")}
              data-testid="complaint-sent-back"
            >
              Back to my complaints
            </Button>
          </div>
        )}
      </div>
    </MobilePageShell>
  );
}
