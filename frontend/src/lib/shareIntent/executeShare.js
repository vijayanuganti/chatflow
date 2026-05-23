import { api, formatApiError } from "@/lib/api";
import { uploadChatFile } from "@/lib/chatUpload";
import { inferMessageTypeFromFile } from "@/lib/chatMedia";
import {
  uploadFolderFile,
  addFolderLink,
  listMyFolders,
  listAdminFolders,
  folderMutationScope,
} from "@/lib/foldersApi";
import { getFileCategory, isTextShareItem } from "./categories";

/**
 * @param {string} conversationId
 * @param {File[]} files
 * @param {string[]} texts
 * @param {{ onProgress?: (p: { current: number, total: number, percent: number }) => void }} [opts]
 */
export async function shareToConversation(conversationId, files, texts, opts = {}) {
  const total = files.length + texts.length;
  let done = 0;

  const bump = () => {
    done += 1;
    opts.onProgress?.({
      current: done,
      total,
      percent: total ? Math.round((done / total) * 100) : 100,
    });
  };

  for (const text of texts) {
    await api.post("/messages", {
      conversation_id: conversationId,
      content: text,
      message_type: "text",
    });
    bump();
  }

  for (const file of files) {
    const uploaded = await uploadChatFile(file, {
      onProgress: (pct) => {
        opts.onProgress?.({
          current: done,
          total,
          percent: Math.round(((done + pct / 100) / total) * 100),
        });
      },
    });
    await api.post("/messages", {
      conversation_id: conversationId,
      content: file.name || "",
      message_type: uploaded.message_type || inferMessageTypeFromFile(file),
      file_url: uploaded.file_url,
      file_name: uploaded.file_name || file.name,
    });
    bump();
  }
}

/**
 * @param {object} user
 * @returns {Promise<Array>}
 */
export async function loadShareableFolders(user) {
  const role = (user?.role || "").toLowerCase();
  if (role === "client") return [];
  if (role === "admin") {
    const data = await listAdminFolders();
    const list = Array.isArray(data) ? data : data?.folders || [];
    return list.filter((f) => folderMutationScope(f, { isAdmin: true }));
  }
  const data = await listMyFolders();
  const folders = Array.isArray(data) ? data : data?.folders || [];
  return folders.filter((f) => folderMutationScope(f, { isAdmin: false }) === "employee");
}

/**
 * @param {string} folderId
 * @param {'photos'|'videos'|'documents'|'links'} category
 * @param {File[]} files
 * @param {string[]} texts
 * @param {object} user
 * @param {{ onProgress?: Function }} opts
 */
export async function shareToFolder(folderId, category, files, texts, user, opts = {}) {
  const role = (user?.role || "").toLowerCase();
  const scope = role === "admin" ? "admin" : "employee";
  const total = files.length + texts.length;
  let done = 0;

  const bump = () => {
    done += 1;
    opts.onProgress?.({
      current: done,
      total,
      percent: total ? Math.round((done / total) * 100) : 100,
    });
  };

  for (const text of texts) {
    const title = text.length > 80 ? `${text.slice(0, 77)}…` : text;
    await addFolderLink(folderId, { title, url: text }, scope);
    bump();
  }

  for (const file of files) {
    const cat = category || getFileCategory(file.type);
    await uploadFolderFile(folderId, cat, file, {
      scope,
      onProgress: (pct) => {
        opts.onProgress?.({
          current: done,
          total,
          percent: Math.round(((done + pct / 100) / total) * 100),
        });
      },
    });
    bump();
  }
}

export { isTextShareItem, getFileCategory };
