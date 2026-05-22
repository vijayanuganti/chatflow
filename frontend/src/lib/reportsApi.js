import { api } from "@/lib/api";
import { openBlobInNativeApp } from "@/lib/mediaHandler";

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

export async function openEmployeeReportPdf(userId, fileName, onError) {
  const res = await api.get(`/admin/reports/employee/${userId}/pdf`, { responseType: "blob" });
  await openBlobInNativeApp({
    blob: res.data,
    fileName: fileName || `employee-report-${userId}.pdf`,
    mimeType: "application/pdf",
    onError,
  });
}

export async function openClientReportPdf(userId, fileName, onError) {
  const res = await api.get(`/admin/reports/client/${userId}/pdf`, { responseType: "blob" });
  await openBlobInNativeApp({
    blob: res.data,
    fileName: fileName || `client-report-${userId}.pdf`,
    mimeType: "application/pdf",
    onError,
  });
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
