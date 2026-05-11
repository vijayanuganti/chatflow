import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldAlert,
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Clock,
  Send,
  Inbox,
  Plus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Avatar from "@/components/Avatar";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

/**
 * Guided complaint intake. Each step asks one question with a small set of
 * suggested chips so the client can describe the situation quickly. The final
 * step is a free-form text area + send.
 *
 * Suggestions were chosen to surface the most common issues that show up in
 * dietitian/nutritionist support tickets — feel free to tune the wording later.
 */
const QUESTIONS = [
  {
    id: "topic",
    title: "What's the issue about?",
    helper: "Pick the closest fit — you can describe more in the next step.",
    options: [
      "Diet plan not suitable",
      "No reply / slow response",
      "Behaviour or tone",
      "Wrong medical advice",
      "Schedule / consultation missed",
      "Other",
    ],
  },
  {
    id: "urgency",
    title: "How urgent is this?",
    helper: "We'll prioritise high-urgency complaints first.",
    options: [
      "Low — just feedback",
      "Medium — please look soon",
      "High — needs attention now",
    ],
  },
  {
    id: "tried_already",
    title: "Have you raised this with your dietitian already?",
    helper: "Helps us decide who should reach out first.",
    options: [
      "Yes, but no resolution",
      "No, I'd rather speak to admin",
      "They didn't respond",
    ],
  },
];

function StatusPill({ status }) {
  if (status === "solved") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] px-2 py-1 rounded-full bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> Solved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] px-2 py-1 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );
}

function ComplaintHistoryCard({ c }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
            {c.created_at ? new Date(c.created_at).toLocaleString() : "—"}
          </div>
          {c.employee && (
            <div className="mt-1 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <Avatar name={c.employee.full_name} avatarUrl={c.employee.avatar_url} size={24} />
              <span className="truncate">About {c.employee.full_name}</span>
            </div>
          )}
        </div>
        <StatusPill status={c.status} />
      </div>
      {Array.isArray(c.answers) && c.answers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {c.answers.map((a, i) => (
            <span
              key={`${c.id}-a-${i}`}
              className="text-[11px] px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            >
              {a.answer}
            </span>
          ))}
        </div>
      )}
      <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
        {c.description}
      </p>
      {c.status === "solved" && c.resolution_notes && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-300">
            Admin response
          </div>
          <p className="text-sm text-emerald-900 dark:text-emerald-100 mt-1 whitespace-pre-wrap break-words">
            {c.resolution_notes}
          </p>
          {c.resolver?.full_name && (
            <div className="text-[11px] text-emerald-700 dark:text-emerald-200 mt-2">
              — {c.resolver.full_name}
              {c.resolved_at ? ` · ${new Date(c.resolved_at).toLocaleString()}` : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ComplaintDialog({ open, onOpenChange }) {
  const { user } = useAuth();

  const [view, setView] = useState("intro"); // intro | wizard | sent | history
  const [step, setStep] = useState(0);       // 0..QUESTIONS.length, last step = description
  const [answers, setAnswers] = useState({}); // { [questionId]: optionText }
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

  // Resolve the assigned employee from the client's `employee_id` (if any).
  useEffect(() => {
    if (!open) return undefined;
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
        // ignore — we'll just submit without an employee label
      }
    }
    fetchEmployee();
    loadHistory();
    return () => { cancelled = true; };
  }, [open, user?.employee_id, loadHistory]);

  // Reset the wizard whenever the dialog closes.
  useEffect(() => {
    if (open) return;
    setView("intro");
    setStep(0);
    setAnswers({});
    setDescription("");
    setSubmitting(false);
  }, [open]);

  const totalSteps = QUESTIONS.length + 1; // chip questions + description
  const isDescriptionStep = step === QUESTIONS.length;
  const currentQuestion = QUESTIONS[step];

  const canGoNext = useMemo(() => {
    if (isDescriptionStep) return description.trim().length >= 10;
    if (!currentQuestion) return false;
    return Boolean(answers[currentQuestion.id]);
  }, [answers, currentQuestion, description, isDescriptionStep]);

  function pickAnswer(opt) {
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: opt }));
  }

  function goNext() {
    if (!canGoNext) return;
    if (step < totalSteps - 1) {
      setStep((s) => s + 1);
    }
  }

  function goBack() {
    if (step === 0) {
      setView("intro");
      return;
    }
    setStep((s) => Math.max(0, s - 1));
  }

  async function submit() {
    if (!canGoNext || submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        description: description.trim(),
        answers: QUESTIONS
          .filter((q) => answers[q.id])
          .map((q) => ({ question: q.title, answer: answers[q.id] })),
      };
      await api.post("/complaints", payload);
      toast.success("Complaint sent. Admin will review it shortly.");
      setView("sent");
      loadHistory();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg p-0 overflow-hidden bg-white dark:bg-gray-950 max-h-[92dvh] flex flex-col"
        data-testid="complaint-dialog"
      >
        <DialogHeader className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <DialogTitle className="flex items-center gap-2 dark:text-gray-100">
            <span className="h-9 w-9 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300 flex items-center justify-center">
              <ShieldAlert className="h-4 w-4" />
            </span>
            Raise a complaint
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto p-5 space-y-4 flex-1 min-h-0">
          {view === "intro" && (
            <div className="space-y-4" data-testid="complaint-intro">
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-4">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Hi {user?.full_name?.split(" ")[0] || "there"} 👋
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Sorry to hear something isn't right. Tell us what's going on
                  and an admin will look into it. We'll keep your complaint
                  confidential.
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
                onClick={() => { setView("wizard"); setStep(0); }}
                className="w-full h-11 rounded-full bg-emerald-900 hover:bg-emerald-950"
                data-testid="complaint-start-btn"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Start a new complaint
              </Button>

              <div>
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 mt-4 mb-2">
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
              {/* Progress dots */}
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
                    <h3 className="font-display text-lg font-semibold mt-1 dark:text-gray-100">
                      {currentQuestion.title}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {currentQuestion.helper}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {currentQuestion.options.map((opt) => {
                      const active = answers[currentQuestion.id] === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => pickAnswer(opt)}
                          data-testid={`complaint-option-${opt}`}
                          className={`text-left text-sm px-4 py-3 rounded-2xl border transition-colors ${
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
                    <h3 className="font-display text-lg font-semibold mt-1 dark:text-gray-100">
                      Tell us what happened
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Describe the issue in your own words. Minimum 10 characters.
                    </p>
                  </div>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={6}
                    placeholder="Share as much detail as you can — what happened, when, and how it's affecting you."
                    data-testid="complaint-description"
                    className="min-h-[140px] rounded-2xl border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 dark:text-gray-100"
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
                <h3 className="font-display text-xl font-semibold dark:text-gray-100">
                  Complaint sent
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  An admin will review it and reach out. You can track the
                  status from your complaint history.
                </p>
              </div>
              <Button
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

        {view === "wizard" && (
          <div className="shrink-0 border-t border-gray-100 dark:border-gray-800 p-3 flex items-center justify-between gap-2 bg-white dark:bg-gray-950">
            <Button
              variant="ghost"
              className="rounded-full"
              onClick={goBack}
              disabled={submitting}
              data-testid="complaint-back-btn"
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            {isDescriptionStep ? (
              <Button
                onClick={submit}
                disabled={!canGoNext || submitting}
                className="rounded-full bg-emerald-900 hover:bg-emerald-950"
                data-testid="complaint-submit-btn"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                  <>
                    <Send className="h-4 w-4 mr-1" /> Send complaint
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={goNext}
                disabled={!canGoNext}
                className="rounded-full bg-emerald-900 hover:bg-emerald-950"
                data-testid="complaint-next-btn"
              >
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
