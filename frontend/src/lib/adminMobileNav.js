/**
 * Admin mobile drill-down via URL search params + browser history.
 */

export const ADMIN_CHAT_QUERY = "c";
export const ADMIN_BATCH_EMPLOYEE_QUERY = "be";
export const ADMIN_BATCH_STEP_QUERY = "bs"; // employees | batches | chat

export const ADMIN_ACTIVITY_USER_QUERY = "au";
export const ADMIN_ACTIVITY_STEP_QUERY = "as"; // detail | convs | chat

export const ADMIN_MOBILE_ROOT_TABS = new Set(["overview", "mychats", "users", "more"]);

/** Sections opened from Settings & more (stacked over /admin/more). */
export const ADMIN_SETTINGS_TABS = new Set([
  "chats",
  "batches",
  "folders",
  "permissions",
  "complaints",
  "storage",
  "inactive",
]);

export function getAdminChatConversationId(searchParams) {
  const id = searchParams.get(ADMIN_CHAT_QUERY);
  return id && id.length > 0 ? id : null;
}

export function getAdminBatchEmployeeId(searchParams) {
  const id = searchParams.get(ADMIN_BATCH_EMPLOYEE_QUERY);
  return id && id.length > 0 ? id : null;
}

export function getAdminBatchStep(searchParams) {
  const step = searchParams.get(ADMIN_BATCH_STEP_QUERY);
  if (step === "batches" || step === "chat") return step;
  return "employees";
}

export function getAdminActivityUserId(searchParams) {
  const id = searchParams.get(ADMIN_ACTIVITY_USER_QUERY);
  return id && id.length > 0 ? id : null;
}

export function getAdminActivityStep(searchParams) {
  const step = searchParams.get(ADMIN_ACTIVITY_STEP_QUERY);
  if (step === "detail" || step === "convs" || step === "chat") return step;
  return null;
}

export function buildAdminSearchParams({
  conversationId,
  batchEmployeeId,
  batchStep,
  activityUserId,
  activityStep,
  base,
} = {}) {
  const sp = new URLSearchParams(base?.toString() || "");

  if (conversationId) sp.set(ADMIN_CHAT_QUERY, conversationId);
  else sp.delete(ADMIN_CHAT_QUERY);

  if (batchEmployeeId) sp.set(ADMIN_BATCH_EMPLOYEE_QUERY, batchEmployeeId);
  else sp.delete(ADMIN_BATCH_EMPLOYEE_QUERY);

  if (batchStep && batchStep !== "employees") sp.set(ADMIN_BATCH_STEP_QUERY, batchStep);
  else sp.delete(ADMIN_BATCH_STEP_QUERY);

  if (activityUserId) sp.set(ADMIN_ACTIVITY_USER_QUERY, activityUserId);
  else sp.delete(ADMIN_ACTIVITY_USER_QUERY);

  if (activityStep) sp.set(ADMIN_ACTIVITY_STEP_QUERY, activityStep);
  else sp.delete(ADMIN_ACTIVITY_STEP_QUERY);

  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function adminTabNavigateTarget(tab, searchParams = {}) {
  const path = tab === "overview" || !tab ? "/admin" : `/admin/${tab}`;
  const search = buildAdminSearchParams(searchParams);
  return { pathname: path, search };
}

export function adminChatOpenTarget(pathname, conversationId, extra = {}) {
  return {
    pathname,
    search: buildAdminSearchParams({ ...extra, conversationId }),
  };
}

export function adminChatListTarget(pathname, extra = {}) {
  return { pathname, search: buildAdminSearchParams({ ...extra, conversationId: null }) };
}

export function adminHasDrillDownSearch(searchParams) {
  return !!(
    getAdminChatConversationId(searchParams) ||
    getAdminBatchEmployeeId(searchParams) ||
    getAdminActivityUserId(searchParams)
  );
}
