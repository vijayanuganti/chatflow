import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AdminSearchBar from "@/components/admin/AdminSearchBar";
import Avatar from "@/components/Avatar";
import { api, formatApiError } from "@/lib/api";
import { createAccountPath } from "@/lib/appRoutes";
import { COMPANY_PRIMARY } from "@/lib/appInfo";
import {
  healthGoalLabel,
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

function formatReferredDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
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
  const [detail, setDetail] = useState(null);
  const [adminNote, setAdminNote] = useState("");
  const [statusDraft, setStatusDraft] = useState("pending");
  const [saving, setSaving] = useState(false);

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

  const openDetail = (row) => {
    setDetail(row);
    setAdminNote(row.admin_note || "");
    setStatusDraft(row.status || "pending");
  };

  const saveDetail = async () => {
    if (!detail?.id) return;
    setSaving(true);
    try {
      const res = await api.patch(`/admin/referrals/${detail.id}`, {
        status: statusDraft,
        admin_note: adminNote,
      });
      const updated = res.data;
      setItems((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setDetail(updated);
      setStats((prev) => {
        const next = { ...prev };
        const old = detail.status;
        const neu = updated.status;
        if (old !== neu) {
          if (old === "pending") next.pending = Math.max(0, next.pending - 1);
          if (old === "converted") next.converted = Math.max(0, next.converted - 1);
          if (old === "rejected") next.rejected = Math.max(0, next.rejected - 1);
          if (neu === "pending") next.pending += 1;
          if (neu === "converted") next.converted += 1;
          if (neu === "rejected") next.rejected += 1;
        }
        return next;
      });
      toast.success("Referral updated");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const createClientFromReferral = () => {
    if (!detail) return;
    navigate(createAccountPath(), {
      state: {
        backTo: "/admin/referrals",
        defaultRole: "client",
        allowedRoles: ["client"],
        referralId: detail.id,
        referralPrefill: {
          full_name: detail.referred_name,
          phone_number: detail.referred_phone,
          referred_email: detail.referred_email,
        },
      },
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
        <table className="w-full min-w-[900px] text-sm" data-testid="referrals-table">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-[10px] uppercase tracking-wider text-gray-500">
              <th className="px-3 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Phone</th>
              <th className="px-3 py-2.5 font-medium">Email</th>
              <th className="px-3 py-2.5 font-medium">Age</th>
              <th className="px-3 py-2.5 font-medium">Health goal</th>
              <th className="px-3 py-2.5 font-medium">Referred by</th>
              <th className="px-3 py-2.5 font-medium">Date</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-gray-400">
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
                <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 font-mono text-xs">
                  {r.referred_phone}
                </td>
                <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 text-xs">
                  {r.referred_email || "—"}
                </td>
                <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">
                  {r.referred_age ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 text-xs max-w-[140px] truncate">
                  {healthGoalLabel(r.health_goal, r.health_goal_other)}
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
                <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                  {formatReferredDate(r.created_at)}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${referralStatusBadgeClass(r.status)}`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full text-xs"
                      onClick={() => openDetail(r)}
                      data-testid={`referral-view-${r.id}`}
                    >
                      View
                    </Button>
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
                      <SelectTrigger className="h-8 w-[110px] rounded-full text-xs">
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="referral-detail-dialog">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-lg">{detail.referred_name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                  <Avatar
                    name={detail.referrer?.full_name}
                    avatarUrl={detail.referrer?.avatar_url}
                    size={44}
                  />
                  <div>
                    <p className="text-[10px] uppercase text-gray-500">Referred by</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">
                      {detail.referred_by_name || detail.referrer?.full_name}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">{detail.referred_by_type}</p>
                    <p className="text-[10px] font-mono text-gray-400">{detail.referred_by_id}</p>
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-gray-500">Phone</dt>
                    <dd className="font-mono">{detail.referred_phone}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Email</dt>
                    <dd>{detail.referred_email || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Age</dt>
                    <dd>{detail.referred_age ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Health goal</dt>
                    <dd>{healthGoalLabel(detail.health_goal, detail.health_goal_other)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-gray-500">Referrer notes</dt>
                    <dd className="text-gray-700 dark:text-gray-300">{detail.notes || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Submitted</dt>
                    <dd>{formatReferredDate(detail.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Last updated</dt>
                    <dd>{formatReferredDate(detail.updated_at)}</dd>
                  </div>
                </dl>

                <div>
                  <Label className="text-xs">Status</Label>
                  <Select value={statusDraft} onValueChange={setStatusDraft}>
                    <SelectTrigger className="mt-1 rounded-lg">
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
                </div>

                <div>
                  <Label className="text-xs">Internal admin note (not visible to referrer)</Label>
                  <Textarea
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    rows={3}
                    className="mt-1 rounded-lg"
                    placeholder="Private notes for admin team…"
                    data-testid="referral-admin-note"
                  />
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <Button
                    type="button"
                    className="rounded-lg text-white"
                    style={{ backgroundColor: COMPANY_PRIMARY }}
                    disabled={saving}
                    onClick={() => void saveDetail()}
                    data-testid="referral-save-btn"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
                  </Button>
                  {statusDraft === "converted" && (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-lg"
                      onClick={createClientFromReferral}
                      data-testid="referral-create-client-btn"
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Create Client Account
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
