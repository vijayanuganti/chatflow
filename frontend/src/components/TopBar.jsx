import React from "react";
import { ArrowLeft, MessageCircle, MoreVertical, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import Avatar from "@/components/Avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";

export default function TopBar({ onOpenSettings, onBack, title = "ChatFlow", unreadTotal = 0 }) {
  const { user, logout } = useAuth();

  return (
    <header className="h-14 bg-white/90 backdrop-blur-xl border-b border-gray-200 px-4 flex items-center justify-between sticky top-0 z-20" data-testid="topbar">
      <div className="flex items-center gap-2 min-w-0">
        {onBack && (
          <Button size="icon" variant="ghost" className="rounded-full" onClick={onBack} data-testid="topbar-back-btn" title="Back">
            <ArrowLeft className="h-5 w-5" strokeWidth={1.5} />
          </Button>
        )}
        <div className="h-9 w-9 rounded-xl bg-emerald-900 text-white flex items-center justify-center shrink-0 relative">
          <MessageCircle className="h-5 w-5" />
          {unreadTotal > 0 && (
            <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center border-2 border-white">
              {unreadTotal > 99 ? "99+" : unreadTotal}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="font-display font-semibold leading-tight truncate">{title}</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <div className="hidden sm:block">
          <Avatar name={user?.full_name} avatarUrl={user?.avatar_url} status={user?.status || "available"} size={34} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="rounded-full" data-testid="topbar-menu-btn" title="Menu">
              <MoreVertical className="h-5 w-5" strokeWidth={1.5} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onOpenSettings?.()} data-testid="topbar-settings-item">
              <Settings /> Profile & settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} data-testid="topbar-logout-item">
              <LogOut /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

