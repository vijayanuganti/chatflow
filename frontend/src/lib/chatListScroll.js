const SCROLL_KEY = "cf_chat_list_scroll";

export function saveChatListScroll(top) {
  try {
    sessionStorage.setItem(SCROLL_KEY, String(Math.max(0, top || 0)));
  } catch {
    /* ignore */
  }
}

export function loadChatListScroll() {
  try {
    const v = Number(sessionStorage.getItem(SCROLL_KEY) || 0);
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}
