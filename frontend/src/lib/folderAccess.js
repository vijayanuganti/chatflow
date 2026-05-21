/** Folder library access presets (must match backend folders_api.FOLDER_ACCESS_TYPES). */

export const FOLDER_CATEGORIES = [
  { id: "links", label: "Links" },
  { id: "videos", label: "Videos" },
  { id: "photos", label: "Photos" },
  { id: "documents", label: "Documents" },
];

export const FOLDER_ACCESS_PRESETS = [
  { id: "all", label: "All Employees & Clients" },
  { id: "active_employees", label: "Active Employees" },
  { id: "inactive_employees", label: "Inactive Employees" },
  { id: "active_clients", label: "Active Clients" },
  { id: "inactive_clients", label: "Inactive Clients" },
  { id: "dropped_clients", label: "Dropped Clients" },
];

export function buildAccessRulesFromSelection({ presets = [], specificUsers = [] }) {
  const rules = presets.map((access_type) => ({ access_type, user_id: null, user_type: null }));
  for (const u of specificUsers) {
    if (!u?.id) continue;
    rules.push({
      access_type: "specific_user",
      user_id: u.id,
      user_type: u.role === "client" ? "client" : "employee",
    });
  }
  return rules;
}

export function formatFolderCounts(itemCounts) {
  if (!itemCounts) return "";
  const parts = FOLDER_CATEGORIES.map((c) => {
    const n = itemCounts[c.id] ?? 0;
    return n > 0 ? `${n} ${c.label}` : null;
  }).filter(Boolean);
  return parts.length ? parts.join(", ") : "Empty";
}
