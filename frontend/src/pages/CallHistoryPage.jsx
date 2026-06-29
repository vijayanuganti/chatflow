import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import CallHistoryList from "@/components/call/CallHistoryList";
import { useAuth } from "@/context/AuthContext";
import { useCall } from "@/context/CallContext";
import { api, formatApiError } from "@/lib/api";
import { panelBase } from "@/lib/appRoutes";
import {
  buildAvatarMapFromConversations,
  fetchAvatarMapForUserIds,
  remoteUserIdsFromCallLogs,
} from "@/lib/userAvatar";
import { toast } from "sonner";
import "@/components/call/callOverlay.css";

function buildNameMap(conversations) {
  const map = {};
  (conversations || []).forEach((c) => {
    if (c.other_user?.id) {
      map[c.other_user.id] = c.other_user.full_name || c.other_user.username;
    }
    (c.participants_info || []).forEach((p) => {
      if (p?.id) map[p.id] = p.full_name || p.username;
    });
  });
  return map;
}

export default function CallHistoryPage({ panelLayout = false, tabEmbedded = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { startCallForChat } = useCall();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nameMap, setNameMap] = useState({});
  const [avatarMap, setAvatarMap] = useState({});
  const [activeFilter, setActiveFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [historyRes, convRes] = await Promise.all([
        api.get("/call-history/me"),
        user?.role === "client"
          ? api.get("/conversations/assigned-employee").catch(() => ({ data: {} }))
          : api.get("/conversations"),
      ]);
      setLogs(historyRes.data?.items || []);
      let avatars = {};
      if (user?.role === "client") {
        const conv = convRes.data?.conversation;
        const employee = convRes.data?.employee;
        const map = {};
        if (employee?.id) {
          map[employee.id] = employee.full_name;
          avatars[employee.id] = employee.avatar_url || null;
        }
        if (conv?.other_user?.id) {
          map[conv.other_user.id] = conv.other_user.full_name;
          avatars[conv.other_user.id] = conv.other_user.avatar_url || null;
        }
        setNameMap(map);
      } else {
        const convs = convRes.data || [];
        setNameMap(buildNameMap(convs));
        avatars = buildAvatarMapFromConversations(convs);
      }
      const remoteIds = remoteUserIdsFromCallLogs(historyRes.data?.items || [], user?.id);
      avatars = await fetchAvatarMapForUserIds(remoteIds, avatars);
      setAvatarMap(avatars);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [user?.role, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCallBack = useCallback(
    async (remoteUserId, conversationId, remoteName) => {
      const ok = await startCallForChat(conversationId, remoteUserId, remoteName);
      if (ok) navigate(panelBase(user?.role));
    },
    [startCallForChat, navigate, user?.role],
  );

  const backTo = useMemo(() => panelBase(user?.role), [user?.role]);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(backTo);
  };

  return (
    <div
      className={`call-history-page ${panelLayout ? "min-h-0 flex-1" : "fixed inset-0 z-40"}`}
      data-testid="call-history-page"
    >
      <header className="call-history-page-header">
        {!tabEmbedded ? (
          <button type="button" className="call-history-page-back" onClick={handleBack} aria-label="Go back">
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : null}
        <h1 className={`call-history-page-title ${tabEmbedded ? "pl-1" : ""}`}>Call history</h1>
      </header>

      <div className="call-history-page-body">
        <div className="call-history-tabs-v2" role="tablist">
          {[
            { id: "all", label: "All" },
            { id: "missed", label: "Missed" },
            { id: "incoming", label: "Incoming" },
            { id: "outgoing", label: "Outgoing" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeFilter === tab.id}
              className={`call-history-tab-v2 ${activeFilter === tab.id ? "active" : ""}`}
              onClick={() => setActiveFilter(tab.id)}
              data-testid={`call-history-filter-${tab.id}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <CallHistoryList
          logs={logs}
          currentUserId={user?.id}
          nameMap={nameMap}
          avatarMap={avatarMap}
          loading={loading}
          filter={activeFilter}
          pageLayout
          onCallBack={handleCallBack}
        />
      </div>
    </div>
  );
}
