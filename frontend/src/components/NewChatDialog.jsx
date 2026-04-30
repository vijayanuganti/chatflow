import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Users, Loader2, Check } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import Avatar from "./Avatar";

export default function NewChatDialog({ open, onOpenChange, onSelectUser, onCreateGroup, onlineUsers }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("direct");
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState({}); // id -> user
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setQ("");
    setSelectedMembers({});
    setGroupName("");
    setTab("direct");
    api.get("/users")
      .then((res) => setUsers(res.data))
      .catch((err) => toast.error(formatApiError(err)))
      .finally(() => setLoading(false));
  }, [open]);

  const term = q.trim().toLowerCase();
  const filtered = term
    ? users.filter((u) => u.full_name.toLowerCase().includes(term) || u.username.includes(term))
    : users;

  const toggleMember = (u) => {
    setSelectedMembers((prev) => {
      const next = { ...prev };
      if (next[u.id]) delete next[u.id];
      else next[u.id] = u;
      return next;
    });
  };

  const createGroup = async () => {
    const memberIds = Object.keys(selectedMembers);
    if (!groupName.trim()) return toast.error("Give your group a name");
    if (memberIds.length < 1) return toast.error("Add at least one member");
    setCreating(true);
    try {
      await onCreateGroup({ name: groupName.trim(), member_ids: memberIds });
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md max-h-[88dvh] overflow-y-auto p-4 sm:p-6" data-testid="new-chat-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">Start a conversation</DialogTitle>
          <DialogDescription>Pick a person for a direct chat, or create a group.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 rounded-full">
            <TabsTrigger value="direct" data-testid="tab-direct" className="rounded-full">Direct</TabsTrigger>
            <TabsTrigger value="group" data-testid="tab-group" className="rounded-full">Group</TabsTrigger>
          </TabsList>

          <TabsContent value="direct" className="mt-4">
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="pl-9 h-10 rounded-xl bg-gray-50" data-testid="new-chat-search-input" />
            </div>
            <div className="max-h-72 overflow-y-auto -mx-2">
              {loading ? (
                <div className="py-8 text-center text-sm text-gray-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
              ) : filtered.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">No contacts available.</div>
              ) : (
                filtered.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => onSelectUser(u)}
                    data-testid={`new-chat-user-${u.id}`}
                    className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50 rounded-xl text-left"
                  >
                    <Avatar name={u.full_name} avatarUrl={u.avatar_url} online={!!onlineUsers[u.id]} status={u.status} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{u.full_name}</div>
                      <div className="text-xs text-gray-500 capitalize">@{u.username} · {u.role}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="group" className="mt-4 space-y-3">
            <div>
              <Input
                placeholder="Group name (e.g. Project Alpha)"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                data-testid="group-name-input"
                className="h-11 rounded-xl"
              />
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members to add" className="pl-9 h-10 rounded-xl bg-gray-50" data-testid="group-search-input" />
            </div>
            {Object.keys(selectedMembers).length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 bg-emerald-50/60 rounded-xl border border-emerald-100">
                {Object.values(selectedMembers).map((m) => (
                  <span key={m.id} className="text-xs bg-white border border-emerald-200 rounded-full px-2 py-1 flex items-center gap-1">
                    {m.full_name}
                    <button onClick={() => toggleMember(m)} className="text-gray-400 hover:text-gray-700" data-testid={`remove-member-${m.id}`}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="max-h-56 overflow-y-auto -mx-2">
              {filtered.map((u) => {
                const selected = !!selectedMembers[u.id];
                return (
                  <button
                    key={u.id}
                    onClick={() => toggleMember(u)}
                    data-testid={`group-member-${u.id}`}
                    className={`w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-50 rounded-xl text-left ${selected ? "bg-emerald-50" : ""}`}
                  >
                    <Avatar name={u.full_name} avatarUrl={u.avatar_url} online={!!onlineUsers[u.id]} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-sm">{u.full_name}</div>
                      <div className="text-xs text-gray-500 capitalize">@{u.username} · {u.role}</div>
                    </div>
                    {selected && <Check className="h-4 w-4 text-emerald-700" />}
                  </button>
                );
              })}
            </div>
            <Button onClick={createGroup} disabled={creating} data-testid="create-group-btn" className="w-full h-11 rounded-full bg-emerald-900 hover:bg-emerald-950">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Users className="h-4 w-4 mr-2" /> Create group</>}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
