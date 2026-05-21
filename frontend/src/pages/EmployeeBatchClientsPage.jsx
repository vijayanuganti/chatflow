import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Avatar from "@/components/Avatar";
import MobilePageShell from "@/components/layout/MobilePageShell";
import { employeeDetailPath, resolveBackTo } from "@/lib/appRoutes";
import { api, formatApiError } from "@/lib/api";
import { getClientStatus } from "@/lib/accountStatus";
import { toast } from "sonner";

export default function EmployeeBatchClientsPage() {
  const { userId, batchId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const backTo = resolveBackTo(location.state, employeeDetailPath(userId));
  const batchNameFromState = location.state?.batchName;

  const [loading, setLoading] = useState(true);
  const [batch, setBatch] = useState(null);
  const [employeeName, setEmployeeName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/employees/${userId}/batches`);
      const employee = res.data?.employee;
      const batches = res.data?.batches || [];
      const found = batches.find((b) => b.id === batchId);
      if (!found) {
        toast.error("Batch not found");
        navigate(backTo, { replace: true });
        return;
      }
      setEmployeeName(employee?.full_name || "");
      setBatch(found);
    } catch (err) {
      toast.error(formatApiError(err));
      navigate(backTo, { replace: true });
    } finally {
      setLoading(false);
    }
  }, [userId, batchId, navigate, backTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const clients = useMemo(() => batch?.clients || [], [batch]);
  const title = batchNameFromState || batch?.name || "Batch clients";

  return (
    <MobilePageShell
      title={title}
      description={employeeName ? `Clients · ${employeeName}` : "Clients in this batch"}
      backTo={backTo}
      testId="employee-batch-clients-page"
    >
      {loading && !batch ? (
        <div className="py-12 flex items-center justify-center text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <div className="max-w-3xl mx-auto w-full">
          {batch ? (
            <div className="mb-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/50 px-4 py-3 text-xs text-gray-600 dark:text-gray-400 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <span>
                <span className="block text-[10px] uppercase text-gray-400">Start</span>
                {batch.start_date || "—"}
              </span>
              <span>
                <span className="block text-[10px] uppercase text-gray-400">End</span>
                {batch.end_date || "—"}
              </span>
              <span>
                <span className="block text-[10px] uppercase text-gray-400">Days left</span>
                {batch.days_remaining != null ? batch.days_remaining : "—"}
              </span>
              <span>
                <span className="block text-[10px] uppercase text-gray-400">Clients</span>
                {clients.length}
              </span>
            </div>
          ) : null}

          {clients.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-12">No clients in this batch.</p>
          ) : (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900">
              {clients.map((c, idx) => {
                const st = getClientStatus(c);
                return (
                  <div
                    key={c.id}
                    className={`flex items-center gap-3 px-4 py-3 ${
                      idx > 0 ? "border-t border-gray-100 dark:border-gray-800" : ""
                    }`}
                    data-testid={`batch-client-row-${c.id}`}
                  >
                    <Avatar name={c.full_name} avatarUrl={c.avatar_url} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate dark:text-gray-100">{c.full_name}</div>
                      <div className="text-xs text-gray-500 font-mono truncate">{c.id}</div>
                      <div className="text-xs text-gray-500">{c.phone_number || "—"}</div>
                    </div>
                    <span className="text-xs capitalize text-gray-600 dark:text-gray-400 shrink-0">{st}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </MobilePageShell>
  );
}
