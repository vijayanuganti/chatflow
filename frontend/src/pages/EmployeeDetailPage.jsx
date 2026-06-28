import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ChevronRight, Loader2 } from "lucide-react";
import Avatar from "@/components/Avatar";
import PresenceLabel from "@/components/admin/PresenceLabel";
import MobilePageShell from "@/components/layout/MobilePageShell";
import { employeeBatchClientsPath, resolveBackTo } from "@/lib/appRoutes";
import { api, formatApiError } from "@/lib/api";
import { filterBatchForTab } from "@/lib/accountStatus";
import { useChatSocketHandlers } from "@/context/ChatSocketContext";
import { toast } from "sonner";

const BATCH_TABS = [
  { id: "active", label: "Active Batches" },
  { id: "inactive", label: "Inactive Batches" },
];

export default function EmployeeDetailPage() {
  const { userId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const backTo = resolveBackTo(location.state, "/admin/users");

  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [batches, setBatches] = useState([]);
  const [batchTab, setBatchTab] = useState("active");
  const [onlineUsers, setOnlineUsers] = useState({});

  const handlePresence = useCallback((data) => {
    if (data?.user_id != null) {
      setOnlineUsers((prev) => ({ ...prev, [data.user_id]: data.online }));
    }
  }, []);

  useChatSocketHandlers({ onPresence: handlePresence });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detailRes, batchRes] = await Promise.all([
        api.get(`/admin/users/${userId}`),
        api.get(`/admin/employees/${userId}/batches`),
      ]);
      const user = detailRes.data?.user;
      if (!user || user.role !== "employee") {
        toast.error("Employee not found");
        navigate(backTo, { replace: true });
        return;
      }
      setAccount({ ...detailRes.data, user });
      setBatches(batchRes.data?.batches || []);
    } catch (err) {
      toast.error(formatApiError(err));
      navigate(backTo, { replace: true });
    } finally {
      setLoading(false);
    }
  }, [userId, navigate, backTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredBatches = useMemo(
    () => batches.filter((b) => filterBatchForTab(b, batchTab)),
    [batches, batchTab],
  );

  const batchTabCounts = useMemo(() => {
    const counts = { active: 0, inactive: 0 };
    batches.forEach((b) => {
      const st = (b.status || "active").toLowerCase();
      if (st === "active") counts.active += 1;
      else if (st === "inactive") counts.inactive += 1;
    });
    return counts;
  }, [batches]);

  const user = account?.user;

  const openBatch = (batch) => {
    navigate(employeeBatchClientsPath(userId, batch.id), {
      state: { backTo: location.pathname, batchName: batch.name },
    });
  };

  return (
    <MobilePageShell
      title={user?.full_name || "Employee"}
      description="Account details and batches"
      backTo={backTo}
      testId="employee-detail-page"
    >
      {loading && !user ? (
        <div className="py-12 flex items-center justify-center text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : !user ? (
        <p className="text-sm text-gray-500 text-center py-12">Employee not found.</p>
      ) : (
        <div className="space-y-6 max-w-3xl mx-auto w-full">
          <section data-testid="employee-account-section">
            <h2 className="text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 mb-3">
              Account Details
            </h2>
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
              <div className="flex items-center gap-4 mb-5">
                <Avatar name={user.full_name} avatarUrl={user.avatar_url} size={56} />
                <div className="min-w-0">
                  <div className="font-display font-semibold text-lg truncate">{user.full_name}</div>
                  <div className="text-xs text-gray-500 truncate">@{user.username}</div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DetailField label="ID" value={<span className="font-mono text-xs">{user.id}</span>} />
                <DetailField label="Phone" value={user.phone_number || "—"} />
                <DetailField label="Email" value={user.email || "—"} />
                <DetailField
                  label="Status"
                  value={
                    user.is_active === false ? (
                      <span className="text-rose-700">Inactive</span>
                    ) : (
                      <span className="text-emerald-800">Active</span>
                    )
                  }
                />
                <DetailField label="Presence" value={<PresenceLabel online={!!onlineUsers[user.id]} />} />
                <DetailField
                  label="Join date"
                  value={user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
                />
                <DetailField
                  label="Account creation access"
                  value={user.account_creation_access ? "Granted" : "Not granted"}
                />
                <DetailField
                  label="Created by"
                  value={
                    account?.created_by_user?.full_name
                      ? `${account.created_by_user.full_name} (@${account.created_by_user.username})`
                      : "System / seed"
                  }
                />
              </div>
            </div>
          </section>

          <section data-testid="employee-batches-section">
            <h2 className="text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 mb-3">
              Batches
            </h2>
            <div className="flex gap-2 mb-4">
              {BATCH_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setBatchTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
                    batchTab === tab.id
                      ? "border-emerald-800 bg-emerald-900 text-white"
                      : "border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                  }`}
                  data-testid={`employee-batch-tab-${tab.id}`}
                >
                  {tab.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                      batchTab === tab.id ? "bg-white/20" : "bg-gray-100 dark:bg-gray-800"
                    }`}
                  >
                    {batchTabCounts[tab.id] ?? 0}
                  </span>
                </button>
              ))}
            </div>

            {filteredBatches.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
                No {batchTab} batches.
              </p>
            ) : (
              <div className="space-y-3">
                {filteredBatches.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => openBatch(b)}
                    className="w-full text-left rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    data-testid={`employee-batch-card-${b.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium dark:text-gray-100">{b.name}</div>
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <span>
                            <span className="block text-[10px] uppercase tracking-wide text-gray-400">Start</span>
                            {b.start_date || "—"}
                          </span>
                          <span>
                            <span className="block text-[10px] uppercase tracking-wide text-gray-400">End</span>
                            {b.end_date || "—"}
                          </span>
                          <span>
                            <span className="block text-[10px] uppercase tracking-wide text-gray-400">Days left</span>
                            {b.days_remaining != null ? b.days_remaining : "—"}
                          </span>
                          <span>
                            <span className="block text-[10px] uppercase tracking-wide text-gray-400">Clients</span>
                            {b.client_count ?? (b.clients?.length ?? 0)}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400 shrink-0 mt-0.5" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </MobilePageShell>
  );
}

function DetailField({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-sm text-gray-900 dark:text-gray-100 mt-1 break-words">{value}</div>
    </div>
  );
}
