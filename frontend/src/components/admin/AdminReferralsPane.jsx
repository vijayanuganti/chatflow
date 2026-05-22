import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AdminSearchBar from "@/components/admin/AdminSearchBar";
import { api, formatApiError } from "@/lib/api";
import { COMPANY_PRIMARY } from "@/lib/appInfo";
import {
  matchesReferralSearch,
  referralStatusBadgeClass,
  REFERRAL_STATUSES,
} from "@/lib/referrals";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

function StatBox({ label, value, testId }) {
  return (
    <div
      className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-4 text-center dark:border-gray-800 dark:bg-gray-900"
      data-testid={testId}
    >
      <div className="text-[20px] font-bold tabular-nums" style={{ color: COMPANY_PRIMARY }}>
        {value}
      </div>
      <div className="mt-1 text-[9px] uppercase tracking-[0.14em] text-[#6B7280] dark:text-gray-500">
        {label}
      </div>
    </div>
  );
}

export default function AdminReferralsPane() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    converted: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter !== "all") params.status = filter;
      const res = await api.get("/admin/referrals", { params });
      setItems(res.data?.items || []);
      setStats(res.data?.stats || { total: 0, pending: 0, converted: 0, rejected: 0 });
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => items.filter((r) => matchesReferralSearch(r, search)),
    [items, search],
  );

  const openDetails = (row) => {
    navigate(`/admin/referrals/${row.id}`, {
      state: { backTo: "/admin/referrals" },
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-10 overflow-y-auto space-y-6" data-testid="admin-referrals-pane">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-800 dark:text-emerald-300">
            Admin · Referrals
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold mt-1 dark:text-gray-100">
            Referrals
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 max-w-xl text-sm">
            Client referrals from employees and clients. Review, update status, and create accounts when converted.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full self-start"
          onClick={() => void load()}
          disabled={loading}
          data-testid="referrals-refresh-btn"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
          ) : (
            <RotateCcw className="h-4 w-4 mr-1.5" />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl">
        <StatBox label="Total" value={stats.total} testId="referrals-stat-total" />
        <StatBox label="Pending" value={stats.pending} testId="referrals-stat-pending" />
        <StatBox label="Converted" value={stats.converted} testId="referrals-stat-converted" />
        <StatBox label="Rejected" value={stats.rejected} testId="referrals-stat-rejected" />
      </div>

      <AdminSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by name, phone, or referred by…"
        testId="referrals-search"
      />

      <div
        className="inline-flex rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden text-xs"
        data-testid="referrals-filter"
      >
        {[{ id: "all", label: "All" }, ...REFERRAL_STATUSES].map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setFilter(opt.id)}
            className={`px-4 py-1.5 ${
              filter === opt.id
                ? "bg-emerald-900 text-white"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
            data-testid={`referrals-filter-${opt.id}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <table className="w-full min-w-[640px] text-sm" data-testid="referrals-table">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-[10px] uppercase tracking-wider text-gray-500">
              <th className="px-3 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Referred By</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Actions</th>
              <th className="px-3 py-2.5 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-gray-400">
                  No referrals in this view.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr
                key={r.id}
                className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50/80 dark:hover:bg-gray-800/40"
                data-testid={`referral-row-${r.id}`}
              >
                <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-gray-100">
                  {r.referred_name}
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
                    {r.referred_by_name}
                  </span>
                  <span
                    className={`ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] uppercase ${
                      r.referred_by_type === "employee"
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-sky-50 text-sky-800"
                    }`}
                  >
                    {r.referred_by_type}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${referralStatusBadgeClass(r.status)}`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <Select
                    value={r.status}
                    onValueChange={async (v) => {
                      try {
                        const res = await api.patch(`/admin/referrals/${r.id}`, { status: v });
                        setItems((prev) =>
                          prev.map((x) => (x.id === r.id ? res.data : x)),
                        );
                        toast.success("Status updated");
                        void load();
                      } catch (err) {
                        toast.error(formatApiError(err));
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 w-[110px] rounded-full text-xs" data-testid={`referral-status-${r.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REFERRAL_STATUSES.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full text-xs"
                    onClick={() => openDetails(r)}
                    data-testid={`referral-details-${r.id}`}
                  >
                    Details
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
