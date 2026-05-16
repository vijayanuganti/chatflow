import React from "react";
import { ArrowLeft, MessageCircle, MoreVertical, Settings, LogOut, UserPlus, Sun, Moon, ShieldAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import Avatar from "@/components/Avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";

export default function TopBar({
  onOpenSettings,
  onBack,
  title = "ChatFlow",
  unreadTotal = 0,
  onCreateAccount,
  onRaiseComplaint,
  onRefresh,
}) {
  const { user, logout } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const canCreateAccounts =
    !!onCreateAccount &&
    (user?.role === "admin" || (user?.role === "employee" && !!user?.account_creation_access));
  const canRaiseComplaint = !!onRaiseComplaint && user?.role === "client";

  return (
    <header
      className="sticky top-0 z-20 flex flex-col border-b border-gray-200 bg-white/95 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/90"
      data-testid="topbar"
    >
      {/* Reserve space for the OS status bar (signal, wifi, battery). Below this, app chrome starts. */}
      <div
        className="shrink-0 w-full bg-white/95 dark:bg-gray-950/90"
        style={{ minHeight: "max(env(safe-area-inset-top, 0px), 36px)" }}
        aria-hidden
      />
      <div className="flex min-h-[56px] flex-1 items-center justify-between gap-2 px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        {onBack && (
          <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0 touch-manipulation rounded-full" onClick={onBack} data-testid="topbar-back-btn" title="Back">
            <ArrowLeft className="h-5 w-5" strokeWidth={1.5} />
          </Button>
        )}
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-900 text-white sm:h-9 sm:w-9 sm:rounded-xl">
          <MessageCircle className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
        </div>
        <div className="min-w-0">
          <div className="font-display text-sm font-semibold leading-tight truncate sm:text-base">{title}</div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {canCreateAccounts && (
          <Button
            size="sm"
            variant="outline"
            className="rounded-full hidden sm:inline-flex border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200 dark:hover:bg-emerald-500/25"
            onClick={onCreateAccount}
            data-testid="topbar-create-account-btn"
            title="Create a new account"
          >
            <UserPlus className="h-4 w-4 mr-1.5" />
            Create account
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-10 w-10 touch-manipulation rounded-full"
          onClick={toggleTheme}
          data-testid="topbar-theme-toggle"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark
            ? <Sun className="h-5 w-5" strokeWidth={1.5} />
            : <Moon className="h-5 w-5" strokeWidth={1.5} />}
        </Button>
        <div className="hidden sm:block">
          <Avatar name={user?.full_name} avatarUrl={user?.avatar_url} status={user?.status || "available"} size={34} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-10 w-10 touch-manipulation rounded-full" data-testid="topbar-menu-btn" title="Menu">
              <MoreVertical className="h-5 w-5" strokeWidth={1.5} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canCreateAccounts && (
              <DropdownMenuItem onClick={() => onCreateAccount?.()} data-testid="topbar-create-account-item">
                <UserPlus /> Create account
              </DropdownMenuItem>
            )}
            {canRaiseComplaint && (
              <DropdownMenuItem onClick={() => onRaiseComplaint?.()} data-testid="topbar-complaint-item">
                <ShieldAlert /> Raise a complaint
              </DropdownMenuItem>
            )}
            {onRefresh && (
              <DropdownMenuItem onClick={() => onRefresh?.()} data-testid="topbar-refresh-item">
                <RefreshCw /> Refresh
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onOpenSettings?.()} data-testid="topbar-settings-item">
              <Settings /> Profile & settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { logout(); }} data-testid="topbar-logout-item">
              <LogOut /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </div>
    </header>
  );
}

