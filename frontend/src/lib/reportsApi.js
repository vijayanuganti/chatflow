import { api } from "@/lib/api";

export async function searchReportsUsers(q) {
  const res = await api.get("/admin/reports/search", { params: { q } });
  return res.data;
}

export async function fetchEmployeeReport(userId) {
  const res = await api.get(`/admin/reports/employee/${userId}`);
  return res.data;
}

export async function fetchClientReport(userId) {
  const res = await api.get(`/admin/reports/client/${userId}`);
  return res.data;
}

export async function downloadEmployeeReportPdf(userId, fileName) {
  const res = await api.get(`/admin/reports/employee/${userId}/pdf`, { responseType: "blob" });
  triggerBlobDownload(res.data, fileName || `employee-report-${userId}.pdf`);
}

export async function downloadClientReportPdf(userId, fileName) {
  const res = await api.get(`/admin/reports/client/${userId}/pdf`, { responseType: "blob" });
  triggerBlobDownload(res.data, fileName || `client-report-${userId}.pdf`);
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
