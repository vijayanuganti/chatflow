import React, { useEffect, useMemo, useState } from "react";
import { Loader2, UserPlus, Phone, User as UserIcon, Briefcase, Users as UsersIcon, Stethoscope, ChevronDown, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import PasswordInput from "@/components/PasswordInput";
import MedicalProfileFields, {
  MEDICAL_PROFILE_DEFAULTS,
  formToMedicalProfile,
} from "@/components/MedicalProfileFields";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

/**
 * Admin / permitted employee account creation dialog.
 *
 * Usage:
 *   <CreateAccountDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     allowedRoles={["employee", "client"]}        // admin
 *     allowedRoles={["client"]}                    // permitted employee
 *     defaultRole="client"
 *     onCreated={(user) => ...}
 *   />
 */
export default function CreateAccountDialog({
  open,
  onOpenChange,
  allowedRoles = ["employee", "client"],
  defaultRole = "client",
  onCreated,
}) {
  const { user: me } = useAuth();
  const initialRole = allowedRoles.includes(defaultRole) ? defaultRole : allowedRoles[0];

  const [form, setForm] = useState({
    role: initialRole,
    phone_number: "",
    full_name: "",
    username: "",
    password: "",
    employee_id: "",
    batch_id: "",
  });
  const [employees, setEmployees] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [medOpen, setMedOpen] = useState(false);
  const [medForm, setMedForm] = useState({ ...MEDICAL_PROFILE_DEFAULTS });

  const update = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const updateMed = (k, v) => setMedForm((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setForm({
      role: initialRole,
      phone_number: "",
      full_name: "",
      username: "",
      password: "",
      employee_id: me?.role === "employee" ? me.id : "",
      batch_id: "",
    });
    setBatches([]);
    setEmployees([]);
    setMedOpen(false);
    setMedForm({ ...MEDICAL_PROFILE_DEFAULTS });
  }, [open, initialRole, me?.role, me?.id]);

  const loadAdminEmployees = async () => {
    setLoadingMeta(true);
    try {
      const res = await api.get("/admin/employees");
      setEmployees(res.data || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoadingMeta(false);
    }
  };

  const loadBatchesForEmployee = async (employeeId) => {
    if (!employeeId) {
      setBatches([]);
      return;
    }
    setLoadingMeta(true);
    try {
      if (me?.role === "admin") {
        const res = await api.get("/admin/batches");
        setBatches((res.data || []).filter((b) => b.employee_id === employeeId));
      } else {
        // employee with permission can only assign to their own batches
        const res = await api.get("/batches/me");
        setBatches(res.data || []);
      }
    } catch (err) {
      toast.error(formatApiError(err));
      setBatches([]);
    } finally {
      setLoadingMeta(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (form.role !== "client") return;
    if (me?.role === "admin") {
      loadAdminEmployees();
    } else if (me?.role === "employee") {
      loadBatchesForEmployee(me.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.role, me?.role, me?.id]);

  useEffect(() => {
    if (!open) return;
    if (form.role !== "client") return;
    if (me?.role !== "admin") return;
    loadBatchesForEmployee(form.employee_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.employee_id, open]);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!form.full_name.trim()) return toast.error("Full name is required");
    if (!form.phone_number.trim()) return toast.error("Phone number is required");
    if (!form.password || form.password.length < 6) {
      return toast.error("Password must be at least 6 characters");
    }
    if (form.role === "client") {
      if (me?.role === "admin" && !form.employee_id) {
        return toast.error("Pick an employee for this client");
      }
      if (!form.batch_id) return toast.error("Pick a batch for this client");
    }

    const payload = {
      phone_number: form.phone_number.trim(),
      password: form.password,
      full_name: form.full_name.trim(),
      role: form.role,
    };
    const username = form.username.trim();
    if (username) payload.username = username;
    if (form.role === "client") {
      payload.employee_id = me?.role === "employee" ? me.id : form.employee_id;
      payload.batch_id = form.batch_id;
      // Medical profile is optional at creation; admin can fill / refine later.
      const hasAnyMedical = Object.values(medForm).some(
        (v) => v !== "" && v !== null && v !== undefined,
      );
      if (hasAnyMedical) {
        payload.medical_profile = formToMedicalProfile(medForm);
      }
    }

    setSubmitting(true);
    try {
      const res = await api.post("/accounts", payload);
      toast.success(`Account created for ${res.data.user.full_name}`);
      onCreated?.(res.data.user);
      onOpenChange?.(false);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const employeeMap = useMemo(() => {
    const m = {};
    (employees || []).forEach((e) => {
      m[e.id] = e;
    });
    return m;
  }, [employees]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1rem)] sm:max-w-lg max-h-[90dvh] overflow-y-auto p-4 sm:p-6"
        data-testid="create-account-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-emerald-800" />
            Create account
          </DialogTitle>
          <DialogDescription>
            Add a new {allowedRoles.length === 1 ? allowedRoles[0] : "team member or client"} to ChatFlow.
            They'll receive their phone number and password from you.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4" data-testid="create-account-form">
          {allowedRoles.length > 1 && (
            <div className="grid grid-cols-2 gap-2">
              {allowedRoles.includes("employee") && (
                <RolePill
                  active={form.role === "employee"}
                  onClick={() => update("role", "employee")}
                  icon={Briefcase}
                  label="Employee"
                  desc="Internal staff"
                  testId="create-account-role-employee"
                />
              )}
              {allowedRoles.includes("client") && (
                <RolePill
                  active={form.role === "client"}
                  onClick={() => update("role", "client")}
                  icon={UsersIcon}
                  label="Client"
                  desc="External user"
                  testId="create-account-role-client"
                />
              )}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ca-fullname">Full name</Label>
              <Input
                id="ca-fullname"
                data-testid="create-account-fullname"
                className="h-11 rounded-xl"
                value={form.full_name}
                onChange={(e) => update("full_name", e.target.value)}
                placeholder="Jane Doe"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ca-username">Username (optional)</Label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="ca-username"
                  data-testid="create-account-username"
                  className="pl-10 h-11 rounded-xl"
                  value={form.username}
                  onChange={(e) => update("username", e.target.value)}
                  placeholder="auto-generated"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ca-phone">Phone number</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="ca-phone"
                data-testid="create-account-phone"
                className="pl-10 h-11 rounded-xl"
                value={form.phone_number}
                onChange={(e) => update("phone_number", e.target.value)}
                placeholder="+91 98765 43210"
                inputMode="tel"
                required
              />
            </div>
            <p className="text-[11px] text-gray-400">
              Include the country code. Phone numbers must be unique across the platform.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ca-password">Temporary password</Label>
            <PasswordInput
              id="ca-password"
              data-testid="create-account-password"
              className="h-11 rounded-xl"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder="At least 6 characters"
              required
            />
            <p className="text-[11px] text-gray-400">
              Share this with the user securely. They can change it after signing in.
            </p>
          </div>

          {form.role === "client" && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3 sm:p-4 space-y-3">
              <div className="text-sm font-medium text-emerald-950">Client allocation</div>
              <div className="grid md:grid-cols-2 gap-3">
                {me?.role === "admin" ? (
                  <div className="space-y-1.5">
                    <Label>Employee</Label>
                    <Select
                      value={form.employee_id || undefined}
                      onValueChange={(v) => {
                        update("employee_id", v);
                        update("batch_id", "");
                      }}
                      disabled={loadingMeta}
                    >
                      <SelectTrigger className="h-11 rounded-xl bg-white" data-testid="create-account-employee-select">
                        <SelectValue placeholder={loadingMeta ? "Loading…" : "Select employee"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(employees || []).map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.full_name} (@{e.username})
                          </SelectItem>
                        ))}
                        {(!employees || employees.length === 0) && (
                          <SelectItem value="__none" disabled>
                            No employees found
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>Assigned to</Label>
                    <div className="h-11 rounded-xl border border-gray-200 bg-white px-3 flex items-center text-sm text-gray-700">
                      You ({me?.full_name})
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Batch</Label>
                  <Select
                    value={form.batch_id || undefined}
                    onValueChange={(v) => update("batch_id", v)}
                    disabled={loadingMeta || (me?.role === "admin" && !form.employee_id)}
                  >
                    <SelectTrigger className="h-11 rounded-xl bg-white" data-testid="create-account-batch-select">
                      <SelectValue
                        placeholder={
                          me?.role === "admin" && !form.employee_id
                            ? "Select employee first"
                            : loadingMeta
                            ? "Loading…"
                            : "Select batch"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(batches || []).map((b) => (
                        <SelectItem key={b.id} value={b.id} disabled={!!b.is_full}>
                          {(employeeMap[b.employee_id]?.full_name || me?.full_name || "Employee")} — {b.name} (
                          {b.client_count || 0}/{b.max_clients || 20})
                          {b.is_full ? " · Full" : ""}
                        </SelectItem>
                      ))}
                      {(!batches || batches.length === 0) && (
                        <SelectItem value="__none" disabled>
                          No batches found
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-[11px] text-emerald-900/70">
                A direct chat between the client and the assigned employee is created automatically.
              </p>
            </div>
          )}

          {form.role === "client" && (
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden" data-testid="create-account-medical-section">
              <button
                type="button"
                onClick={() => setMedOpen((v) => !v)}
                className="w-full flex items-center gap-2 p-3 sm:p-4 text-left hover:bg-gray-50"
                data-testid="create-account-medical-toggle"
                aria-expanded={medOpen}
              >
                <span className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-900 flex items-center justify-center">
                  <Stethoscope className="h-4 w-4" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium">Medical profile (optional)</span>
                  <span className="block text-[11px] text-gray-500">
                    Add medical details now or let an admin fill them in later from the dashboard.
                  </span>
                </span>
                {medOpen ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
              </button>
              {medOpen && (
                <div className="border-t border-gray-100 p-3 sm:p-4">
                  <MedicalProfileFields value={medForm} onChange={updateMed} disabled={submitting} />
                </div>
              )}
            </div>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full h-11 rounded-full bg-emerald-900 hover:bg-emerald-950 text-white"
            data-testid="create-account-submit"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RolePill({ active, onClick, icon: Icon, label, desc, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`p-3 rounded-2xl border-2 text-left transition-colors ${
        active ? "border-emerald-900 bg-emerald-50" : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <div
        className={`h-9 w-9 rounded-xl flex items-center justify-center mb-2 ${
          active ? "bg-emerald-900 text-white" : "bg-gray-100 text-gray-600"
        }`}
      >
        <Icon className="h-4 w-4" strokeWidth={1.5} />
      </div>
      <div className="font-display font-semibold text-sm">{label}</div>
      <div className="text-[11px] text-gray-500">{desc}</div>
    </button>
  );
}
