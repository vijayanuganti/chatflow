import React, { useMemo } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Phone,
  PhoneMissed,
  PhoneOff,
} from "lucide-react";
import {
  callHistoryDirection,
  callHistoryRemoteUser,
  downloadCallLogsCsv,
  formatCallDate,
  formatCallBubbleDuration,
} from "@/lib/callHistoryFormat";
import Avatar from "@/components/Avatar";
import "./callOverlay.css";

function DirectionIcon({ direction }) {
  const cls = `call-history-dir-icon call-history-dir-${direction}`;
  if (direction === "declined") {
    return <PhoneOff className={`h-3 w-3 ${cls}`} />;
  }
  if (direction === "missed") {
    return <PhoneMissed className={`h-3 w-3 ${cls}`} />;
  }
  if (direction === "outgoing") {
    return <ArrowUpRight className={`h-3 w-3 ${cls}`} />;
  }
  return <ArrowDownLeft className={`h-3 w-3 ${cls}`} />;
}

function resolveHistoryAvatar(log, avatarMap) {
  return (
    avatarMap[log.displayId] ||
    avatarMap[log.remoteUserId] ||
    avatarMap[log.caller_id] ||
    avatarMap[log.callee_id] ||
    null
  );
}

function formatCallMeta(log, direction) {
  const dateLabel = formatCallDate(log.started_at);
  const isUnanswered =
    direction === "missed" ||
    direction === "declined" ||
    log.status === "missed" ||
    log.status === "declined";
  const durationText = isUnanswered ? null : formatCallBubbleDuration(log.duration_seconds);
  return durationText ? `${dateLabel} ${durationText}` : dateLabel;
}

function HistorySkeleton({ rows = 5 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="call-history-skeleton">
          <div className="call-history-skeleton-avatar" />
          <div className="call-history-skeleton-lines">
            <div className="call-history-skeleton-line long" />
            <div className="call-history-skeleton-line short" />
          </div>
        </div>
      ))}
    </>
  );
}

function filterLogs(logs, filter, currentUserId, adminMode = false) {
  if (adminMode) {
    if (filter === "missed") return logs.filter((l) => l.status === "missed" || l.status === "declined");
    if (filter === "incoming") {
      return logs.filter((l) => l.status === "answered" || l.status === "declined");
    }
    if (filter === "outgoing") {
      return logs.filter((l) => l.status === "missed" || l.status === "ringing");
    }
    return logs;
  }
  const uid = String(currentUserId || "");
  if (filter === "missed") return logs.filter((l) => l.status === "missed" || l.status === "declined");
  if (filter === "incoming") return logs.filter((l) => String(l.callee_id) === uid);
  if (filter === "outgoing") return logs.filter((l) => String(l.caller_id) === uid);
  return logs;
}

const EMPTY_COPY = {
  all: {
    title: "No calls yet",
    sub: "Start a call from any chat conversation",
  },
  missed: {
    title: "No missed calls",
    sub: "You're all caught up",
  },
  incoming: {
    title: "No incoming calls yet",
    sub: "",
  },
  outgoing: {
    title: "No outgoing calls yet",
    sub: "",
  },
};

function EmptyState({ filter }) {
  const copy = EMPTY_COPY[filter] || EMPTY_COPY.all;
  return (
    <div className="call-history-empty">
      <Phone className="call-history-empty-icon" strokeWidth={1.25} />
      <div className="call-history-empty-title">{copy.title}</div>
      {copy.sub ? <div className="call-history-empty-sub">{copy.sub}</div> : null}
    </div>
  );
}

export default function CallHistoryList({
  logs = [],
  currentUserId,
  nameMap = {},
  avatarMap = {},
  loading = false,
  showFilter = false,
  filter: controlledFilter,
  onFilterChange,
  onCallBack,
  adminMode = false,
  searchQuery = "",
  pageLayout = false,
}) {
  const [internalFilter, setInternalFilter] = React.useState("all");
  const filter = controlledFilter ?? internalFilter;

  const enriched = useMemo(() => {
    return logs.map((log) => {
      if (adminMode) {
        const callerName = nameMap[log.caller_id] || log.caller_name || log.caller_id;
        const calleeName = nameMap[log.callee_id] || log.callee_name || log.callee_id;
        return {
          ...log,
          caller_name: callerName,
          callee_name: calleeName,
          displayName: `${callerName} → ${calleeName}`,
          displayId: log.caller_id,
        };
      }
      const remote = callHistoryRemoteUser(log, currentUserId);
      const resolvedName = nameMap[remote.id] || remote.name || "Unknown";
      return {
        ...log,
        displayName: resolvedName,
        displayId: remote.id,
        remoteUserId: remote.id,
      };
    });
  }, [logs, currentUserId, nameMap, adminMode]);

  const filtered = useMemo(() => {
    let rows = filterLogs(enriched, filter, currentUserId, adminMode);
    const q = (searchQuery || "").trim().toLowerCase();
    if (q) {
      rows = rows.filter((l) => {
        if (adminMode) {
          return (
            String(l.displayName || "").toLowerCase().includes(q) ||
            String(l.caller_name || "").toLowerCase().includes(q) ||
            String(l.callee_name || "").toLowerCase().includes(q)
          );
        }
        return String(l.displayName || "").toLowerCase().includes(q);
      });
    }
    return rows;
  }, [enriched, filter, currentUserId, adminMode, searchQuery]);

  const setFilter = (id) => {
    if (onFilterChange) onFilterChange(id);
    else setInternalFilter(id);
  };

  return (
    <div data-testid="call-history-list">
      {showFilter && !controlledFilter ? (
        <div className="call-history-tabs" role="tablist">
          {[
            { id: "all", label: "All" },
            { id: "missed", label: "Missed" },
            { id: "incoming", label: "Incoming" },
            { id: "outgoing", label: "Outgoing" },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`call-history-tab ${filter === f.id ? "active" : ""}`}
              onClick={() => setFilter(f.id)}
              data-testid={`call-history-filter-${f.id}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? <HistorySkeleton rows={5} /> : null}

      {!loading && filtered.length === 0 ? (
        pageLayout ? (
          <EmptyState filter={filter} />
        ) : (
          <p className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
            {EMPTY_COPY[filter]?.title || EMPTY_COPY.all.title}
          </p>
        )
      ) : null}

      {!loading
        ? filtered.map((log) => {
            const direction = adminMode
              ? log.status === "missed" || log.status === "declined"
                ? log.status === "declined"
                  ? "declined"
                  : "missed"
                : "outgoing"
              : callHistoryDirection(log, currentUserId);
            const showCallButton =
              !adminMode &&
              onCallBack &&
              log.conversation_id &&
              log.remoteUserId;
            const metaText = formatCallMeta(log, direction);
            const durationText =
              direction === "missed" ||
              direction === "declined" ||
              log.status === "missed" ||
              log.status === "declined"
                ? null
                : formatCallBubbleDuration(log.duration_seconds);

            return (
              <div key={log.call_id} className="call-history-row">
                <Avatar
                  name={log.displayName}
                  avatarUrl={resolveHistoryAvatar(log, avatarMap)}
                  size={40}
                  variant="default"
                  className="call-history-avatar-slot"
                />
                <div className="call-history-meta">
                  <div className="call-history-name truncate">{log.displayName}</div>
                  <div className="call-history-sub">
                    <DirectionIcon direction={direction} />
                    <span>{metaText}</span>
                  </div>
                </div>
                <div className="call-history-right">
                  {showCallButton ? (
                    <button
                      type="button"
                      className="call-history-callback"
                      aria-label="Call"
                      onClick={() =>
                        onCallBack(log.remoteUserId, log.conversation_id, log.displayName)
                      }
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    durationText || "—"
                  )}
                </div>
              </div>
            );
          })
        : null}
    </div>
  );
}

export { downloadCallLogsCsv };
