import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Users, Loader2, Check } from "lucide-react";
import MobilePageShell from "@/components/layout/MobilePageShell";
import Avatar from "@/components/Avatar";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

/**
 * Full-screen new chat / group flow (replaces NewChatDialog modal).
 *
 * location.state:
 *   backTo - path for back button (default /chat)
 *   panel - "chat" | "admin" - where to return after starting a chat
 */
export default function NewConversationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const backTo = location.state?.backTo ?? "/chat";
  const panel = location.state?.panel ?? "chat";

  const [users, setUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("direct");
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState({});
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .get("/users")
      .then((res) => {
        const list = res.data || [];
        setUsers(list);
        const online = {};
        list.forEach((u) => {
          if (u?.id) online[u.id] = !!u.online;
        });
        setOnlineUsers(online);
      })
      .catch((err) => toast.error(formatApiError(err)))
      .finally(() => setLoading(false));
  }, []);

  const term = q.trim().toLowerCase();
  const filtered = term
    ? users.filter(
        (u) =>
          u.full_name?.toLowerCase().includes(term) ||
          u.username?.toLowerCase().includes(term),
      )
    : users;

  const toggleMember = (u) => {
    setSelectedMembers((prev) => {
      const next = { ...prev };
      if (next[u.id]) delete next[u.id];
      else next[u.id] = u;
      return next;
    });
  };

  const finishWithConversation = (conv) => {
    if (panel === "admin") {
      navigate(
        { pathname: "/admin/mychats", search: `?c=${encodeURIComponent(conv.id)}` },
        { push: true },
      );
      return;
    }
    navigate("/chat", {
      replace: true,
      state: { selectedConversation: conv },
    });
  };

  const startDirect = async (otherUser) => {
    try {
      const res = await api.post("/conversations/start", { other_user_id: otherUser.id });
      const conv = {
        ...res.data.conversation,
        other_user: res.data.other_user,
        participants_info: [user, res.data.other_user].filter(Boolean),
        unread_count: 0,
      };
      finishWithConversation(conv);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const createGroup = async () => {
    const memberIds = Object.keys(selectedMembers);
    if (!groupName.trim()) return toast.error("Give your group a name");
    if (memberIds.length < 1) return toast.error("Add at least one member");
    setCreating(true);
    try {
      const res = await api.post("/conversations/group", {
        name: groupName.trim(),
        member_ids: memberIds,
      });
      finishWithConversation(res.data);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <MobilePageShell
      title="Start a conversation"
      description="Pick a person for a direct chat, or create a group."
      backTo={backTo}
      testId="new-conversation-page"
    >
      <Tabs value={tab} onValueChange={setTab} className="w-full min-w-0">
        <TabsList className="grid w-full grid-cols-2 rounded-full">
          <TabsTrigger value="direct" data-testid="tab-direct" className="rounded-full">
            Direct
          </TabsTrigger>
          <TabsTrigger value="group" data-testid="tab-group" className="rounded-full">
            Group
          </TabsTrigger>
        </TabsList>

        <TabsContent value="direct" className="mt-4 w-full min-w-0">
          <div className="relative mb-3 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people"
              className="w-full pl-9 h-11 rounded-xl bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
              data-testid="new-chat-search-input"
              type="search"
            />
          </div>
          <div className="w-full min-w-0">
            {loading ? (
              <div className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin inline" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                No contacts available.
              </div>
            ) : (
              <ul className="w-full min-w-0 space-y-1">
                {filtered.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => void startDirect(u)}
                      data-testid={`new-chat-user-${u.id}`}
                      className="w-full px-3 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 rounded-xl text-left"
                    >
                      <Avatar
                        name={u.full_name}
                        avatarUrl={u.avatar_url}
                        online={!!onlineUsers[u.id]}
                        status={u.status}
                        size={40}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate dark:text-gray-100">{u.full_name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                          @{u.username} | {u.role}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="group" className="mt-4 space-y-3 w-full min-w-0">
          <Input
            placeholder="Group name (e.g. Project Alpha)"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            data-testid="group-name-input"
            className="w-full h-11 rounded-xl"
          />
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search members to add"
              className="w-full pl-9 h-11 rounded-xl bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
              data-testid="group-search-input"
              type="search"
            />
          </div>
          {Object.keys(selectedMembers).length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2 bg-emerald-50/60 rounded-xl border border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/30 w-full">
              {Object.values(selectedMembers).map((m) => (
                <span
                  key={m.id}
                  className="text-xs bg-white border border-emerald-200 rounded-full px-2 py-1 flex items-center gap-1 dark:bg-gray-900 dark:border-emerald-500/40 dark:text-emerald-100"
                >
                  {m.full_name}
                  <button
                    type="button"
                    onClick={() => toggleMember(m)}
                    className="text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200"
                    data-testid={`remove-member-${m.id}`}
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          )}
          <ul className="w-full min-w-0 space-y-1">
            {filtered.map((u) => {
              const selected = !!selectedMembers[u.id];
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => toggleMember(u)}
                    data-testid={`group-member-${u.id}`}
                    className={`w-full px-3 py-3 flex items-center gap-3 rounded-xl text-left ${
                      selected
                        ? "bg-emerald-50 dark:bg-emerald-500/15"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
                    }`}
                  >
                    <Avatar
                      name={u.full_name}
                      avatarUrl={u.avatar_url}
                      online={!!onlineUsers[u.id]}
                      size={36}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-sm dark:text-gray-100">{u.full_name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                        @{u.username} | {u.role}
                      </div>
                    </div>
                    {selected && <Check className="h-4 w-4 text-emerald-700 dark:text-emerald-300 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <Button
            onClick={() => void createGroup()}
            disabled={creating}
            data-testid="create-group-btn"
            className="w-full h-11 rounded-full bg-emerald-900 hover:bg-emerald-950"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Users className="h-4 w-4 mr-2" /> Create group
              </>
            )}
          </Button>
        </TabsContent>
      </Tabs>
    </MobilePageShell>
  );
}
