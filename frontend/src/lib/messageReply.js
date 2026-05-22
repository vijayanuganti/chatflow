import i18n from "@/i18n";

/** Short preview text for reply quotes and composer bar. */
export function messageReplySnippet(message) {
  if (!message) return "";
  const type = message.message_type || "text";
  if (type === "text") return (message.content || "").trim().slice(0, 160);
  if (type === "image") return i18n.t("preview.photo");
  if (type === "video") return i18n.t("preview.video");
  if (type === "audio") return i18n.t("preview.voice");
  if (type === "file") return message.file_name ? `📎 ${message.file_name}` : i18n.t("preview.document");
  return (message.content || `[${type}]`).slice(0, 160);
}
