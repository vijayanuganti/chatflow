import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ChatSidebar from "@/components/ChatSidebar";
import ChatWindow from "@/components/ChatWindow";
import NewChatDialog from "@/components/NewChatDialog";
import ProfileDialog from "@/components/ProfileDialog";
import TopBar from "@/components/TopBar";
import useChatSocket from "@/hooks/useChatSocket";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import {
  Users, MessageSquare, Briefcase, UserCircle2, LayoutDashboard,
  MessageCircle, Eye, Activity, Plus, Layers,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import Avatar from "@/components/Avatar";

const ADMIN_TAB_IDS = new Set(["overview", "batches", "chats", "mychats", "activity", "users"]);

function pathForAdminTab(t) {
  return t === "overview" ? "/admin" : `/admin/${t}`;
}

function StatCard({ icon: Icon, label, value, testId, accent }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow" data-testid={testId}>
      <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${accent || "bg-emerald-50 text-emerald-900"}`}>
        <Icon className="h-6 w-6" strokeWidth={1.5} />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">{label}</div>
        <div className="font-display text-2xl font-semibold">{value}</div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { section } = useParams();
  const tab = useMemo(() => {
    if (!section) return "overview";
    return ADMIN_TAB_IDS.has(section) ? section : "overview";
  }, [section]);

  useEffect(() => {
    if (section && !ADMIN_TAB_IDS.has(section)) {
      navigate("/admin", { replace: true });
    }
  }, [section, navigate]);

  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employeeBatches, setEmployeeBatches] = useState([]);
  const [mobileBatchesStep, setMobileBatchesStep] = useState("employees"); // employees | batches | chat
  const [mobileChatStep, setMobileChatStep] = useState("list"); // list | chat
  const [mobileActivityStep, setMobileActivityStep] = useState("list"); // list | detail
  const [allConvs, setAllConvs] = useState([]); // admin monitoring
  const [myConvs, setMyConvs] = useState([]);   // admin's own chats
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [lastSeenByUser, setLastSeenByUser] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const selectedIdRef = useRef(null);
  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null;
  }, [selected?.id]);
  const [activityTarget, setActivityTarget] = useState(null);
  const [activityData, setActivityData] = useState(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const goToTab = useCallback((t, opts = {}) => {
    const {
      selectedConv,
      mobileBatchesStep,
      mobileChatStep,
      replace,
      resetActivityList,
    } = opts;
    if (resetActivityList) {
      setActivityTarget(null);
      setActivityData(null);
      setMobileActivityStep("list");
    }
    if (mobileBatchesStep != null) setMobileBatchesStep(mobileBatchesStep);
    if (mobileChatStep != null) setMobileChatStep(mobileChatStep);
    if (selectedConv !== undefined) setSelected(selectedConv);
    else if (t !== "chats" && t !== "mychats") setSelected(null);
    navigate(pathForAdminTab(t), { replace: Boolean(replace) });
  }, [navigate]);

  const loadOverview = useCallback(async () => {
    try {
      const [s, u, c, my] = await Promise.all([
        api.get("/admin/stats"),
        api.get("/admin/users"),
        api.get("/admin/conversations"),
        api.get("/conversations"),
      ]);
      setStats(s.data);
      setUsers(u.data);
      setAllConvs(c.data);
      setMyConvs(my.data);
      const online = {};
      const lastSeen = {};
      u.data.forEach((x) => {
        online[x.id] = !!x.online;
        if (x.last_seen) lastSeen[x.id] = x.last_seen;
      });
      setOnlineUsers(online);
      setLastSeenByUser(lastSeen);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, []);

  const loadEmployees = useCallback(async () => {
    try {
      const res = await api.get("/admin/employees");
      setEmployees(res.data || []);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, []);

  const loadEmployeeBatches = useCallback(async (employeeId) => {
    if (!employeeId) {
      setEmployeeBatches([]);
      return;
    }
    try {
      const res = await api.get(`/admin/employees/${employeeId}/batches`);
      setEmployeeBatches(res.data?.batches || []);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { loadEmployees(); }, [loadEmployees]);
  useEffect(() => {
    if (tab !== "batches") setMobileBatchesStep("employees");
    if (tab !== "chats" && tab !== "mychats") {
      setMobileChatStep("list");
      setSelected(null);
    }
    if (tab !== "activity") setMobileActivityStep("list");
  }, [tab]);

  const loadMessages = useCallback(async (convId) => {
    try {
      const res = await api.get(`/conversations/${convId}/messages`);
      setMessages(res.data);
      // If admin is a participant, mark as read
      const isMyChat = myConvs.find((c) => c.id === convId);
      if (isMyChat) api.post(`/conversations/${convId}/read`).catch(() => {});
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, [myConvs]);

  useEffect(() => {
    if (selected) loadMessages(selected.id);
    else setMessages([]);
  }, [selected, loadMessages]);

  useEffect(() => {
    if (!selected?.id) return;
    setMyConvs((prev) => prev.map((c) => (
      c.id === selected.id ? { ...c, unread_count: 0 } : c
    )));
  }, [selected?.id]);

  const loadActivity = async (u) => {
    setActivityTarget(u);
    try {
      const res = await api.get(`/admin/users/${u.id}/activity`);
      setActivityData(res.data);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const handleIncoming = useCallback((msg) => {
    const activeId = selectedIdRef.current;
    setMessages((prev) => {
      if (activeId && msg.conversation_id === activeId && !prev.some((m) => m.id === msg.id)) {
        return [...prev, msg];
      }
      return prev;
    });
    const updater = (prev) => {
      const preview = msg.content || `[${msg.message_type}]`;
      const previewText = msg.conversation_type === "group" ? `${msg.sender_name}: ${preview}` : preview;
      const exists = prev.find((c) => c.id === msg.conversation_id);
      if (!exists) { loadOverview(); return prev; }
      const shouldIncrementUnread = (
        (!activeId || msg.conversation_id !== activeId) &&
        Array.isArray(msg.recipient_ids) &&
        msg.recipient_ids.includes(user.id)
      );
      const updated = prev.map((c) => c.id === msg.conversation_id
        ? {
          ...c,
          last_message: previewText,
          last_message_at: msg.created_at,
          unread_count: shouldIncrementUnread ? (Number(c.unread_count || 0) + 1) : Number(c.unread_count || 0),
        } : c
      );
      updated.sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || ""));
      return updated;
    };
    setAllConvs(updater);
    setMyConvs(updater);
  }, [loadOverview, user.id]);

  const handlePresence = useCallback((data) => {
    setOnlineUsers((prev) => ({ ...prev, [data.user_id]: data.online }));
    if (data.last_seen) {
      setLastSeenByUser((prev) => ({ ...prev, [data.user_id]: data.last_seen }));
    }
  }, []);

  const handleTypingEvent = useCallback((data) => {
    setTypingUsers((prev) => {
      const convMap = { ...(prev[data.conversation_id] || {}) };
      if (data.is_typing) convMap[data.sender_id] = data.sender_name || "Someone";
      else delete convMap[data.sender_id];
      return { ...prev, [data.conversation_id]: convMap };
    });
  }, []);

  const handleReadReceipt = useCallback((data) => {
    const activeId = selectedIdRef.current;
    if (activeId && data.conversation_id === activeId) {
      setMessages((prev) => prev.map((m) => {
        if (m.sender_id === user.id && !(m.read_by || []).includes(data.reader_id)) {
          return { ...m, read_by: [...(m.read_by || []), data.reader_id] };
        }
        return m;
      }));
    }
  }, [user.id]);

  const { sendTyping } = useChatSocket({
    onMessage: handleIncoming,
    onTyping: handleTypingEvent,
    onPresence: handlePresence,
    onReadReceipt: handleReadReceipt,
    enabled: Boolean(user?.id),
  });

  const handleSendMessage = async (body) => {
    const res = await api.post("/messages", body);
    setMessages((prev) => prev.some((m) => m.id === res.data.id) ? prev : [...prev, res.data]);
    setMyConvs((prev) => {
      const preview = res.data.content || `[${res.data.message_type}]`;
      const previewText = res.data.conversation_type === "group" ? `${res.data.sender_name}: ${preview}` : preview;
      let found = false;
      const updated = prev.map((c) => {
        if (c.id === res.data.conversation_id) { found = true; return { ...c, last_message: previewText, last_message_at: res.data.created_at }; }
        return c;
      });
      if (!found) { loadOverview(); return prev; }
      updated.sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || ""));
      return updated;
    });
  };

  const handleStartDirect = async (otherUser) => {
    setNewChatOpen(false);
    try {
      const res = await api.post("/conversations/start", { other_user_id: otherUser.id });
      const conv = { ...res.data.conversation, other_user: res.data.other_user, participants_info: [user, res.data.other_user] };
      conv.unread_count = 0;
      setMyConvs((prev) => prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev]);
      goToTab("mychats", { selectedConv: conv, mobileChatStep: "chat" });
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const handleCreateGroup = async ({ name, member_ids }) => {
    try {
      const res = await api.post("/conversations/group", { name, member_ids });
      await loadOverview();
      goToTab("mychats", { selectedConv: res.data, mobileChatStep: "chat" });
      setNewChatOpen(false);
    } catch (err) {
      toast.error(formatApiError(err));
      throw err;
    }
  };

  const isSelectedAdminChat = selected && myConvs.find((c) => c.id === selected.id);
  const currentConvs = tab === "mychats" ? myConvs : allConvs;

  const topbarTitle = (() => {
    if (tab === "overview") return "Admin · Overview";
    if (tab === "batches") return "Admin · Batches";
    if (tab === "chats") return "Admin · Monitor";
    if (tab === "mychats") return "Admin · My Chats";
    if (tab === "users") return "Admin · Users";
    if (tab === "activity") return "Admin · Activity";
    return "Admin";
  })();

  const unreadTotal = myConvs.reduce((sum, c) => sum + Number(c.unread_count || 0), 0);

  useEffect(() => {
    const base = topbarTitle || "Admin";
    document.title = unreadTotal > 0 ? `(${unreadTotal}) ${base}` : base;
  }, [topbarTitle, unreadTotal]);

  const topbarOnBack = (() => {
    if (tab === "batches") {
      if (mobileBatchesStep === "batches") return () => setMobileBatchesStep("employees");
      if (mobileBatchesStep === "chat") return () => setMobileBatchesStep("batches");
      return undefined;
    }
    if ((tab === "chats" || tab === "mychats") && mobileChatStep === "chat") {
      return () => { setSelected(null); setMobileChatStep("list"); };
    }
    if (tab === "activity" && mobileActivityStep === "detail") {
      return () => { setActivityTarget(null); setActivityData(null); setMobileActivityStep("list"); };
    }
    return undefined;
  })();

  return (
    <div className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-gray-50" data-testid="admin-dashboard">
      <div className="shrink-0">
        <TopBar
          onOpenSettings={() => setProfileOpen(true)}
          title={topbarTitle}
          onBack={topbarOnBack}
          unreadTotal={unreadTotal}
        />
      </div>

      <div className="shrink-0 overflow-x-auto border-b border-gray-200 bg-white px-2 py-2 md:hidden" data-testid="admin-mobile-tabs">
        <div className="flex gap-2 min-w-max">
          <MobileTabButton label="Overview" active={tab === "overview"} onClick={() => goToTab("overview")} />
          <MobileTabButton label="Batches" active={tab === "batches"} onClick={() => goToTab("batches", { mobileBatchesStep: "employees" })} />
          <MobileTabButton label="Monitor" active={tab === "chats"} onClick={() => goToTab("chats", { mobileChatStep: "list" })} />
          <MobileTabButton label="My Chats" active={tab === "mychats"} onClick={() => goToTab("mychats", { mobileChatStep: "list" })} />
          <MobileTabButton label="Activity" active={tab === "activity"} onClick={() => goToTab("activity", { resetActivityList: true })} />
          <MobileTabButton label="Users" active={tab === "users"} onClick={() => goToTab("users")} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden pb-14 md:pb-0">
        {/* Admin Nav */}
        <nav className="hidden md:flex w-20 lg:w-60 bg-emerald-950 text-emerald-100 flex-col py-6 px-3">
          <div className="flex items-center gap-3 px-2 mb-8">
            <div className="h-10 w-10 rounded-xl bg-emerald-700/40 flex items-center justify-center">
              <MessageCircle className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <span className="font-display text-lg font-semibold hidden lg:inline">Admin</span>
          </div>
        <NavButton icon={LayoutDashboard} label="Overview" active={tab === "overview"} onClick={() => goToTab("overview")} testId="admin-nav-overview" />
        <NavButton icon={Layers} label="Batches" active={tab === "batches"} onClick={() => goToTab("batches")} testId="admin-nav-batches" />
        <NavButton icon={Eye} label="Monitor Chats" active={tab === "chats"} onClick={() => goToTab("chats")} testId="admin-nav-chats" />
        <NavButton icon={MessageSquare} label="My Chats" active={tab === "mychats"} onClick={() => goToTab("mychats")} testId="admin-nav-mychats" />
        <NavButton icon={Activity} label="Activity" active={tab === "activity"} onClick={() => goToTab("activity")} testId="admin-nav-activity" />
        <NavButton icon={Users} label="Users" active={tab === "users"} onClick={() => goToTab("users")} testId="admin-nav-users" />
        <div className="mt-auto px-2 py-2 text-[10px] text-emerald-200/70 hidden lg:block">
          Logged in as <span className="font-medium text-emerald-100">{user?.full_name}</span>
        </div>
        </nav>

        {/* Content */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {tab === "overview" && (
          <div className="p-4 sm:p-6 lg:p-10 space-y-6 overflow-y-auto" data-testid="admin-overview-pane">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-800">Admin panel</div>
              <h1 className="font-display text-2xl sm:text-4xl font-semibold mt-1">Hi, {user?.full_name?.split(" ")[0] || "Admin"}.</h1>
              <p className="text-gray-500 mt-1">Monitor conversations and chat with anyone on the platform.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={Users} label="Total users" value={stats?.total_users ?? "—"} testId="stat-total-users" />
              <StatCard icon={Briefcase} label="Employees" value={stats?.employees ?? "—"} testId="stat-employees" accent="bg-amber-50 text-amber-900" />
              <StatCard icon={UserCircle2} label="Clients" value={stats?.clients ?? "—"} testId="stat-clients" accent="bg-sky-50 text-sky-900" />
              <StatCard icon={MessageSquare} label="Conversations" value={stats?.conversations ?? "—"} testId="stat-conversations" accent="bg-violet-50 text-violet-900" />
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 min-w-0">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-lg sm:text-xl font-semibold">Latest activity</h2>
                  <Button variant="ghost" className="text-xs sm:text-sm px-2 sm:px-3" onClick={() => goToTab("chats")} data-testid="overview-view-all-chats">View all →</Button>
                </div>
                <div className="divide-y divide-gray-100">
                  {allConvs.slice(0, 6).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => goToTab("chats", { selectedConv: c, mobileChatStep: "chat" })}
                      data-testid={`overview-conv-${c.id}`}
                      className="w-full py-3 flex items-center gap-3 hover:bg-gray-50 rounded-xl px-2 text-left"
                    >
                      <div className="flex -space-x-2 shrink-0">
                        {(c.participants_info || []).slice(0, 2).map((p) => (
                          <Avatar key={p.id} name={p.full_name} avatarUrl={p.avatar_url} online={onlineUsers[p.id]} size={32} />
                        ))}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {c.type === "group" ? c.name : (c.participants_info || []).map((p) => p.full_name).join(" ↔ ")}
                        </div>
                        <div className="text-xs text-gray-500 truncate">{c.last_message || "No messages"}</div>
                      </div>
                      {c.type === "group" && <span className="hidden sm:inline text-[10px] bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full">Group</span>}
                    </button>
                  ))}
                  {allConvs.length === 0 && <div className="py-8 text-center text-sm text-gray-400">No activity yet.</div>}
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 min-w-0">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-lg sm:text-xl font-semibold">Quick actions</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button onClick={() => setNewChatOpen(true)} data-testid="overview-new-chat-btn" className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-left min-w-0">
                    <Plus className="h-5 w-5 text-emerald-900 mb-2" />
                    <div className="font-semibold">Start a chat</div>
                    <div className="text-xs text-gray-600 mt-1">Direct or group with anyone</div>
                  </button>
                  <button type="button" onClick={() => goToTab("activity")} data-testid="overview-activity-btn" className="p-4 rounded-2xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-left min-w-0">
                    <Activity className="h-5 w-5 text-amber-900 mb-2" />
                    <div className="font-semibold">Employee activity</div>
                    <div className="text-xs text-gray-600 mt-1">See who chatted what</div>
                  </button>
                  <button type="button" onClick={() => goToTab("users")} data-testid="overview-users-btn" className="p-4 rounded-2xl border border-sky-200 bg-sky-50 hover:bg-sky-100 text-left min-w-0">
                    <Users className="h-5 w-5 text-sky-900 mb-2" />
                    <div className="font-semibold">Manage users</div>
                    <div className="text-xs text-gray-600 mt-1">{stats?.total_users ?? 0} on platform</div>
                  </button>
                  <button type="button" onClick={() => goToTab("chats")} data-testid="overview-monitor-btn" className="p-4 rounded-2xl border border-violet-200 bg-violet-50 hover:bg-violet-100 text-left min-w-0">
                    <Eye className="h-5 w-5 text-violet-900 mb-2" />
                    <div className="font-semibold">Monitor all</div>
                    <div className="text-xs text-gray-600 mt-1">Read-only conversation feed</div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "batches" && (
          <div className="flex min-h-0 flex-1 overflow-hidden" data-testid="admin-batches-pane">
            {/* Employees */}
            <div className={`flex min-h-0 w-full flex-col border-r border-gray-200 bg-white md:w-72 ${mobileBatchesStep !== "employees" ? "hidden md:flex" : ""}`}>
              <div className="p-4 border-b border-gray-200">
                <h2 className="font-display font-semibold">Employees</h2>
                <p className="text-xs text-gray-500">Pick an employee to view their batches.</p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {(employees || []).map((e) => (
                  <button
                    key={e.id}
                    onClick={() => {
                      setSelectedEmployee(e);
                      loadEmployeeBatches(e.id);
                      setMobileBatchesStep("batches");
                    }}
                    data-testid={`admin-employee-${e.id}`}
                    className={`w-full flex items-center gap-3 p-3 hover:bg-gray-50 border-b border-gray-50 text-left ${
                      selectedEmployee?.id === e.id ? "bg-emerald-50" : ""
                    }`}
                  >
                    <Avatar name={e.full_name} avatarUrl={e.avatar_url} online={onlineUsers[e.id]} status={e.status} size={38} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{e.full_name}</div>
                      <div className="text-xs text-gray-500">@{e.username}</div>
                    </div>
                  </button>
                ))}
                {(employees || []).length === 0 && (
                  <div className="p-6 text-sm text-gray-400">No employees found.</div>
                )}
              </div>
            </div>

            {/* Batches & clients */}
            <div className={`flex min-h-0 w-full flex-col border-r border-gray-200 bg-white md:w-[420px] ${mobileBatchesStep !== "batches" ? "hidden md:flex" : ""}`}>
              <div className="p-4 border-b border-gray-200">
                <h2 className="font-display font-semibold">Batches</h2>
                <p className="text-xs text-gray-500">
                  {selectedEmployee ? `Batches for ${selectedEmployee.full_name}` : "Select an employee first."}
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {!selectedEmployee ? (
                  <div className="p-6 text-sm text-gray-400">Choose an employee to see batches.</div>
                ) : employeeBatches.length === 0 ? (
                  <div className="p-6 text-sm text-gray-400">No batches for this employee.</div>
                ) : (
                  employeeBatches.map((b) => (
                    <div key={b.id} className="border-b border-gray-100">
                      <div className="px-4 py-3">
                        <div className="font-medium">{b.name}</div>
                        <div className="text-xs text-gray-500">{b.client_count || 0}/{b.max_clients || 20} clients</div>
                      </div>
                      <div className="pb-2">
                        {(b.clients || []).map((c) => (
                          <button
                            key={c.id}
                            onClick={() => {
                              setSelected({ id: c.conversation_id, type: "direct", participants: [selectedEmployee.id, c.id], other_user: c });
                              setMobileBatchesStep("chat");
                            }}
                            className="w-full px-4 py-2 flex items-center gap-3 hover:bg-gray-50 text-left"
                            data-testid={`admin-batch-client-${b.id}-${c.id}`}
                          >
                            <Avatar name={c.full_name} avatarUrl={c.avatar_url} online={onlineUsers[c.id]} status={c.status} size={34} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{c.full_name}</div>
                              <div className="text-xs text-gray-500 truncate">{c.conversation_last_message || "No messages yet"}</div>
                            </div>
                          </button>
                        ))}
                        {(b.clients || []).length === 0 && (
                          <div className="px-4 pb-3 text-xs text-gray-400">No clients yet.</div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Chat */}
            <main className={`flex min-h-0 flex-1 flex-col overflow-hidden ${mobileBatchesStep !== "chat" ? "hidden md:flex" : ""}`}>
              <ChatWindow
                conversation={selected}
                messages={messages}
                onSendMessage={handleSendMessage}
                typingUsers={(selected && typingUsers[selected.id]) || {}}
                onlineUsers={onlineUsers}
                lastSeenByUser={lastSeenByUser}
                sendTyping={sendTyping}
                readOnly
              />
            </main>
          </div>
        )}

        {(tab === "chats" || tab === "mychats") && (
          <div className="flex min-h-0 flex-1 overflow-hidden" data-testid={`admin-${tab}-pane`}>
            <div className={`flex min-h-0 w-full flex-col md:w-80 lg:w-96 ${mobileChatStep !== "list" ? "hidden md:flex" : ""}`}>
              <div className="px-4 py-3 border-b border-gray-200 bg-white">
                <h2 className="font-display font-semibold">
                  {tab === "chats" ? "Monitoring" : "My Chats"}
                </h2>
                <p className="text-xs text-gray-500">
                  {tab === "chats" ? "Read-only view of all conversations" : "Conversations you're part of"}
                </p>
              </div>
              <ChatSidebar
                conversations={currentConvs}
                onlineUsers={onlineUsers}
                selectedId={selected?.id}
                onSelect={(c) => { setSelected(c); setMobileChatStep("chat"); }}
                onNewChat={() => setNewChatOpen(true)}
                adminView={tab === "chats"}
                batches={[]}
                selectedBatchId={null}
                onSelectBatch={undefined}
                onBatchesChanged={undefined}
              />
            </div>
            <main className={`flex min-h-0 flex-1 flex-col overflow-hidden ${mobileChatStep !== "chat" ? "hidden md:flex" : ""}`}>
              <ChatWindow
                conversation={selected}
                messages={messages}
                onSendMessage={handleSendMessage}
                typingUsers={(selected && typingUsers[selected.id]) || {}}
                onlineUsers={onlineUsers}
                lastSeenByUser={lastSeenByUser}
                sendTyping={sendTyping}
                readOnly={tab === "chats" && !isSelectedAdminChat}
                onBack={() => { setSelected(null); setMobileChatStep("list"); }}
              />
            </main>
          </div>
        )}

        {tab === "activity" && (
          <div className="flex flex-1 overflow-hidden" data-testid="admin-activity-pane">
            <div className={`w-full md:w-72 bg-white border-r border-gray-200 flex flex-col ${mobileActivityStep !== "list" ? "hidden md:flex" : ""}`}>
              <div className="p-4 border-b border-gray-200">
                <h2 className="font-display font-semibold">Employee activity</h2>
                <p className="text-xs text-gray-500">Click a person to see their chats.</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {users.filter((u) => u.role !== "admin").map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { loadActivity(u); setMobileActivityStep("detail"); }}
                    data-testid={`activity-user-${u.id}`}
                    className={`w-full flex items-center gap-3 p-3 hover:bg-gray-50 border-b border-gray-50 text-left ${
                      activityTarget?.id === u.id ? "bg-amber-50" : ""
                    }`}
                  >
                    <Avatar name={u.full_name} avatarUrl={u.avatar_url} online={onlineUsers[u.id]} status={u.status} size={38} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{u.full_name}</div>
                      <div className="text-xs text-gray-500 capitalize">{u.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <main className={`flex-1 overflow-y-auto ${mobileActivityStep !== "detail" ? "hidden md:block" : "block"}`}>
              {!activityTarget ? (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm" data-testid="activity-empty">
                  Select a user from the left to view their activity.
                </div>
              ) : !activityData ? (
                <div className="p-10 text-gray-400">Loading activity...</div>
              ) : (
                <div className="p-4 sm:p-6 lg:p-10 space-y-6">
                  <div className="flex items-start gap-4">
                    <Avatar name={activityData.user.full_name} avatarUrl={activityData.user.avatar_url} online={onlineUsers[activityData.user.id]} status={activityData.user.status} size={64} />
                    <div>
                      <h1 className="font-display text-2xl font-semibold">{activityData.user.full_name}</h1>
                      <div className="text-sm text-gray-500 capitalize">@{activityData.user.username} · {activityData.user.role}</div>
                      {activityData.user.bio && <p className="mt-2 text-sm text-gray-600 max-w-md">{activityData.user.bio}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg">
                    <StatCard icon={MessageSquare} label="Conversations" value={activityData.conversations.length} testId="activity-stat-convs" />
                    <StatCard icon={Activity} label="Messages sent" value={activityData.messages_sent} testId="activity-stat-msgs" accent="bg-amber-50 text-amber-900" />
                    <StatCard icon={Users} label="Groups" value={activityData.conversations.filter((c) => c.type === "group").length} testId="activity-stat-groups" accent="bg-violet-50 text-violet-900" />
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-200">
                    <div className="px-5 py-4 border-b border-gray-100">
                      <h3 className="font-display font-semibold">Conversations</h3>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {activityData.conversations.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => goToTab("chats", { selectedConv: c, mobileChatStep: "chat" })}
                          data-testid={`activity-conv-${c.id}`}
                          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 text-left"
                        >
                          <div className="flex -space-x-2">
                            {(c.participants_info || []).slice(0, 2).map((p) => (
                              <Avatar key={p.id} name={p.full_name} avatarUrl={p.avatar_url} online={onlineUsers[p.id]} size={32} />
                            ))}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {c.type === "group" ? c.name : (c.participants_info || []).map((p) => p.full_name).join(" ↔ ")}
                            </div>
                            <div className="text-xs text-gray-500 truncate">{c.last_message || "No messages"}</div>
                          </div>
                          <Eye className="h-4 w-4 text-gray-400" />
                        </button>
                      ))}
                      {activityData.conversations.length === 0 && (
                        <div className="py-8 text-center text-sm text-gray-400">No conversations yet.</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </main>
          </div>
        )}

        {tab === "users" && (
          <div className="p-4 sm:p-6 lg:p-10 overflow-y-auto" data-testid="admin-users-pane">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold mb-4 sm:mb-6">Users</h1>
            <div className="md:hidden space-y-3">
              {users.map((u) => (
                <div key={u.id} className="bg-white rounded-2xl border border-gray-200 p-4" data-testid={`admin-user-card-${u.id}`}>
                  <div className="flex items-center gap-3">
                    <Avatar name={u.full_name} avatarUrl={u.avatar_url} online={onlineUsers[u.id]} status={u.status} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{u.full_name}</div>
                      <div className="text-xs text-gray-500 truncate">@{u.username} · {u.email || "—"}</div>
                    </div>
                    <span className={`inline-flex text-[11px] px-2 py-1 rounded-full ${
                      u.role === "admin" ? "bg-amber-100 text-amber-900"
                      : u.role === "employee" ? "bg-emerald-100 text-emerald-900"
                      : "bg-sky-100 text-sky-900"
                    }`}>{u.role}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                    <span className="inline-flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${onlineUsers[u.id] ? "bg-emerald-500" : "bg-gray-300"}`} />
                      {onlineUsers[u.id] ? "Online" : "Offline"} · {u.status || "available"}
                    </span>
                    <span>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</span>
                  </div>
                  {u.id !== user.id && (
                    <Button size="sm" variant="outline" className="rounded-full mt-3 w-full" onClick={() => handleStartDirect(u)} data-testid={`users-chat-mobile-${u.id}`}>
                      Chat
                    </Button>
                  )}
                </div>
              ))}
              {users.length === 0 && (<div className="py-8 text-center text-gray-400 bg-white rounded-2xl border border-gray-200">No users yet.</div>)}
            </div>
            <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase tracking-[0.2em]">
                  <tr>
                    <th className="text-left px-4 py-3">User</th>
                    <th className="text-left px-4 py-3">Username</th>
                    <th className="text-left px-4 py-3">Role</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Joined</th>
                    <th className="text-left px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((u) => (
                    <tr key={u.id} data-testid={`admin-user-row-${u.id}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.full_name} avatarUrl={u.avatar_url} online={onlineUsers[u.id]} status={u.status} size={36} />
                          <div>
                            <div className="font-medium">{u.full_name}</div>
                            <div className="text-xs text-gray-500">{u.email || "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">@{u.username}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex text-xs px-2 py-1 rounded-full ${
                          u.role === "admin" ? "bg-amber-100 text-amber-900"
                          : u.role === "employee" ? "bg-emerald-100 text-emerald-900"
                          : "bg-sky-100 text-sky-900"
                        }`}>{u.role}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 text-xs">
                          <span className={`h-2 w-2 rounded-full ${onlineUsers[u.id] ? "bg-emerald-500" : "bg-gray-300"}`} />
                          {onlineUsers[u.id] ? "Online" : "Offline"} · {u.status || "available"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {u.id !== user.id && (
                          <Button size="sm" variant="outline" className="rounded-full" onClick={() => handleStartDirect(u)} data-testid={`users-chat-${u.id}`}>
                            Chat
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (<tr><td colSpan={6} className="py-8 text-center text-gray-400">No users yet.</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <NewChatDialog
        open={newChatOpen}
        onOpenChange={setNewChatOpen}
        onSelectUser={handleStartDirect}
        onCreateGroup={handleCreateGroup}
        onlineUsers={onlineUsers}
      />
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      </div>

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-white border-t border-gray-200 flex items-center justify-around z-20" data-testid="admin-bottom-nav">
        <button type="button" onClick={() => goToTab("batches", { mobileBatchesStep: "employees" })} className={`flex-1 h-full text-[11px] flex flex-col items-center justify-center ${tab === "batches" ? "text-emerald-900" : "text-gray-500"}`} data-testid="admin-nav-mobile-batches">
          <Layers className="h-5 w-5" />
          Batches
        </button>
        <button type="button" onClick={() => goToTab("chats", { mobileChatStep: "list" })} className={`flex-1 h-full text-[11px] flex flex-col items-center justify-center ${tab === "chats" ? "text-emerald-900" : "text-gray-500"}`} data-testid="admin-nav-mobile-monitor">
          <Eye className="h-5 w-5" />
          Monitor
        </button>
        <button type="button" onClick={() => goToTab("mychats", { mobileChatStep: "list" })} className={`flex-1 h-full text-[11px] flex flex-col items-center justify-center ${tab === "mychats" ? "text-emerald-900" : "text-gray-500"}`} data-testid="admin-nav-mobile-mychats">
          <MessageSquare className="h-5 w-5" />
          My chats
        </button>
        <button type="button" onClick={() => goToTab("users")} className={`flex-1 h-full text-[11px] flex flex-col items-center justify-center ${tab === "users" ? "text-emerald-900" : "text-gray-500"}`} data-testid="admin-nav-mobile-users">
          <Users className="h-5 w-5" />
          Users
        </button>
      </div>
    </div>
  );
}

function NavButton({ icon: Icon, label, active, onClick, testId }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors mb-1 ${
        active ? "bg-emerald-800/60 text-white" : "hover:bg-emerald-900 text-emerald-100"
      }`}
    >
      <Icon className="h-5 w-5" strokeWidth={1.5} />
      <span className="hidden lg:inline text-sm font-medium">{label}</span>
    </button>
  );
}

function MobileTabButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border transition-colors ${
        active ? "bg-emerald-900 border-emerald-900 text-white" : "bg-white border-gray-200 text-gray-700"
      }`}
    >
      {label}
    </button>
  );
}
