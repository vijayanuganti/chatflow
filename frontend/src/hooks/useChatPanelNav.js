import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageSquare, UtensilsCrossed, Settings, Layers, Folder, MessageCircle } from "lucide-react";
import { dietPlanPath, profilePath } from "@/lib/appRoutes";
import { chatListTarget } from "@/lib/chatMobileNav";
import { saveChatListScroll } from "@/lib/chatListScroll";

/**
 * Desktop sidebar + mobile bottom nav items for employee / client chat portal.
 */
export function useChatPanelNav({ role, unreadTotal = 0, listScrollRef } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  const isActive = (id) => {
    if (id === "chats") {
      return pathname === "/chat" || (pathname.startsWith("/chat") && !pathname.match(/\/(folders|profile|diet-plan|complaint|new-conversation|medical|contact|create-account)/));
    }
    if (id === "diet") return pathname.startsWith("/chat/diet-plan");
    if (id === "folders") return pathname.startsWith("/chat/folders");
    if (id === "settings") return pathname === "/chat/profile";
    if (id === "batches") return pathname === "/chat";
    return false;
  };

  const clientItems = useMemo(
    () => [
      {
        id: "chats",
        label: "Chats",
        icon: MessageSquare,
        active: isActive("chats"),
        badge: unreadTotal,
        testId: "client-nav-chats",
        onClick: () => navigate(chatListTarget(), { replace: true }),
      },
      {
        id: "diet",
        label: "My Diet",
        icon: UtensilsCrossed,
        active: isActive("diet"),
        testId: "client-nav-diet",
        onClick: () => {
          if (listScrollRef?.current) saveChatListScroll(listScrollRef.current.scrollTop);
          navigate(dietPlanPath("client"), {
            push: true,
            state: { backTo: "/chat", startFromDayOne: true },
          });
        },
      },
      {
        id: "folders",
        label: "Folders",
        icon: Folder,
        active: isActive("folders"),
        testId: "client-nav-folders",
        onClick: () => navigate("/chat/folders", { push: true }),
      },
      {
        id: "settings",
        label: "Settings",
        icon: Settings,
        active: isActive("settings"),
        testId: "client-nav-settings",
        onClick: () => navigate("/chat/profile", { push: true }),
      },
    ],
    [navigate, unreadTotal, pathname, listScrollRef],
  );

  const employeeItems = useMemo(
    () => [
      {
        id: "chats",
        label: "Chats",
        icon: MessageSquare,
        active: isActive("chats"),
        badge: unreadTotal,
        testId: "employee-nav-chats",
        onClick: () => navigate(chatListTarget(), { replace: true }),
      },
      {
        id: "batches",
        label: "Batches",
        icon: Layers,
        active: isActive("batches"),
        testId: "employee-nav-batches",
        onClick: () => {
          navigate(chatListTarget(), { replace: true });
          requestAnimationFrame(() => {
            document.querySelector("[data-testid='batch-boards']")?.scrollIntoView({ behavior: "smooth" });
          });
        },
      },
      {
        id: "folders",
        label: "Folders",
        icon: Folder,
        active: isActive("folders"),
        testId: "employee-nav-folders",
        onClick: () => navigate("/chat/folders", { push: true }),
      },
      {
        id: "settings",
        label: "Settings",
        icon: Settings,
        active: isActive("settings"),
        testId: "employee-nav-settings",
        onClick: () => navigate("/chat/profile", { push: true }),
      },
    ],
    [navigate, unreadTotal, pathname],
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
      <span className="hidden lg:inline text-sm font-medium">{label}</span>
    </button>
  );
}

export function ChatPanelSidebar({ items, user }) {
  return (
    <nav
      className="hidden md:flex w-20 lg:w-56 shrink-0 bg-emerald-950 text-emerald-100 flex-col py-6 px-3"
      data-testid="chat-panel-sidebar"
    >
      <div className="flex items-center gap-3 px-2 mb-8">
        <div className="h-10 w-10 rounded-xl bg-emerald-700/40 flex items-center justify-center shrink-0">
          <MessageCircle className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <span className="font-display text-lg font-semibold hidden lg:inline truncate">ChatFlow</span>
      </div>
      {items.map((item) => (
        <ChatPanelNavButton key={item.id} {...item} />
      ))}
      <div className="mt-auto px-2 py-2 text-[10px] text-emerald-200/70 hidden lg:block truncate">
        {user?.full_name}
      </div>
    </nav>
  );
}
