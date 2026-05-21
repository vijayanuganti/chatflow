/** Folder library access presets (must match backend folders_api). */

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

export const EMPLOYEE_FOLDER_ACCESS_PRESETS = [
  { id: "all_clients", label: "All Clients" },
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

export function buildEmployeeAccessRulesFromSelection({ presets = [], specificClients = [] }) {
  const rules = presets.map((access_type) => ({ access_type, user_id: null, user_type: null }));
  for (const u of specificClients) {
    if (!u?.id) continue;
    rules.push({
      access_type: "specific_client",
      user_id: u.id,
      user_type: "client",
    });
  }
  return rules;
}

export function employeeAccessRulesToSelection(access = []) {
  const presets = [];
  const specificClientIds = [];
  for (const r of access) {
    if (r.access_type === "specific_client" && r.user_id) {
      specificClientIds.push(r.user_id);
    } else if (EMPLOYEE_FOLDER_ACCESS_PRESETS.some((p) => p.id === r.access_type)) {
      presets.push(r.access_type);
    }
  }
  return { presets, specificClientIds };
}

export function formatFolderCounts(itemCounts) {
  if (!itemCounts) return "";
  const parts = FOLDER_CATEGORIES.map((c) => {
    const n = itemCounts[c.id] ?? 0;
    return n > 0 ? `${n} ${c.label}` : null;
  }).filter(Boolean);
  return parts.length ? parts.join(", ") : "Empty";
}
