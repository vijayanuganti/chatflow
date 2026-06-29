import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageSquare, UtensilsCrossed, Folder, MessageCircle, Phone } from "lucide-react";
import { callHistoryPath } from "@/lib/appRoutes";
import { chatListTarget } from "@/lib/chatMobileNav";
import { saveChatListScroll } from "@/lib/chatListScroll";

/**
 * Desktop sidebar + mobile bottom nav items for employee / client chat portal.
 */
export function useChatPanelNav({ role, unreadTotal = 0, listScrollRef, clientTab = "chats", setClientTab } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const isClientRole = role === "client";

  const goClientTab = (tab) => {
    setClientTab?.(tab);
    navigate("/chat", { replace: true, state: { clientTab: tab } });
  };

  const isActive = (id) => {
    if (isClientRole) {
      if (pathname !== "/chat") return false;
      if (id === "chats") return clientTab === "chats";
      if (id === "diet") return clientTab === "diet";
      if (id === "folders") return clientTab === "folders";
      if (id === "calls") return clientTab === "calls";
      return false;
    }
    if (id === "chats") {
      return pathname === "/chat" || (pathname.startsWith("/chat") && !pathname.match(/\/(folders|tools|profile|diet-plan|complaint|new-conversation|medical|contact|create-account|calls)/));
    }
    if (id === "diet") return pathname.startsWith("/chat/diet-plan");
    if (id === "folders") return pathname.startsWith("/chat/folders");
    if (id === "calls") return pathname.startsWith("/chat/calls");
    return false;
  };

  const clientItems = useMemo(
    () => [
      {
        id: "chats",
        label: t("nav.clientChat"),
        icon: MessageSquare,
        active: isActive("chats"),
        badge: unreadTotal,
        testId: "client-nav-chats",
        onClick: () => goClientTab("chats"),
      },
      {
        id: "diet",
        label: t("nav.clientDiet"),
        icon: UtensilsCrossed,
        active: isActive("diet"),
        testId: "client-nav-diet",
        onClick: () => goClientTab("diet"),
      },
      {
        id: "folders",
        label: t("nav.clientFolders"),
        icon: Folder,
        active: isActive("folders"),
        testId: "client-nav-folders",
        onClick: () => goClientTab("folders"),
      },
      {
        id: "calls",
        label: "Call history",
        icon: Phone,
        active: isActive("calls"),
        testId: "client-nav-calls",
        onClick: () => goClientTab("calls"),
      },
    ],
    [unreadTotal, clientTab, pathname, t, setClientTab],
  );

  const employeeItems = useMemo(
    () => [
      {
        id: "chats",
        label: t("nav.employeeChats"),
        icon: MessageSquare,
        active: isActive("chats"),
        badge: unreadTotal,
        testId: "employee-nav-chats",
        onClick: () => navigate(chatListTarget(), { replace: true }),
      },
      {
        id: "folders",
        label: t("nav.employeeFolders"),
        icon: Folder,
        active: isActive("folders"),
        testId: "employee-nav-folders",
        onClick: () => navigate("/chat/folders", { push: true }),
      },
      {
        id: "calls",
        label: "Call history",
        icon: Phone,
        active: isActive("calls"),
        testId: "employee-nav-calls",
        onClick: () => navigate(callHistoryPath(), { push: true }),
      },
    ],
    [navigate, unreadTotal, pathname, t],
  );

  return {
    items: role === "client" ? clientItems : employeeItems,
    isActive,
  };
}

export function ChatPanelNavButton({ icon: Icon, label, active, onClick, testId, badge }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors mb-1 ${
        active ? "bg-emerald-800/60 text-white" : "hover:bg-emerald-900 text-emerald-100"
      }`}
    >
      <span className="relative shrink-0">
        <Icon className="h-5 w-5" strokeWidth={1.5} />
        {badge > 0 ? (
          <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-semibold flex items-center justify-center border border-emerald-950">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

export function ChatPanelSidebar({ items, user }) {
  const { t } = useTranslation();
  return (
    <nav
      className="hidden md:flex w-[240px] shrink-0 bg-emerald-950 text-emerald-100 flex-col py-6 px-3"
      data-testid="chat-panel-sidebar"
    >
      <div className="flex items-center gap-3 px-2 mb-8">
        <div className="h-10 w-10 rounded-xl bg-emerald-700/40 flex items-center justify-center shrink-0">
          <MessageCircle className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <span className="font-display text-lg font-semibold truncate">{t("common.appName")}</span>
      </div>
      {items.map((item) => (
        <ChatPanelNavButton key={item.id} {...item} />
      ))}
      <div className="mt-auto px-2 py-2 text-[10px] text-emerald-200/70 truncate">
        {user?.full_name}
      </div>
    </nav>
  );
}
