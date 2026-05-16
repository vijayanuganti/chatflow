const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

const MEDIA_TYPES = new Set(["image", "video"]);
const DOC_EXTENSIONS = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|rtf|zip)(\?|$)/i;

export function extractUrls(text) {
  if (!text || typeof text !== "string") return [];
  const matches = text.match(URL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

export function categorizeSharedMessages(messages) {
  const media = [];
  const documents = [];
  const links = [];

  for (const m of messages || []) {
    const type = (m.message_type || "text").toLowerCase();
    if (MEDIA_TYPES.has(type) && m.file_url) {
      media.push(m);
      continue;
    }
    if (type === "document" || (m.file_url && DOC_EXTENSIONS.test(m.file_name || m.file_url || ""))) {
      documents.push(m);
      continue;
    }
    const urls = extractUrls(m.content);
    if (urls.length) {
      links.push({ ...m, urls });
    }
  }

  return { media, documents, links };
}
