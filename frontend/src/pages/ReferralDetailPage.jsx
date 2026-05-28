import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Avatar from "@/components/Avatar";
import { api, formatApiError } from "@/lib/api";
import { createAccountPath } from "@/lib/appRoutes";
import { COMPANY_PRIMARY } from "@/lib/appInfo";
import {
  healthGoalLabel,
  referralStatusBadgeClass,
  referredByDetailLine,
  REFERRAL_STATUSES,
} from "@/lib/referrals";
import { toast } from "sonner";

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

function InfoCard({ title, rows }) {
  return (
    <section className="rounded-[12px] border border-[#E5E7EB] bg-white dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
      <h2 className="px-5 pt-5 pb-2 text-[9px] font-medium uppercase tracking-[0.14em] text-[#6B7280] dark:text-gray-500">
        {title}
      </h2>
      <dl className="px-5 pb-5">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={`flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 py-3 ${
              i > 0 ? "border-t border-[#E5E7EB] dark:border-gray-800" : ""
            } ${i % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-[#F9FAFB] dark:bg-gray-950/40"} -mx-5 px-5`}
          >
            <dt className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#6B7280] dark:text-gray-500 shrink-0">
              {row.label}
            </dt>
            <dd className="text-[10px] font-semibold text-[#1A1A2E] dark:text-gray-100 sm:text-right break-words">
              {row.value ?? "—"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function ReferralDetailPage() {
  const { referralId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const backTo = location.state?.backTo || "/admin/referrals";

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adminNote, setAdminNote] = useState("");
  const [statusDraft, setStatusDraft] = useState("pending");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/referrals/${referralId}`);
      setDetail(res.data);
      setAdminNote(res.data?.admin_note || "");
      setStatusDraft(res.data?.status || "pending");
    } catch (err) {
      toast.error(formatApiError(err));
      navigate(backTo, { replace: true });
    } finally {
      setLoading(false);
    }
  }, [referralId, navigate, backTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveDetail = async () => {
    if (!detail?.id) return;
    setSaving(true);
    try {
      const res = await api.patch(`/admin/referrals/${detail.id}`, {
        status: statusDraft,
        admin_note: adminNote,
      });
      setDetail(res.data);
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
        backTo: `/admin/referrals/${detail.id}`,
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

  if (loading && !detail) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-gray-400" data-testid="referral-detail-loading">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="p-4 sm:p-6 lg:p-10 overflow-y-auto max-w-3xl mx-auto space-y-6" data-testid="referral-detail-page">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full -ml-2 text-emerald-900 dark:text-emerald-200"
        onClick={() => navigate(backTo)}
        data-testid="referral-detail-back"
      >
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Back to Referrals
      </Button>

      <div className="rounded-[12px] border border-[#E5E7EB] bg-white dark:border-gray-800 dark:bg-gray-900 p-5 flex items-center gap-4">
        <Avatar name={detail.referred_name} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-semibold text-[#1A1A2E] dark:text-gray-100 truncate">
            {detail.referred_name}
          </h1>
          <span
            className={`inline-flex mt-2 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${referralStatusBadgeClass(detail.status)}`}
          >
            {detail.status}
          </span>
        </div>
      </div>

      <InfoCard
        title="Personal details"
        rows={[
          { label: "Phone", value: detail.referred_phone },
          { label: "Email", value: detail.referred_email || "—" },
          { label: "Age", value: detail.referred_age != null ? String(detail.referred_age) : "—" },
          {
            label: "Health goal",
            value: healthGoalLabel(detail.health_goal, detail.health_goal_other),
          },
        ]}
      />

      <InfoCard
        title="Referral details"
        rows={[
          {
            label: "Referred by",
            value: referredByDetailLine(detail),
          },
          { label: "Referrer ID", value: detail.referred_by_id },
          { label: "Submitted", value: formatReferredDate(detail.created_at) },
          { label: "Last updated", value: formatReferredDate(detail.updated_at) },
          { label: "Referrer notes", value: detail.notes || "—" },
          {
            label: "Converted client",
            value: detail.converted_client?.full_name || detail.converted_client_id || "—",
          },
        ]}
      />

      <section className="rounded-[12px] border border-[#E5E7EB] bg-white dark:border-gray-800 dark:bg-gray-900 p-5 space-y-4">
        <h2 className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#6B7280] dark:text-gray-500">
          Admin
        </h2>
        <div>
          <Label className="text-xs text-[#6B7280]">Status</Label>
          <Select value={statusDraft} onValueChange={setStatusDraft}>
            <SelectTrigger className="mt-1 rounded-lg" data-testid="referral-detail-status">
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
          <Label className="text-xs text-[#6B7280]">Internal admin note</Label>
          <Textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            rows={4}
            className="mt-1 rounded-lg"
            placeholder="Private notes for admin team…"
            data-testid="referral-detail-admin-note"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            className="rounded-lg text-white"
            style={{ backgroundColor: COMPANY_PRIMARY }}
            disabled={saving}
            onClick={() => void saveDetail()}
            data-testid="referral-detail-save"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
          </Button>
          {statusDraft === "converted" && (
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={createClientFromReferral}
              data-testid="referral-detail-create-client"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Create Client Account
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
