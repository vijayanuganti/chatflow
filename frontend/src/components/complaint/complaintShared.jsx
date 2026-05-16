import React from "react";
import { CheckCircle2, Clock } from "lucide-react";
import Avatar from "@/components/Avatar";

export const COMPLAINT_QUESTIONS = [
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

export function StatusPill({ status }) {
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

export function ComplaintHistoryCard({ c }) {
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
