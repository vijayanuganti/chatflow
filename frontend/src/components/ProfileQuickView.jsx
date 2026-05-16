import React from "react";
import { MessageCircle, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Avatar from "./Avatar";

export default function ProfileQuickView({
  open,
  name,
  avatarUrl,
  status,
  online,
  onClose,
  onChat,
  onInfo,
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      data-testid="profile-quick-view"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Contact preview"
      >
        <div className="relative h-28 bg-gradient-to-br from-emerald-800 to-emerald-950">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute top-2 right-2 h-9 w-9 rounded-full text-white hover:bg-white/20"
            onClick={onClose}
            data-testid="profile-quick-close"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="px-6 pb-6 -mt-12 flex flex-col items-center text-center">
          <div className="ring-4 ring-white dark:ring-gray-900 rounded-full">
            <Avatar name={name} avatarUrl={avatarUrl} status={status} online={online} size={88} />
          </div>
          <h3 className="mt-3 font-display text-lg font-semibold dark:text-gray-100">{name || "Contact"}</h3>
          <div className="mt-5 flex gap-3 w-full">
            <Button type="button" className="flex-1 rounded-full bg-emerald-900 hover:bg-emerald-950 h-11" onClick={onChat} data-testid="profile-quick-chat">
              <MessageCircle className="h-4 w-4 mr-2" /> Chat
            </Button>
            <Button type="button" variant="outline" className="flex-1 rounded-full h-11" onClick={onInfo} data-testid="profile-quick-info">
              <Info className="h-4 w-4 mr-2" /> Info
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
