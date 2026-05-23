import React, { useCallback, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  Download,
  Eye,
  Loader2,
  Search,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Avatar from "@/components/Avatar";
import { fileUrl, formatApiError } from "@/lib/api";
import {
  downloadClientReportPdf,
  downloadEmployeeReportPdf,
  fetchClientReport,
  fetchEmployeeReport,
  searchReportsUsers,
} from "@/lib/reportsApi";
import { toast } from "sonner";

function fmtDt(iso) {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "d MMM yyyy, h:mm a");
  } catch {
    return iso;
  }
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return format(parseISO(iso.length === 10 ? `${iso}T12:00:00` : iso), "d MMM yyyy");
  } catch {
    return (iso || "").slice(0, 10);
  }
}

function ReportSection({ title, children }) {
  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-5 space-y-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-300">
        {title}
      </h2>
      {children}
    </section>
  );
}

function EmployeeReportView({ report, onBack }) {
  const p = report.personal || {};
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="employee-report-view">
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-display text-lg font-semibold dark:text-gray-100 truncate">
          Employee report — {p.full_name}
        </h1>
      </div>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-3xl mx-auto w-full">
        <p className="text-xs text-gray-500">Generated {fmtDt(report.generated_at)}</p>
        <ReportSection title="Personal info">
          <div className="flex gap-4 items-start">
            <Avatar name={p.full_name} avatarUrl={p.avatar_url} size={64} />
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm flex-1">
              <div><dt className="text-gray-500">Name</dt><dd className="font-medium dark:text-gray-100">{p.full_name}</dd></div>
              <div><dt className="text-gray-500">ID</dt><dd>{p.id}</dd></div>
              <div><dt className="text-gray-500">Phone</dt><dd>{p.phone_number || "—"}</dd></div>
              <div><dt className="text-gray-500">Email</dt><dd>{p.email || "—"}</dd></div>
              <div><dt className="text-gray-500">Status</dt><dd>{p.status}</dd></div>
              <div><dt className="text-gray-500">Join date</dt><dd>{p.join_date}</dd></div>
            </dl>
          </div>
        </ReportSection>
        <ReportSection title="Clients under this employee">
          {(report.clients || []).length === 0 ? (
            <p className="text-sm text-gray-500">No clients assigned.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[520px]">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100 dark:border-gray-800">
                    <th className="py-2 pr-2">Name</th>
                    <th className="py-2 pr-2">ID</th>
                    <th className="py-2 pr-2">Phone</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2 pr-2">Batch</th>
                    <th className="py-2">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {report.clients.map((c) => (
                    <tr key={c.id} className="border-b border-gray-50 dark:border-gray-800/80">
                      <td className="py-2 pr-2 font-medium dark:text-gray-100">{c.full_name}</td>
                      <td className="py-2 pr-2 text-xs">{c.id}</td>
                      <td className="py-2 pr-2">{c.phone_number || "—"}</td>
                      <td className="py-2 pr-2 capitalize">{c.client_status}</td>
                      <td className="py-2 pr-2">{c.batch_name || "—"}</td>
                      <td className="py-2">{c.join_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ReportSection>
      </div>
    </div>
  );
}

function ClientReportView({ report, onBack }) {
  const mp = report.medical?.profile || {};
  const emp = report.assigned_employee;
  const batch = report.batch;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="client-report-view">
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-display text-lg font-semibold dark:text-gray-100 truncate">
          Client report — {report.personal?.full_name}
        </h1>
      </div>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-3xl mx-auto w-full">
        <p className="text-xs text-gray-500">Generated {fmtDt(report.generated_at)}</p>
        <ReportSection title="Medical info">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div><dt className="text-gray-500">Age</dt><dd>{mp.age ?? report.medical?.age ?? "—"}</dd></div>
            <div><dt className="text-gray-500">Weight</dt><dd>{mp.weight_kg ?? report.medical?.weight_kg ?? "—"} kg</dd></div>
            <div><dt className="text-gray-500">Height</dt><dd>{mp.height_cm ?? report.medical?.height_cm ?? "—"} cm</dd></div>
          </dl>
          {mp.medical_conditions && <p className="text-sm mt-2"><span className="text-gray-500">Conditions: </span>{mp.medical_conditions}</p>}
          {mp.allergies && <p className="text-sm"><span className="text-gray-500">Allergies: </span>{mp.allergies}</p>}
          {mp.current_medications && <p className="text-sm"><span className="text-gray-500">Medications: </span>{mp.current_medications}</p>}
          {mp.remarks && <p className="text-sm"><span className="text-gray-500">Notes: </span>{mp.remarks}</p>}
        </ReportSection>
        <ReportSection title="Assigned employee">
          {emp ? (
            <p className="text-sm">{emp.full_name} · {emp.id} · {emp.phone_number || "—"}</p>
          ) : (
            <p className="text-sm text-gray-500">Not assigned</p>
          )}
        </ReportSection>
        <ReportSection title="Batch info">
          {batch ? (
            <dl className="text-sm space-y-1">
              <div><span className="text-gray-500">Name: </span>{batch.name}</div>
              <div><span className="text-gray-500">Status: </span>{batch.status}</div>
              <div><span className="text-gray-500">Start / End: </span>{batch.start_date} — {batch.end_date}</div>
              <div><span className="text-gray-500">Days completed: </span>{batch.days_completed ?? "—"}</div>
              <div><span className="text-gray-500">Days remaining: </span>{batch.days_remaining ?? "—"}</div>
            </dl>
          ) : (
            <p className="text-sm text-gray-500">No batch</p>
          )}
        </ReportSection>
        <ReportSection title="Diet log">
          {(report.diet_days || []).length === 0 ? (
            <p className="text-sm text-gray-500">No diet photos logged.</p>
          ) : (
            <div className="space-y-4">
              {report.diet_days.map((day) => (
                <div key={day.day_number} className="border-t border-gray-100 dark:border-gray-800 pt-3 first:border-0 first:pt-0">
                  <div className="font-medium text-sm dark:text-gray-100">
                    Day {day.day_number} — {fmtDate(day.entry_date)}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                    {(day.photos || []).map((ph) => (
                      <div key={ph.id} className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                        <img src={fileUrl(ph.photo_path)} alt="" className="w-full aspect-square object-cover" />
                        <p className="text-[10px] text-gray-500 p-1">{fmtDt(ph.captured_at || ph.uploaded_at)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ReportSection>
        <ReportSection title="Folder access — Admin media">
          {(report.folders?.admin_folders || []).length === 0 ? (
            <p className="text-sm text-gray-500">None</p>
          ) : (
            <ul className="text-sm space-y-1">
              {report.folders.admin_folders.map((f) => (
                <li key={f.id}>{f.name} — {f.categories_summary}</li>
              ))}
            </ul>
          )}
        </ReportSection>
        <ReportSection title="Folder access — Employee media">
          {(report.folders?.employee_folders || []).length === 0 ? (
            <p className="text-sm text-gray-500">None</p>
          ) : (
            <ul className="text-sm space-y-1">
              {report.folders.employee_folders.map((f) => (
                <li key={f.id}>{f.name} ({f.creator_name}) — {f.categories_summary}</li>
              ))}
            </ul>
          )}
        </ReportSection>
      </div>
    </div>
  );
}

export default function AdminReportsPane() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const runSearch = useCallback(async (q) => {
    const term = (q || "").trim();
    if (term.length < 1) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const data = await searchReportsUsers(term);
      setResults(data || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSearching(false);
    }
  }, []);

  const handleView = async (user) => {
    setSelected(user);
    setLoadingReport(true);
    setReport(null);
    try {
      const data =
        user.role === "employee"
          ? await fetchEmployeeReport(user.id)
          : await fetchClientReport(user.id);
      setReport(data);
    } catch (err) {
      toast.error(formatApiError(err));
      setSelected(null);
    } finally {
      setLoadingReport(false);
    }
  };

  const handleDownload = async (user) => {
    setDownloading(true);
    try {
      const name = (user.full_name || user.id).replace(/\s+/g, "_");
      if (user.role === "employee") {
        await downloadEmployeeReportPdf(user.id, `report_${name}.pdf`);
      } else {
        await downloadClientReportPdf(user.id, `report_${name}.pdf`);
      }
      toast.success("PDF downloaded");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setDownloading(false);
    }
  };

  if (report && selected) {
    return selected.role === "employee" ? (
      <EmployeeReportView report={report} onBack={() => { setReport(null); setSelected(null); }} />
    ) : (
      <ClientReportView report={report} onBack={() => { setReport(null); setSelected(null); }} />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-6 lg:p-10" data-testid="admin-reports-pane">
      <div className="max-w-2xl mx-auto w-full space-y-6 flex-1 flex flex-col min-h-0">
        <div className="text-center space-y-1 shrink-0">
          <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-800 dark:text-emerald-300">Admin</div>
          <h1 className="font-display text-2xl font-semibold dark:text-gray-100">Reports</h1>
          <p className="text-sm text-gray-500">Search employees or clients by ID, name, or phone.</p>
        </div>
        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              runSearch(e.target.value);
            }}
            placeholder="Search ID, name, or phone..."
            className="pl-10 h-12 rounded-2xl"
            data-testid="reports-search-input"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
          )}
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {results.length === 0 && query.trim() && !searching && (
            <p className="text-center text-sm text-gray-500 py-8">No users found.</p>
          )}
          {results.map((u) => (
            <div
              key={u.id}
              className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              data-testid={`reports-result-${u.id}`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <User className="h-5 w-5 text-emerald-800 shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium truncate dark:text-gray-100">{u.full_name}</div>
                  <div className="text-xs text-gray-500 truncate">{u.id} · {u.phone_number || "—"}</div>
                </div>
                <span
                  className={`shrink-0 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                    u.role === "employee"
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200"
                      : "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200"
                  }`}
                >
                  {u.role === "employee" ? "Employee" : "Client"}
                </span>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full flex-1 sm:flex-none"
                  onClick={() => handleView(u)}
                  disabled={loadingReport}
                  data-testid={`reports-view-${u.id}`}
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  View report
                </Button>
                <Button
                  size="sm"
                  className="rounded-full bg-emerald-900 hover:bg-emerald-950 flex-1 sm:flex-none"
                  onClick={() => handleDownload(u)}
                  disabled={downloading}
                  data-testid={`reports-download-${u.id}`}
                >
                  {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
                  Download
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {loadingReport && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-900 rounded-2xl px-6 py-4 flex items-center gap-2 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading report...</span>
          </div>
        </div>
      )}
    </div>
  );
}
