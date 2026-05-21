import { api } from "@/lib/api";

/** @typedef {'admin' | 'employee' | null} FolderMutationScope */

export async function listMyFolders() {
  const res = await api.get("/folders");
  return res.data;
}

export async function getMyFolder(folderId) {
  const res = await api.get(`/folders/${folderId}`);
  return res.data;
}

export function folderMutationScope(folder, { isAdmin = false } = {}) {
  if (isAdmin) {
    if (folder?.created_by_type === "employee") return null;
    return "admin";
  }
  if (folder?.can_edit) return "employee";
  return null;
}

function folderBase(scope, folderId) {
  if (scope === "admin") return `/admin/folders/${folderId}`;
  if (scope === "employee") return `/employee/folders/${folderId}`;
  return null;
}

export async function listAdminFolders() {
  const res = await api.get("/admin/folders");
  return res.data;
}

export async function getAdminFolder(folderId) {
  const res = await api.get(`/admin/folders/${folderId}`);
  return res.data;
}

export async function createAdminFolder(payload) {
  const res = await api.post("/admin/folders", payload);
  return res.data;
}

export async function updateAdminFolder(folderId, payload) {
  const res = await api.patch(`/admin/folders/${folderId}`, payload);
  return res.data;
}

export async function deleteAdminFolder(folderId) {
  const res = await api.delete(`/admin/folders/${folderId}`);
  return res.data;
}

export async function createEmployeeFolder(payload) {
  const res = await api.post("/employee/folders", payload);
  return res.data;
}

export async function updateEmployeeFolder(folderId, payload) {
  const res = await api.patch(`/employee/folders/${folderId}`, payload);
  return res.data;
}

export async function deleteEmployeeFolder(folderId) {
  const res = await api.delete(`/employee/folders/${folderId}`);
  return res.data;
}

export async function addFolderLink(folderId, { title, url }, scope = "admin") {
  const base = folderBase(scope, folderId);
  const res = await api.post(`${base}/links`, { title, url });
  return res.data;
}

export async function updateFolderItem(folderId, itemId, payload, scope = "admin") {
  const base = folderBase(scope, folderId);
  const res = await api.patch(`${base}/items/${itemId}`, payload);
  return res.data;
}

export async function deleteFolderItem(folderId, itemId, scope = "admin") {
  const base = folderBase(scope, folderId);
  const res = await api.delete(`${base}/items/${itemId}`);
  return res.data;
}

export async function fetchFolderPickerUsers() {
  const res = await api.get("/admin/folders-picker/users");
  return res.data;
}

export async function fetchEmployeeFolderPickerClients() {
  const res = await api.get("/employee/folders-picker/clients");
  return res.data;
}

export async function uploadFolderFile(folderId, category, file, { onProgress, scope = "admin" } = {}) {
  const base = folderBase(scope, folderId);
  const form = new FormData();
  form.append("file", file);
  const res = await api.post(`${base}/upload`, form, {
    params: { category },
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (evt) => {
      if (!onProgress || !evt.total) return;
      onProgress(Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
    },
  });
  return res.data;
}
