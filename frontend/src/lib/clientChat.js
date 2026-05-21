/** Client portal: single assigned-employee direct thread only. */

export function clientAssignedEmployeeId(user) {
  return (user?.employee_id || "").trim() || null;
}

export function isClientPortalUser(user) {
  return (user?.role || "").toLowerCase() === "client";
}

export function pickClientConversation(conversations, employeeId) {
  if (!employeeId || !Array.isArray(conversations)) return null;
  return (
    conversations.find(
      (c) =>
        c?.type === "direct"
        && c?.other_user?.role === "employee"
        && c?.other_user?.id === employeeId,
    ) || null
  );
}
