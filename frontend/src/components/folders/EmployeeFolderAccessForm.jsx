import React, { useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EMPLOYEE_FOLDER_ACCESS_PRESETS,
  buildEmployeeAccessRulesFromSelection,
} from "@/lib/folderAccess";
import { fetchEmployeeFolderPickerClients } from "@/lib/foldersApi";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function EmployeeFolderAccessForm({ value, onChange }) {
  const [presets, setPresets] = useState(value?.presets || []);
  const [specificIds, setSpecificIds] = useState(value?.specificClientIds || []);
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchEmployeeFolderPickerClients()
      .then((data) => {
        if (!cancelled) setClients(data || []);
      })
      .catch((err) => toast.error(formatApiError(err)))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const selectedClients = clients.filter((c) => specificIds.includes(c.id));
    onChange?.({
      presets,
      specificClientIds: specificIds,
      rules: buildEmployeeAccessRulesFromSelection({ presets, specificClients: selectedClients }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presets, specificIds, clients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        (c.full_name || "").toLowerCase().includes(q) ||
        (c.username || "").toLowerCase().includes(q),
    );
  }, [clients, search]);

  const togglePreset = (id) => {
    setPresets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleClient = (id) => {
    setSpecificIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-4" data-testid="employee-folder-access-form">
      <div>
        <Label className="text-xs text-gray-500">Which clients can view this folder</Label>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {EMPLOYEE_FOLDER_ACCESS_PRESETS.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm cursor-pointer"
            >
              <Checkbox checked={presets.includes(p.id)} onCheckedChange={() => togglePreset(p.id)} />
              <span className="dark:text-gray-200">{p.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-xs text-gray-500">Specific clients (assigned to you)</Label>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name..."
          className="mt-2 rounded-xl"
          data-testid="employee-folder-client-search"
        />
        <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
          {loading && <div className="p-3 text-xs text-gray-500">Loading clients...</div>}
          {!loading && filtered.length === 0 && (
            <div className="p-3 text-xs text-gray-500">No clients match.</div>
          )}
          {filtered.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60"
            >
              <Checkbox checked={specificIds.includes(c.id)} onCheckedChange={() => toggleClient(c.id)} />
              <span className="flex-1 truncate dark:text-gray-200">{c.full_name}</span>
              <span className="text-[10px] text-gray-500 capitalize">{c.client_status || "active"}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
