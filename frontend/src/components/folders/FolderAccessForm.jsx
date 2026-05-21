import React, { useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FOLDER_ACCESS_PRESETS, buildAccessRulesFromSelection } from "@/lib/folderAccess";
import { fetchFolderPickerUsers } from "@/lib/foldersApi";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export function accessRulesToSelection(access = []) {
  const presets = [];
  const specificUsers = [];
  for (const r of access) {
    if (r.access_type === "specific_user" && r.user_id) {
      specificUsers.push({ id: r.user_id, role: r.user_type });
    } else if (FOLDER_ACCESS_PRESETS.some((p) => p.id === r.access_type)) {
      presets.push(r.access_type);
    }
  }
  return { presets, specificUserIds: specificUsers.map((u) => u.id) };
}

export default function FolderAccessForm({ value, onChange }) {
  const [presets, setPresets] = useState(value?.presets || []);
  const [specificIds, setSpecificIds] = useState(value?.specificUserIds || []);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingUsers(true);
    fetchFolderPickerUsers()
      .then((data) => {
        if (!cancelled) setUsers(data || []);
      })
      .catch((err) => toast.error(formatApiError(err)))
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const selectedUsers = users.filter((u) => specificIds.includes(u.id));
    onChange?.({
      presets,
      specificUserIds: specificIds,
      rules: buildAccessRulesFromSelection({ presets, specificUsers: selectedUsers }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onChange is stable enough; avoid reset loops
  }, [presets, specificIds, users]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.full_name || "").toLowerCase().includes(q) ||
        (u.username || "").toLowerCase().includes(q),
    );
  }, [users, search]);

  const togglePreset = (id) => {
    setPresets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleUser = (id) => {
    setSpecificIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-4" data-testid="folder-access-form">
      <div>
        <Label className="text-xs text-gray-500">Who can view this folder</Label>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FOLDER_ACCESS_PRESETS.map((p) => (
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
        <Label className="text-xs text-gray-500">Specific employees or clients</Label>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name..."
          className="mt-2 rounded-xl"
          data-testid="folder-access-user-search"
        />
        <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
          {loadingUsers && (
            <div className="p-3 text-xs text-gray-500">Loading users...</div>
          )}
          {!loadingUsers && filteredUsers.length === 0 && (
            <div className="p-3 text-xs text-gray-500">No users match.</div>
          )}
          {filteredUsers.map((u) => (
            <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60">
              <Checkbox checked={specificIds.includes(u.id)} onCheckedChange={() => toggleUser(u.id)} />
              <span className="flex-1 truncate dark:text-gray-200">{u.full_name}</span>
              <span className="text-[10px] text-gray-500 capitalize">{u.role}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
