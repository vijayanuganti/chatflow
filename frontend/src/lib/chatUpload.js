import { api } from "@/lib/api";
import { inferMessageTypeFromFile } from "@/lib/chatMedia";

/**
 * Upload a chat attachment with optional progress (0–100).
 * Returns axios response data: { file_url, file_name, message_type }.
 */
export async function uploadChatFile(file, { onProgress } = {}) {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post("/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (evt) => {
      if (!onProgress || !evt.total) return;
      const pct = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
      onProgress(pct);
    },
  });
  return {
    ...res.data,
    message_type: res.data.message_type || inferMessageTypeFromFile(file),
  };
}
