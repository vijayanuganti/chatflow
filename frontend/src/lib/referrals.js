/** Referral health goals and status labels (shared UI + API values). */

export const HEALTH_GOALS = [
  { id: "weight_loss", label: "Weight Loss" },
  { id: "muscle_gain", label: "Muscle Gain" },
  { id: "general_fitness", label: "General Fitness" },
  { id: "diet_planning", label: "Diet Planning" },
  { id: "medical_condition", label: "Medical Condition" },
  { id: "other", label: "Other" },
];

export const REFERRAL_STATUSES = [
  { id: "pending", label: "Pending" },
  { id: "converted", label: "Converted" },
  { id: "rejected", label: "Rejected" },
];

export function healthGoalLabel(id, otherText) {
  if (id === "other" && otherText) return otherText;
  return HEALTH_GOALS.find((g) => g.id === id)?.label || id || "—";
}

export function referralStatusBadgeClass(status) {
  if (status === "converted") {
    return "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
  }
  if (status === "rejected") {
    return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  }
  return "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
}

export function matchesReferralSearch(row, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return true;
  const parts = [
    row.referred_name,
    row.referred_phone,
    row.referred_email,
    row.referred_by_name,
    row.referred_by_type,
  ];
  return parts.some((p) => (p || "").toLowerCase().includes(q));
}
