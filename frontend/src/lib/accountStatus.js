/** Client lifecycle (separate from presence `status` on users). */
export function getClientStatus(user) {
  if (!user || user.role !== "client") return null;
  const cs = (user.client_status || "").toLowerCase();
  if (cs === "active" || cs === "inactive" || cs === "dropped") return cs;
  return user.is_active === false ? "inactive" : "active";
}

export function isActiveEmployee(user) {
  return user?.role === "employee" && user.is_active !== false;
}

export function isInactiveEmployee(user) {
  return user?.role === "employee" && user.is_active === false;
}

export const USERS_LIST_TABS = [
  { id: "all", label: "All" },
  { id: "active_employees", label: "Active Employees" },
  { id: "inactive_employees", label: "Inactive Employees" },
  { id: "active_clients", label: "Active Clients" },
  { id: "inactive_clients", label: "Inactive Clients" },
  { id: "dropped_clients", label: "Dropped Clients" },
];

export function filterUserForTab(user, tabId) {
  if (!user) return false;
  switch (tabId) {
    case "all":
      return true;
    case "active_employees":
      return isActiveEmployee(user);
    case "inactive_employees":
      return isInactiveEmployee(user);
    case "active_clients":
      return user.role === "client" && getClientStatus(user) === "active";
    case "inactive_clients":
      return user.role === "client" && getClientStatus(user) === "inactive";
    case "dropped_clients":
      return user.role === "client" && getClientStatus(user) === "dropped";
    default:
      return true;
  }
}

export function countUsersForTab(users, tabId) {
  return (users || []).filter((u) => filterUserForTab(u, tabId)).length;
}

export const BATCH_LIST_TABS = [
  { id: "active", label: "Active Batches" },
  { id: "inactive", label: "Inactive Batches" },
  { id: "dropped", label: "Dropped Batch" },
];

export function filterBatchForTab(batch, tabId) {
  const status = (batch?.status || "active").toLowerCase();
  if (tabId === "active") return status === "active";
  if (tabId === "inactive") return status === "inactive";
  if (tabId === "dropped") return status === "dropped";
  return true;
}
