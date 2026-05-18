/** Short preview text for reply quotes and composer bar. */
export function messageReplySnippet(message) {
  if (!message) return "";
  const type = message.message_type || "text";
  if (type === "text") return (message.content || "").trim().slice(0, 160);
  if (type === "image") return "📷 Photo";
  if (type === "video") return "🎬 Video";
  if (type === "audio") return "🎤 Voice message";
  if (type === "file") return message.file_name ? `📎 ${message.file_name}` : "📎 Document";
  return (message.content || `[${type}]`).slice(0, 160);
}
