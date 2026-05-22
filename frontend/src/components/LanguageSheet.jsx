import React from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/context/AuthContext";
import { setAppLanguage, normalizeLanguage } from "@/lib/appLanguage";

const OPTIONS = [
  { code: "en", flag: "🇬🇧", titleKey: "language.option.en", subKey: "language.option.enSub" },
  { code: "hi", flag: "🇮🇳", titleKey: "language.option.hi", subKey: "language.option.hiSub" },
  { code: "te", flag: "🇮🇳", titleKey: "language.option.te", subKey: "language.option.teSub" },
];

export default function LanguageSheet({ open, onOpenChange }) {
  const { t, i18n } = useTranslation();
  const { user, setUser } = useAuth();
  const current = normalizeLanguage(i18n.language);

  const handleSelect = async (code) => {
    const lang = await setAppLanguage(code, { userId: user?.id });
    if (user) {
      setUser({ ...user, language: lang });
    }
    onOpenChange?.(false);
    const toastKey = `language.toast.${lang}`;
    toast.success(t(toastKey, { defaultValue: t("language.toast.en") }));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl px-0 pb-[max(1rem,env(safe-area-inset-bottom))]" data-testid="language-sheet">
        <SheetHeader className="px-4 pb-2 text-left">
          <SheetTitle className="text-base font-semibold">{t("language.sheetTitle")}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col">
          {OPTIONS.map((opt) => {
            const active = current === opt.code;
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => handleSelect(opt.code)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-gray-900 touch-manipulation"
                data-testid={`language-option-${opt.code}`}
              >
                <span className="text-xl shrink-0" aria-hidden>{opt.flag}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] text-[#1A1A2E] dark:text-gray-100">{t(opt.titleKey)}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">{t(opt.subKey)}</span>
                </span>
                {active ? (
                  <Check className="h-5 w-5 shrink-0 text-primary" strokeWidth={2.5} aria-hidden />
                ) : (
                  <span className="w-5 shrink-0" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
