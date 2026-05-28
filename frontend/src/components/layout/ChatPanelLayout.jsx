import React, { useCallback, useEffect, useState } from "react";
import { Outlet, useOutletContext, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { api } from "@/lib/api";
import PanelBottomNav from "@/components/layout/PanelBottomNav";
import { ChatPanelSidebar, useChatPanelNav } from "@/hooks/useChatPanelNav";
import { getChatConversationId } from "@/lib/chatMobileNav";

/**
 * Employee / client shell: desktop sidebar (like admin) + mobile bottom nav.
 */
export default function ChatPanelLayout() {
  const { user } = useAuth();
  const { chatComposerActive } = useChat();
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [searchParams] = useSearchParams();
  const chatConvIdFromUrl = getChatConversationId(searchParams);

  const refreshUnread = useCallback(async () => {
    try {
      const res = await api.get("/conversations");
      const total = (res.data || [])
        .filter((c) => !c.is_archived)
        .reduce((sum, c) => sum + Number(c.unread_count || 0), 0);
      setUnreadTotal(total);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshUnread();
  }, [refreshUnread]);

  const { items } = useChatPanelNav({
    role: user?.role,
    unreadTotal,
  });

  const role = (user?.role || "").toLowerCase();
  const isClient = role === "client";
  const inChatThread = Boolean(chatConvIdFromUrl);
  /** Hide bottom nav only inside an open chat thread (not on list / folders / etc.). */
  const showMobileFooter = !chatComposerActive && (isClient || !inChatThread);

  return (
    <div
      className="flex min-h-0 w-full flex-col overflow-hidden bg-gray-50 dark:bg-gray-950"
      style={{ height: "var(--visual-vh, 100dvh)", minHeight: "100dvh" }}
      data-testid="chat-panel-layout"
    >
      <div
        className={`flex min-h-0 flex-1 overflow-hidden ${
          showMobileFooter ? "pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0" : ""
        }`}
      >
        <ChatPanelSidebar items={items} user={user} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Outlet context={{ panelLayout: true, setUnreadTotal, refreshUnread }} />
        </div>
      </div>
      <PanelBottomNav hidden={!showMobileFooter} testId={`${user?.role}-bottom-nav`} items={items} />
    </div>
  );
}

export function useChatPanelOutlet() {
  return useOutletContext();
}
