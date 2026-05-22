/** Whether the current user may edit this message (own text only). */
export function messageCanEdit(message, userId) {
  if (!message?.id || !userId) return false;
  if (String(message.sender_id) !== String(userId)) return false;
  return (message.message_type || "text") === "text";
}
