import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Wrench } from "lucide-react";
import MobilePageShell from "@/components/layout/MobilePageShell";
import { useAuth } from "@/context/AuthContext";
import { panelBase } from "@/lib/appRoutes";

/** Tools hub — profile & preferences live in the top ⋮ menu. */
export default function ToolsPage({ panelLayout = false }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const backTo = panelBase(user?.role);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(backTo);
  };

  const content = (
    <div
      className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 text-center space-y-3"
      data-testid="tools-page-content"
    >
      <div className="mx-auto h-12 w-12 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center text-emerald-900 dark:text-emerald-200">
        <Wrench className="h-6 w-6" strokeWidth={1.5} />
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 max-w-sm mx-auto">
        {t("tools.hint")}
      </p>
    </div>
  );

  return (
    <MobilePageShell
      embedded={panelLayout}
      title={t("nav.tools")}
      description={t("tools.pageDesc")}
      onBack={handleBack}
      testId="tools-page"
    >
      {content}
    </MobilePageShell>
  );
}
