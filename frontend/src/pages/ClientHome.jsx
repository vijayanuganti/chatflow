import React from "react";
import { useOutletContext } from "react-router-dom";
import ChatApp from "@/pages/ChatApp";
import DietPlanPage from "@/pages/DietPlanPage";
import FolderBrowsePage from "@/pages/FolderBrowsePage";
import CallHistoryPage from "@/pages/CallHistoryPage";

/**
 * Client portal home: footer tabs swap content in-place at /chat (no full route hop per tab).
 */
export default function ClientHome() {
  const { clientTab } = useOutletContext() || {};

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="client-home">
      {clientTab === "chats" || !clientTab ? <ChatApp clientHomeMode /> : null}
      {clientTab === "diet" ? <DietPlanPage panelLayout tabEmbedded /> : null}
      {clientTab === "folders" ? <FolderBrowsePage tabEmbedded /> : null}
      {clientTab === "calls" ? <CallHistoryPage panelLayout tabEmbedded /> : null}
    </div>
  );
}
