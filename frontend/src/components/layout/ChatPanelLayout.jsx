import React, { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { api } from "@/lib/api";
import PanelBottomNav from "@/components/layout/PanelBottomNav";
import MinimizedCallBadge from "@/components/call/MinimizedCallBadge";
import { ChatPanelSidebar, useChatPanelNav } from "@/hooks/useChatPanelNav";
import { getChatConversationId } from "@/lib/chatMobileNav";

/**
 * Employee / client shell: desktop sidebar (like admin) + mobile bottom nav.
 */
export default function ChatPanelLayout() {
  const { user } = useAuth();
  const { chatComposerActive } = useChat();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [searchParams] = useSearchParams();
  const chatConvIdFromUrl = getChatConversationId(searchParams);
  const [clientTab, setClientTab] = useState("chats");
  const [clientInChatThread, setClientInChatThread] = useState(false);

  const refreshUnread = useCallback(async () => {
    try {
      if ((user?.role || "").toLowerCase() === "client") {
        const res = await api.get("/conversations/assigned-employee");
        const conv = res.data?.conversation;
        setUnreadTotal(Number(conv?.unread_count || 0));
        return;
      }
      const res = await api.get("/conversations");
      const total = (res.data || [])
        .filter((c) => !c.is_archived)
        .reduce((sum, c) => sum + Number(c.unread_count || 0), 0);
      setUnreadTotal(total);
    } catch {
      /* ignore */
    }
  }, [user?.role]);

  useEffect(() => {
    refreshUnread();
  }, [refreshUnread]);

  const role = (user?.role || "").toLowerCase();
  const isClient = role === "client";
  const pathname = location.pathname;

  useEffect(() => {
    if (!isClient) return;
    const tabFromState = location.state?.clientTab;
    if (tabFromState) setClientTab(tabFromState);
  }, [isClient, location.state?.clientTab]);

  useEffect(() => {
    if (!isClient) return;
    if (pathname === "/chat/diet-plan" || pathname.startsWith("/chat/diet-plan/")) {
      setClientTab("diet");
      navigate("/chat", { replace: true, state: { clientTab: "diet" } });
    } else if (pathname === "/chat/calls") {
      setClientTab("calls");
      navigate("/chat", { replace: true, state: { clientTab: "calls" } });
    } else if (pathname === "/chat/folders") {
      setClientTab("folders");
      navigate("/chat", { replace: true, state: { clientTab: "folders" } });
    }
  }, [isClient, pathname, navigate]);

  const { items } = useChatPanelNav({
    role: user?.role,
    unreadTotal,
    clientTab,
    setClientTab,
  });

  /** Footer hidden only while URL has an open thread (?c=). Matches closeChat replace to /chat. */
  const inChatThread = Boolean(chatConvIdFromUrl);
  const clientOnTabHome = isClient && pathname === "/chat";
  const showMobileFooter =
    !chatComposerActive &&
    (isClient ? clientOnTabHome && !clientInChatThread : !inChatThread);

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
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden relative call-panel-content">
          <MinimizedCallBadge />
          <Outlet
            context={{
              panelLayout: true,
              setUnreadTotal,
              refreshUnread,
              clientTab,
              setClientTab,
              clientInChatThread,
              setClientInChatThread,
            }}
          />
        </div>
      </div>
      <PanelBottomNav hidden={!showMobileFooter} testId={`${user?.role}-bottom-nav`} items={items} />
    </div>
  );
}

export function useChatPanelOutlet() {
  return useOutletContext();
}
