import { api } from "@/lib/api";

export async function listMyFolders() {
  const res = await api.get("/folders");
  return res.data;
}

export async function getMyFolder(folderId) {
  const res = await api.get(`/folders/${folderId}`);
  return res.data;
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

export async function addFolderLink(folderId, { title, url }) {
  const res = await api.post(`/admin/folders/${folderId}/links`, { title, url });
  return res.data;
}

export async function updateFolderItem(folderId, itemId, payload) {
  const res = await api.patch(`/admin/folders/${folderId}/items/${itemId}`, payload);
  return res.data;
}

export async function deleteFolderItem(folderId, itemId) {
  const res = await api.delete(`/admin/folders/${folderId}/items/${itemId}`);
  return res.data;
}

export async function fetchFolderPickerUsers() {
  const res = await api.get("/admin/folders-picker/users");
  return res.data;
}

export async function uploadFolderFile(folderId, category, file, { onProgress } = {}) {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post(`/admin/folders/${folderId}/upload`, form, {
    params: { category },
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (evt) => {
      if (!onProgress || !evt.total) return;
      onProgress(Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
    },
  });
  return res.data;
}
