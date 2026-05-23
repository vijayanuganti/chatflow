import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ImageIcon, Wrench, Wifi } from "lucide-react";
import MobilePageShell from "@/components/layout/MobilePageShell";
import { useAuth } from "@/context/AuthContext";
import { panelBase } from "@/lib/appRoutes";
import {
  getNetworkKind,
  isWifiAutoDownloadImagesEnabled,
  setWifiAutoDownloadImages,
} from "@/lib/mediaAutoDownload";

/** Tools hub — media download preferences and shortcuts. */
export default function ToolsPage({ panelLayout = false }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const backTo = panelBase(user?.role);

  const [wifiAutoImages, setWifiAutoImages] = useState(() => isWifiAutoDownloadImagesEnabled());
  const networkKind = getNetworkKind();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(backTo);
  };

  const onWifiAutoImagesChange = useCallback((enabled) => {
    setWifiAutoDownloadImages(enabled);
    setWifiAutoImages(enabled);
  }, []);

  const networkLabel =
    networkKind === "wifi"
      ? t("tools.media.networkWifi")
      : networkKind === "cellular"
        ? t("tools.media.networkCellular")
        : t("tools.media.networkUnknown");

  const content = (
    <div className="space-y-4" data-testid="tools-page-content">
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-900 dark:text-emerald-200">
            <Wrench className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t("tools.media.title")}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("tools.media.subtitle")}</p>
          </div>
        </div>

        <div className="px-4 py-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
          <Wifi className="h-4 w-4 shrink-0" aria-hidden />
          <span>{t("tools.media.currentNetwork", { network: networkLabel })}</span>
        </div>

        <label
          className="flex items-center gap-3 px-4 py-3.5 cursor-pointer touch-manipulation"
          data-testid="tools-wifi-auto-images"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300">
            <ImageIcon className="h-4 w-4" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {t("tools.media.wifiAutoImages")}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              {t("tools.media.wifiAutoImagesHint")}
            </p>
          </div>
          <input
            type="checkbox"
            className="h-5 w-5 shrink-0 rounded border-gray-300 text-emerald-800 focus:ring-emerald-800"
            checked={wifiAutoImages}
            onChange={(e) => onWifiAutoImagesChange(e.target.checked)}
            aria-label={t("tools.media.wifiAutoImages")}
          />
        </label>

        <ul className="px-4 pb-4 space-y-1.5 text-[11px] text-gray-500 dark:text-gray-400 list-disc list-inside border-t border-gray-100 dark:border-gray-800 pt-3">
          <li>{t("tools.media.ruleWifiImages")}</li>
          <li>{t("tools.media.ruleManualVideoDoc")}</li>
          <li>{t("tools.media.ruleCellular")}</li>
        </ul>
      </section>

      <p className="text-xs text-center text-gray-500 dark:text-gray-400 px-2">{t("tools.hint")}</p>
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
