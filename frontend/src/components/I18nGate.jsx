import React, { useEffect, useState } from "react";
import { initI18n } from "@/i18n";

function LoadingScreen() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500 dark:bg-gray-950 dark:text-gray-400"
      data-testid="loading-screen"
    >
      Loading...
    </div>
  );
}

/** Load saved language before rendering the app shell. */
export default function I18nGate({ children }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    initI18n().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return <I18nBootstrapLoading />;
  return children;
}

function I18nBootstrapLoading() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShow(true), 0);
    return () => clearTimeout(id);
  }, []);
  if (!show) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950" data-testid="loading-screen" />
    );
  }
  return <LoadingScreen />;
}
