/** Client-side admin panel search helpers (case-insensitive partial match). */

function norm(q) {
  return (q || "").trim().toLowerCase();
}

function hay(...parts) {
  return parts
    .filter(Boolean)
    .map((p) => String(p).toLowerCase())
    .join(" ");
}

export function matchesUserSearch(user, query) {
  const q = norm(query);
  if (!q) return true;
  const blob = hay(
    user?.full_name,
    user?.username,
    user?.id,
    user?.phone_number,
    user?.email,
  );
  return blob.includes(q);
}

export function matchesFolderSearch(folder, query) {
  const q = norm(query);
  if (!q) return true;
  return hay(folder?.name).includes(q);
}

export function matchesEmployeeSearch(employee, query) {
  const q = norm(query);
  if (!q) return true;
  return hay(employee?.full_name, employee?.username, employee?.id).includes(q);
}
