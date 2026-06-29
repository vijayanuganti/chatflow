import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CallHistoryList, { downloadCallLogsCsv } from "@/components/call/CallHistoryList";
import { api, formatApiError } from "@/lib/api";
import { buildAvatarMapFromUsers } from "@/lib/userAvatar";
import { toast } from "sonner";

export default function AdminCallLogsPane() {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [logsRes, usersRes] = await Promise.all([
        api.get("/admin/call-logs", { params: { limit: 500 } }),
        api.get("/admin/users"),
      ]);
      setLogs(logsRes.data?.items || []);
      setUsers(usersRes.data || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nameMap = useMemo(() => {
    const map = {};
    users.forEach((u) => {
      if (u?.id) map[u.id] = u.full_name || u.username;
    });
    return map;
  }, [users]);

  const avatarMap = useMemo(() => buildAvatarMapFromUsers(users), [users]);

  const filteredForExport = useMemo(() => {
    const enriched = logs.map((log) => ({
      ...log,
      caller_name: nameMap[log.caller_id] || log.caller_id,
      callee_name: nameMap[log.callee_id] || log.callee_id,
    }));
    const q = searchQuery.trim().toLowerCase();
    if (!q) return enriched;
    return enriched.filter(
      (l) =>
        String(l.caller_name || "").toLowerCase().includes(q) ||
        String(l.callee_name || "").toLowerCase().includes(q),
    );
  }, [logs, nameMap, searchQuery]);

  return (
    <div className="p-4 sm:p-6 lg:p-10 overflow-y-auto space-y-4" data-testid="admin-call-logs-pane">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold dark:text-gray-100">Call logs</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            All voice calls across the platform
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => downloadCallLogsCsv(filteredForExport, "admin-call-logs")}
            disabled={!filteredForExport.length}
            data-testid="admin-call-logs-csv"
          >
            <Download className="h-4 w-4 mr-1.5" />
            Download CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by caller or callee name…"
          className="pl-9 rounded-full"
          data-testid="admin-call-logs-search"
        />
      </div>

      <CallHistoryList
        logs={logs}
        nameMap={nameMap}
        avatarMap={avatarMap}
        loading={loading}
        showFilter
        adminMode
        searchQuery={searchQuery}
      />
    </div>
  );
}
