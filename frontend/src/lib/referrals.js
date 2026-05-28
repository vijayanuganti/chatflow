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

export function referredByRoleLabel(type) {
  if (type === "employee") return "Employee";
  if (type === "client") return "Client";
  const raw = (type || "").trim();
  if (!raw) return "";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/** Name + optional role badge; hides badge when it would repeat the name (e.g. "Client" + client). */
export function referredByDisplay(row) {
  const name = (row?.referred_by_name || row?.referrer?.full_name || "").trim();
  const role = referredByRoleLabel(row?.referred_by_type);
  if (!name) {
    return { text: role || "—", showBadge: false, badge: role };
  }
  if (!role || name.toLowerCase() === role.toLowerCase()) {
    return { text: name, showBadge: false, badge: role };
  }
  return { text: name, showBadge: true, badge: role };
}

export function referredByDetailLine(row) {
  const { text, showBadge, badge } = referredByDisplay(row);
  if (!showBadge || !badge) return text;
  return `${text} (${badge})`;
}

export function dedupeReferralsById(items) {
  const seen = new Set();
  return (items || []).filter((row) => {
    const id = row?.id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
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
