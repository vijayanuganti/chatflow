import React from "react";
import { useTranslation } from "react-i18next";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
export default function ForceLogoutModal({ open, onConfirm }) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-none dark:border-gray-800 dark:bg-gray-950"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        data-testid="force-logout-modal"
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/15">
            <Smartphone className="h-7 w-7 text-[#064e3b] dark:text-emerald-400" strokeWidth={1.75} />
          </div>
          <DialogHeader className="space-y-2 text-center sm:text-center">
            <DialogTitle className="text-[18px] font-bold text-[#1A1A2E] dark:text-gray-100">
              {t("forceLogout.title")}
            </DialogTitle>
            <DialogDescription className="text-sm text-[#6B7280] dark:text-gray-400 leading-relaxed">
              {t("forceLogout.message")}
            </DialogDescription>
          </DialogHeader>
          <Button
            type="button"
            className="mt-6 w-full rounded-lg bg-[#064e3b] hover:bg-[#022c22] text-white h-11"
            onClick={onConfirm}
            data-testid="force-logout-ok"
          >
            {t("forceLogout.backToLogin")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
