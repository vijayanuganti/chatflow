import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import ChatSidebar from "@/components/ChatSidebar";
import ChatWindow from "@/components/ChatWindow";
import { newConversationPath } from "@/lib/appRoutes";
import TopBar from "@/components/TopBar";
import useChatSocket from "@/hooks/useChatSocket";
import useDoubleBackToExit from "@/hooks/useDoubleBackToExit";
import useMobileChatViewport from "@/hooks/useMobileChatViewport";
import { api, formatApiError } from "@/lib/api";
import {
  ensureNotificationPermission,
  registerServiceWorker,
  showAppNotification,
} from "@/lib/notify";
import {
  playInboundMessageTone,
  notificationToneSuppressesOsSound,
} from "@/lib/notificationTone";
import { toast } from "sonner";
import {
  Users, MessageSquare, Briefcase, UserCircle2, LayoutDashboard,
  MessageCircle, Eye, Activity, Plus, Layers, UserPlus, ShieldCheck,
  KeyRound, ShieldAlert, UserCheck, UserX, PowerOff, Power, Stethoscope,
  ArrowRightLeft, FolderPlus, Inbox, CheckCircle2, Clock, RotateCcw, Loader2,
  HardDrive, Trash2, Settings,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import Avatar from "@/components/Avatar";
import {
  createAccountPath,
  medicalPath,
  profilePath,
  resetPasswordPath,
  userAccountPath,
  userProfilePath,
} from "@/lib/appRoutes";
import ProfileQuickView from "@/components/ProfileQuickView";
import { saveChatListScroll } from "@/lib/chatListScroll";
import {
  patchConversationPrefs,
  updateConversationPreferences,
} from "@/lib/conversationPreferences";
import {
  loadCacheFromStorage,
  mergeMessageLists,
  getCachedMessages,
  setCachedMessages,
} from "@/lib/messageCache";
import {
  mergeIncomingLiveMessage,
  isOwnMessage,
  shouldNotifyForMessage,
  isViewingConversation,
} from "@/lib/optimisticMessages";
import { useOptimisticMessageSend } from "@/hooks/useOptimisticMessageSend";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ADMIN_TAB_IDS = new Set([
  "overview", "batches", "chats", "mychats", "activity", "users",
  "accounts", "permissions", "inactive", "complaints", "storage", "more",
]);

function pathForAdminTab(t) {
  return t === "overview" ? "/admin" : `/admin/${t}`;
}

/** ASCII-only stat display (avoids em-dash mojibake in Android WebView). */
function formatStatValue(value) {
  if (value == null || value === "") return "0";
  if (typeof value === "number" && Number.isNaN(value)) return "0";
  return String(value);
}

function formatStorageBytes(n) {
  if (n == null || Number.isNaN(Number(n))) return "0";
  const v = Number(n);
  if (v < 1024) return `${Math.round(v)} B`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(2)} MB`;
  return `${(v / 1024 ** 3).toFixed(2)} GB`;
}

function StorageMeter({ title, usedBytes, quotaBytes, freeBytes, percentUsed, subtitle, testId }) {
  const pct = percentUsed != null ? Math.min(100, Math.max(0, percentUsed)) : null;
  return (
    <div
      className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-3"
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">{title}</div>
          <div className="font-display text-lg font-semibold dark:text-gray-100 mt-1">
            {formatStorageBytes(usedBytes)} used
            {quotaBytes != null && (
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                {" "} |  {formatStorageBytes(freeBytes)} free
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>}
        </div>
      </div>
      {pct != null && (
        <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-600 dark:bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, testId, accent }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow" data-testid={testId}>
      <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${accent || "bg-emerald-50 text-emerald-900"}`}>
        <Icon className="h-6 w-6" strokeWidth={1.5} />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">{label}</div>
        <div className="font-display text-2xl font-semibold dark:text-gray-100">{value}</div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  useMobileChatViewport();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
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

  /** When the URL section changes (nav, deep link, browser Back/Forward), drop pane state from the tab we left. */
  const prevTabRef = useRef(null);
  useEffect(() => {
    const prev = prevTabRef.current;
    prevTabRef.current = tab;
    if (prev === null || prev === tab) return;
    if (prev === "chats" || prev === "mychats") {
      if (tab !== "chats" && tab !== "mychats") {
        setMobileChatStep("list");
        setSelected(null);
      }
    }
    if (prev === "batches" && tab !== "batches") {
      setMobileBatchesStep("employees");
      setSelectedEmployee(null);
      setEmployeeBatches([]);
      setSelected(null);
    }
    if (prev === "activity" && tab !== "activity") {
      setActivityTarget(null);
      setActivityData(null);
      setMobileActivityStep("list");
    }
    if (tab === "batches" && prev !== "batches") {
      setMobileBatchesStep("employees");
      setSelectedEmployee(null);
      setEmployeeBatches([]);
      setSelected(null);
    }
  }, [tab]);

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
  const [permissionSavingId, setPermissionSavingId] = useState(null);
  const [activeSavingId, setActiveSavingId] = useState(null);
  const [usersRoleFilter, setUsersRoleFilter] = useState("all"); // all | employees | clients | inactive_clients
  const [listSelection, setListSelection] = useState(null);
  const [quickView, setQuickView] = useState(null);
  const listScrollRef = useRef(null);
  const [newBatchOpen, setNewBatchOpen] = useState(false);
  const [moveClientTarget, setMoveClientTarget] = useState(null); // client doc
  const [complaints, setComplaints] = useState([]);
  const [complaintsLoading, setComplaintsLoading] = useState(false);
  const [complaintsFilter, setComplaintsFilter] = useState("pending"); // pending | solved | all
  const [complaintSavingId, setComplaintSavingId] = useState(null);
  const [storage, setStorage] = useState(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState(null);
  const [deleteConvTarget, setDeleteConvTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const goToTab = useCallback((t, opts = {}) => {
    const {
      selectedConv,
      mobileBatchesStep,
      mobileChatStep,
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
    const path = pathForAdminTab(t);
    if (location.pathname !== path) {
      navigate(path);
    }
  }, [navigate, location.pathname]);

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

  const loadStorage = useCallback(async () => {
    setStorageLoading(true);
    try {
      const res = await api.get("/admin/storage");
      setStorage(res.data);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setStorageLoading(false);
    }
  }, []);

  const loadComplaints = useCallback(async (filter = complaintsFilter) => {
    setComplaintsLoading(true);
    try {
      const params = filter && filter !== "all" ? { status: filter } : {};
      const res = await api.get("/admin/complaints", { params });
      setComplaints(res.data || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setComplaintsLoading(false);
    }
  }, [complaintsFilter]);

  const updateComplaintStatus = useCallback(async (complaint, status, resolutionNotes) => {
    setComplaintSavingId(complaint.id);
    try {
      const res = await api.patch(`/admin/complaints/${complaint.id}`, {
        status,
        resolution_notes: resolutionNotes ?? complaint.resolution_notes ?? null,
      });
      setComplaints((prev) => {
        const updated = res.data;
        const showThisOne =
          complaintsFilter === "all" || complaintsFilter === updated.status;
        if (!showThisOne) {
          return prev.filter((c) => c.id !== updated.id);
        }
        return prev.map((c) => (c.id === updated.id ? updated : c));
      });
      // Keep the overview stat row honest.
      setStats((prev) => (prev ? {
        ...prev,
        complaints_pending: status === "solved"
          ? Math.max(0, (prev.complaints_pending ?? 1) - 1)
          : (prev.complaints_pending ?? 0) + 1,
        complaints_solved: status === "solved"
          ? (prev.complaints_solved ?? 0) + 1
          : Math.max(0, (prev.complaints_solved ?? 1) - 1),
      } : prev));
      toast.success(status === "solved" ? "Marked as solved" : "Reopened complaint");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setComplaintSavingId(null);
    }
  }, [complaintsFilter]);

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
    void (async () => {
      await registerServiceWorker();
      await ensureNotificationPermission();
    })();
  }, []);

  // Service worker tells us when the admin taps a chat notification - jump to
  // My Chats and focus that conversation.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event) => {
      const payload = event?.data;
      if (!payload || payload.type !== "chatflow:notification-click") return;
      const convId = payload.data?.conversation_id;
      if (!convId) return;
      setMyConvs((prev) => {
        const target = prev.find((c) => c.id === convId);
        if (target) {
          goToTab("mychats", { selectedConv: target, mobileChatStep: "chat" });
        }
        return prev;
      });
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [goToTab]);
  useEffect(() => {
    if (tab !== "complaints") return;
    loadComplaints();
  }, [tab, complaintsFilter, loadComplaints]);
  useEffect(() => {
    if (tab !== "storage") return;
    loadStorage();
  }, [tab, loadStorage]);

  const myConvsRef = useRef(myConvs);
  useEffect(() => {
    myConvsRef.current = myConvs;
  }, [myConvs]);

  const loadMessages = useCallback(async (convId) => {
    if (!convId) return;
    try {
      const res = await api.get(`/conversations/${convId}/messages`);
      if (!isViewingConversation(convId, selectedIdRef.current)) return;
      setMessages((prev) => {
        const cached = getCachedMessages(convId);
        const next = mergeMessageLists(cached || prev, res.data);
        if (user?.id) setCachedMessages(user.id, convId, next);
        return next;
      });
      const isMyChat = myConvsRef.current.find((c) => c.id === convId);
      if (isMyChat) api.post(`/conversations/${convId}/read`).catch(() => {});
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, [user?.id]);

  const prevSelectedConvRef = useRef(null);
  useEffect(() => {
    if (!selected?.id) {
      setMessages([]);
      prevSelectedConvRef.current = null;
      return;
    }
    if (prevSelectedConvRef.current === selected.id) return;
    prevSelectedConvRef.current = selected.id;
    const cached = getCachedMessages(selected.id);
    setMessages(cached?.length ? cached : []);
    loadMessages(selected.id);
  }, [selected?.id, loadMessages]);

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

  const handleAccountCreated = useCallback(async () => {
    await Promise.all([loadOverview(), loadEmployees()]);
    toast.success("Account list refreshed");
  }, [loadOverview, loadEmployees]);

  useEffect(() => {
    if (!location.state?.refreshAccounts) return;
    void handleAccountCreated();
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, handleAccountCreated, navigate]);

  useEffect(() => {
    const pending = location.state?.pendingChat;
    if (!pending?.selectedConv) return;
    goToTab("mychats", {
      selectedConv: pending.selectedConv,
      mobileChatStep: pending.mobileChatStep || "chat",
    });
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state?.pendingChat, navigate, location.pathname, goToTab]);

  const openNewConversation = useCallback(() => {
    navigate(newConversationPath(), {
      state: { backTo: "/admin/mychats", panel: "admin" },
    });
  }, [navigate]);

  const toggleActive = useCallback(async (target, nextActive) => {
    if (!target || target.role === "admin") return;
    setActiveSavingId(target.id);
    try {
      await api.post(`/admin/users/${target.id}/active`, { is_active: nextActive });
      setUsers((prev) => prev.map((u) => (
        u.id === target.id
          ? {
              ...u,
              is_active: nextActive,
              inactive_at: nextActive ? null : new Date().toISOString(),
            }
          : u
      )));
      // refresh overview stats so the active/inactive counters stay accurate
      api.get("/admin/stats").then((r) => setStats(r.data)).catch(() => {});
      toast.success(
        nextActive
          ? `${target.full_name} reactivated`
          : `${target.full_name} marked inactive`,
      );
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setActiveSavingId(null);
    }
  }, []);

  const togglePermission = useCallback(async (employee, nextValue) => {
    setPermissionSavingId(employee.id);
    try {
      await api.post(`/admin/users/${employee.id}/permissions`, {
        account_creation_access: nextValue,
      });
      setUsers((prev) => prev.map((u) => (
        u.id === employee.id ? { ...u, account_creation_access: nextValue } : u
      )));
      setEmployees((prev) => prev.map((u) => (
        u.id === employee.id ? { ...u, account_creation_access: nextValue } : u
      )));
      toast.success(
        nextValue
          ? `${employee.full_name} can now create client accounts`
          : `Revoked account creation access from ${employee.full_name}`,
      );
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setPermissionSavingId(null);
    }
  }, []);

  const openUserDetail = useCallback((u) => {
    navigate(userAccountPath(u.id));
  }, [navigate]);

  const handleIncoming = useCallback((msg) => {
    if (!msg) return;
    const own = isOwnMessage(msg, user.id);
    const recipientIds = Array.isArray(msg?.recipient_ids) ? msg.recipient_ids : [];
    const inRecipientList = recipientIds.some((id) => String(id) === String(user.id));
    if (msg?.id && inRecipientList && !own) {
      api.post("/notifications/update-status", { message_id: msg.id, status: "delivered" }).catch(() => {});
    }
    const activeId = selectedIdRef.current;
    const adminMonitoring =
      user.role === "admin" && !own;
    if (
      !own
      && shouldNotifyForMessage(msg, user.id)
      && (inRecipientList || adminMonitoring)
      && !(document.visibilityState === "visible" && isViewingConversation(msg.conversation_id, activeId))
    ) {
      const sender = msg.sender_name || "Someone";
      const preview = msg.message_type === "text"
        ? (msg.content || "")
        : `[${msg.message_type}]`;
      const title = msg.conversation_type === "group"
        ? `${sender} (group)`
        : sender;
      playInboundMessageTone();
      showAppNotification({
        title,
        body: preview,
        tag: msg.id ? `msg-${msg.id}` : `msg-${Date.now()}`,
        url: "/admin/mychats",
        data: { conversation_id: msg.conversation_id },
        silent: notificationToneSuppressesOsSound(),
      });
    }
    setMessages((prev) => {
      if (!isViewingConversation(msg.conversation_id, activeId)) return prev;
      const { next, changed } = mergeIncomingLiveMessage(prev, msg, user.id);
      if (changed && user?.id) setCachedMessages(user.id, activeId, next);
      return changed ? next : prev;
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
  }, [loadOverview, user.id, user.role]);

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
          return {
            ...m,
            read_by: [...(m.read_by || []), data.reader_id],
            status: "seen",
          };
        }
        return m;
      }));
    }
  }, [user.id]);

  const handleStatusUpdate = useCallback((data) => {
    if (!data?.status) return;
    const nextStatus = String(data.status).toLowerCase();
    const ids = data.message_ids?.length
      ? data.message_ids.map((id) => String(id))
      : data.message_id
        ? [String(data.message_id)]
        : [];
    if (!ids.length) return;
    const idSet = new Set(ids);
    setMessages((prev) => {
      let changed = false;
      const next = prev.map((m) => {
        if (!idSet.has(String(m.id))) return m;
        changed = true;
        const cur = (m.status || "sent").toLowerCase();
        const order = { sent: 0, delivered: 1, seen: 2 };
        const status = (order[nextStatus] ?? 0) >= (order[cur] ?? 0) ? nextStatus : cur;
        return { ...m, status };
      });
      return changed ? next : prev;
    });
  }, []);

  const handleConversationRemoved = useCallback((data) => {
    const id = data?.conversation_id;
    if (!id) return;
    setAllConvs((prev) => prev.filter((c) => c.id !== id));
    setMyConvs((prev) => prev.filter((c) => c.id !== id));
    setSelected((s) => (s?.id === id ? null : s));
    if (selectedIdRef.current === id) setMessages([]);
    api.get("/admin/stats").then((r) => setStats(r.data)).catch(() => {});
  }, []);

  const { sendTyping } = useChatSocket({
    onMessage: handleIncoming,
    onTyping: handleTypingEvent,
    onPresence: handlePresence,
    onReadReceipt: handleReadReceipt,
    onStatusUpdate: handleStatusUpdate,
    onConversationRemoved: handleConversationRemoved,
    enabled: Boolean(user?.id),
  });

  const { sendMessage: handleSendMessage, patchMessage } = useOptimisticMessageSend({
    user,
    selectedIdRef,
    setMessages,
    setConversations: setMyConvs,
    conversations: myConvs,
    onConversationMissing: loadOverview,
  });

  const isSelectedAdminChat = selected && myConvs.find((c) => c.id === selected.id);
  const currentConvs = tab === "mychats" ? myConvs : allConvs;

  const topbarTitle = "ChatFlow";

  const handlePreferenceChange = useCallback(async (convId, patch) => {
    try {
      const data = await updateConversationPreferences(convId, patch);
      setMyConvs((prev) => patchConversationPrefs(prev, convId, data));
      if (patch.is_archived && selectedIdRef.current === convId) {
        setSelected(null);
        setMobileChatStep("list");
      }
      if (patch.is_archived && listSelection?.id === convId) {
        setListSelection(null);
      }
      setListSelection((prev) => (prev?.id === convId ? { ...prev, ...data } : prev));
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, [listSelection?.id]);

  const openUserProfile = useCallback((profileUser, conv) => {
    if (!profileUser?.id) return;
    navigate(userProfilePath("admin", profileUser.id), {
      state: {
        backTo: tab === "mychats" ? "/admin/mychats" : "/admin/chats",
        conversationId: conv?.id,
        profile: profileUser,
        isMuted: !!conv?.is_muted,
      },
    });
  }, [navigate, tab]);

  const handleRefresh = useCallback(async () => {
    const convId = selectedIdRef.current;
    await loadOverview();
    if (convId && tab === "mychats") {
      try {
        const res = await api.get(`/conversations/${convId}/messages`);
        setMessages(res.data);
      } catch {
        /* keep cached messages */
      }
    }
    if (user?.id) loadCacheFromStorage(user.id);
  }, [loadOverview, tab, user?.id]);

  const filterUsersForTab = useCallback((u) => {
    if (usersRoleFilter === "all") return true;
    if (usersRoleFilter === "employees") return u.role === "employee";
    if (usersRoleFilter === "clients") return u.role === "client" && u.is_active !== false;
    if (usersRoleFilter === "inactive_clients") return u.role === "client" && u.is_active === false;
    return true;
  }, [usersRoleFilter]);

  const usersById = useMemo(() => {
    const m = {};
    users.forEach((u) => { m[u.id] = u; });
    return m;
  }, [users]);

  const adminCount = useMemo(() => users.filter((u) => u.role === "admin").length, [users]);

  const submitDeleteUser = useCallback(async () => {
    const t = deleteUserTarget;
    if (!t) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/admin/users/${t.id}`, { params: { confirm_user_id: t.id } });
      toast.success("Account removed");
      setDeleteUserTarget(null);
      setUsers((prev) => prev.filter((u) => u.id !== t.id));
      await loadOverview();
      await loadStorage();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteUserTarget, loadOverview, loadStorage]);

  const submitDeleteConversation = useCallback(async () => {
    const t = deleteConvTarget;
    if (!t) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/admin/conversations/${t.id}`, { params: { confirm_conversation_id: t.id } });
      setAllConvs((prev) => prev.filter((c) => c.id !== t.id));
      setMyConvs((prev) => prev.filter((c) => c.id !== t.id));
      setSelected((s) => (s?.id === t.id ? null : s));
      if (selectedIdRef.current === t.id) setMessages([]);
      toast.success("Conversation deleted");
      setDeleteConvTarget(null);
      await loadOverview();
      await loadStorage();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteConvTarget, loadOverview, loadStorage]);

  const unreadTotal = myConvs
    .filter((c) => !c.is_archived)
    .reduce((sum, c) => sum + Number(c.unread_count || 0), 0);

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

  // True when the mobile UI is showing a full-screen chat: in that mode we
  // hide the global topbar, the horizontal tab scroller and the bottom nav so
  // only the chat header + composer is visible (WhatsApp-style).
  const mobileInChat = (
    ((tab === "chats" || tab === "mychats") && mobileChatStep === "chat") ||
    (tab === "batches" && mobileBatchesStep === "chat")
  );
  const backToBatchesChat = useCallback(() => {
    setSelected(null);
    setMobileBatchesStep("batches");
  }, []);
  const backToChatList = useCallback(() => {
    setSelected(null);
    setMobileChatStep("list");
  }, []);

  const drillDownBackActive =
    mobileInChat ||
    (tab === "batches" && mobileBatchesStep === "batches") ||
    (tab === "activity" && mobileActivityStep === "detail");

  useDoubleBackToExit({
    enabled: true,
    onBeforeExitBack: () => {
      if (listSelection && (tab === "mychats" || tab === "chats") && mobileChatStep === "list") {
        setListSelection(null);
        return { repushSentinel: false };
      }
      if (mobileInChat) {
        if (tab === "batches") backToBatchesChat();
        else backToChatList();
        return { repushSentinel: false };
      }
      if (tab === "batches" && mobileBatchesStep === "batches") {
        setMobileBatchesStep("employees");
        return { repushSentinel: false };
      }
      if (tab === "activity" && mobileActivityStep === "detail") {
        setActivityTarget(null);
        setActivityData(null);
        setMobileActivityStep("list");
        return { repushSentinel: false };
      }
      return false;
    },
  });

  return (
    <div
      className="flex min-h-0 w-full flex-col overflow-hidden bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100"
      style={{ height: "var(--visual-vh, 100dvh)" }}
      data-testid="admin-dashboard"
    >
      <div className={`shrink-0 ${mobileInChat ? "hidden md:block" : ""}`}>
        <TopBar
          onOpenSettings={() => navigate(profilePath("admin"))}
          title={topbarTitle}
          onBack={topbarOnBack}
          onRefresh={handleRefresh}
          onCreateAccount={() =>
            navigate(createAccountPath("admin"), {
              state: { allowedRoles: ["employee", "client"], defaultRole: "client", backTo: "/admin/accounts" },
            })
          }
        />
      </div>

      {/* Mobile: primary navigation is the bottom bar (WhatsApp-style). */}
      <div className="hidden" aria-hidden data-testid="admin-mobile-tabs-legacy" />

      <div className={`flex min-h-0 flex-1 overflow-hidden ${mobileInChat ? "pb-0" : "pb-[calc(3.5rem+env(safe-area-inset-bottom))]"} md:pb-0`}>
        {/* Admin Nav */}
        <nav className="hidden md:flex w-20 lg:w-60 bg-emerald-950 text-emerald-100 flex-col py-6 px-3">
          <div className="flex items-center gap-3 px-2 mb-8">
            <div className="h-10 w-10 rounded-xl bg-emerald-700/40 flex items-center justify-center">
              <MessageCircle className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <span className="font-display text-lg font-semibold hidden lg:inline">ChatFlow</span>
          </div>
        <NavButton icon={LayoutDashboard} label="Overview" active={tab === "overview"} onClick={() => goToTab("overview")} testId="admin-nav-overview" />
        <NavButton icon={UserPlus} label="Accounts" active={tab === "accounts"} onClick={() => goToTab("accounts")} testId="admin-nav-accounts" />
        <NavButton icon={ShieldCheck} label="Permissions" active={tab === "permissions"} onClick={() => goToTab("permissions")} testId="admin-nav-permissions" />
        <NavButton icon={Layers} label="Batches" active={tab === "batches"} onClick={() => goToTab("batches")} testId="admin-nav-batches" />
        <NavButton icon={Eye} label="Monitor Chats" active={tab === "chats"} onClick={() => goToTab("chats")} testId="admin-nav-chats" />
        <NavButton icon={MessageSquare} label="My Chats" active={tab === "mychats"} onClick={() => goToTab("mychats")} testId="admin-nav-mychats" />
        <NavButton icon={Activity} label="Activity" active={tab === "activity"} onClick={() => goToTab("activity")} testId="admin-nav-activity" />
        <NavButton icon={Users} label="Users" active={tab === "users"} onClick={() => goToTab("users")} testId="admin-nav-users" />
        <NavButton icon={Inbox} label="Complaints" active={tab === "complaints"} onClick={() => goToTab("complaints")} testId="admin-nav-complaints" badge={stats?.complaints_pending || 0} />
        <NavButton icon={HardDrive} label="Storage" active={tab === "storage"} onClick={() => goToTab("storage")} testId="admin-nav-storage" />
        <NavButton icon={Settings} label="Settings & more" active={tab === "more"} onClick={() => goToTab("more")} testId="admin-nav-more" />
        <div className="mt-3 mb-1 px-3 text-[10px] uppercase tracking-[0.2em] text-emerald-200/50 hidden lg:block">Archive</div>
        <NavButton icon={UserX} label="Inactive" active={tab === "inactive"} onClick={() => goToTab("inactive")} testId="admin-nav-inactive" />
        <div className="mt-auto px-2 py-2 text-[10px] text-emerald-200/70 hidden lg:block">
          Logged in as <span className="font-medium text-emerald-100">{user?.full_name}</span>
        </div>
        </nav>

        {/* Content */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {tab === "overview" && (
          <div className="p-4 sm:p-6 lg:p-10 space-y-6 overflow-y-auto overflow-x-hidden w-full min-w-0 max-w-full" data-testid="admin-overview-pane">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-800 dark:text-emerald-300">Admin panel</div>
              <h1 className="font-display text-2xl sm:text-4xl font-semibold mt-1 dark:text-gray-100">Hi, {user?.full_name?.split(" ")[0] || "Admin"}.</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">Monitor conversations and chat with anyone on the platform.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <StatCard icon={Users} label="Total users" value={formatStatValue(stats?.total_users)} testId="stat-total-users" />
              <StatCard icon={Briefcase} label="Employees" value={formatStatValue(stats?.employees)} testId="stat-employees" accent="bg-amber-50 text-amber-900" />
              <StatCard icon={UserCircle2} label="Clients" value={formatStatValue(stats?.clients)} testId="stat-clients" accent="bg-sky-50 text-sky-900" />
              <StatCard icon={UserCheck} label="Active clients" value={formatStatValue(stats?.active_clients)} testId="stat-active-clients" accent="bg-emerald-50 text-emerald-900" />
              <button
                type="button"
                onClick={() => goToTab("inactive")}
                className="text-left"
                data-testid="stat-inactive-clients-btn"
              >
                <StatCard icon={UserX} label="Inactive clients" value={formatStatValue(stats?.inactive_clients)} testId="stat-inactive-clients" accent="bg-rose-50 text-rose-900" />
              </button>
              <button
                type="button"
                onClick={() => goToTab("complaints")}
                className="text-left"
                data-testid="stat-complaints-btn"
              >
                <StatCard icon={Inbox} label="Open complaints" value={formatStatValue(stats?.complaints_pending)} testId="stat-complaints-open" accent="bg-rose-50 text-rose-900" />
              </button>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 min-w-0">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-lg sm:text-xl font-semibold dark:text-gray-100">Latest activity</h2>
                  <Button variant="ghost" className="text-xs sm:text-sm px-2 sm:px-3" onClick={() => goToTab("chats")} data-testid="overview-view-all-chats">View all -></Button>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {allConvs.slice(0, 6).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => goToTab("chats", { selectedConv: c, mobileChatStep: "chat" })}
                      data-testid={`overview-conv-${c.id}`}
                      className="w-full py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 rounded-xl px-2 text-left"
                    >
                      <div className="flex -space-x-2 shrink-0">
                        {(c.participants_info || []).slice(0, 2).map((p) => (
                          <Avatar key={p.id} name={p.full_name} avatarUrl={p.avatar_url} online={onlineUsers[p.id]} size={32} />
                        ))}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate dark:text-gray-100">
                          {c.type === "group" ? c.name : (c.participants_info || []).map((p) => p.full_name).join(", ")}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.last_message || "No messages"}</div>
                      </div>
                      {c.type === "group" && <span className="hidden sm:inline text-[10px] bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200 px-2 py-0.5 rounded-full">Group</span>}
                    </button>
                  ))}
                  {allConvs.length === 0 && <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">No activity yet.</div>}
                </div>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 min-w-0">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-lg sm:text-xl font-semibold dark:text-gray-100">Quick actions</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() =>
                      navigate(createAccountPath("admin"), {
                        state: { allowedRoles: ["employee", "client"], defaultRole: "client", backTo: "/admin" },
                      })
                    }
                    data-testid="overview-create-account-btn" className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/15 text-left min-w-0">
                    <UserPlus className="h-5 w-5 text-emerald-900 dark:text-emerald-300 mb-2" />
                    <div className="font-semibold dark:text-gray-100">Create account</div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">Add employee or client</div>
                  </button>
                  <button onClick={openNewConversation} data-testid="overview-new-chat-btn" className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/15 text-left min-w-0">
                    <Plus className="h-5 w-5 text-emerald-900 dark:text-emerald-300 mb-2" />
                    <div className="font-semibold dark:text-gray-100">Start a chat</div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">Direct or group with anyone</div>
                  </button>
                  <button type="button" onClick={() => goToTab("permissions")} data-testid="overview-permissions-btn" className="p-4 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/15 text-left min-w-0">
                    <ShieldCheck className="h-5 w-5 text-amber-900 dark:text-amber-300 mb-2" />
                    <div className="font-semibold dark:text-gray-100">Permissions</div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">{stats?.employees_with_creation_access ?? 0} employees delegated</div>
                  </button>
                  <button type="button" onClick={() => goToTab("activity")} data-testid="overview-activity-btn" className="p-4 rounded-2xl border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 dark:hover:bg-sky-500/15 text-left min-w-0">
                    <Activity className="h-5 w-5 text-sky-900 dark:text-sky-300 mb-2" />
                    <div className="font-semibold dark:text-gray-100">Employee activity</div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">See who chatted what</div>
                  </button>
                  <button type="button" onClick={() => goToTab("chats")} data-testid="overview-monitor-btn" className="p-4 rounded-2xl border border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/10 hover:bg-violet-100 dark:hover:bg-violet-500/15 text-left min-w-0">
                    <Eye className="h-5 w-5 text-violet-900 dark:text-violet-300 mb-2" />
                    <div className="font-semibold dark:text-gray-100">Monitor all</div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">Read-only conversation feed</div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "more" && (
          <div className="mx-auto w-full max-w-lg space-y-5 overflow-y-auto p-4 sm:p-6" data-testid="admin-more-pane">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-800 dark:text-emerald-300">Tools</div>
              <h1 className="mt-1 font-display text-2xl font-semibold dark:text-gray-100">Settings & admin</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Jump to monitoring, batches, and account tools.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <AdminMoreTile icon={Eye} title="Monitor chats" subtitle="All conversations" onClick={() => goToTab("chats", { mobileChatStep: "list" })} testId="more-monitor" />
              <AdminMoreTile icon={Layers} title="Batches" subtitle="Teams & clients" onClick={() => goToTab("batches", { mobileBatchesStep: "employees" })} testId="more-batches" />
              <AdminMoreTile icon={UserPlus} title="Accounts" subtitle="Create users" onClick={() => goToTab("accounts")} testId="more-accounts" />
              <AdminMoreTile icon={ShieldCheck} title="Permissions" subtitle="Who can create clients" onClick={() => goToTab("permissions")} testId="more-permissions" />
              <AdminMoreTile icon={Activity} title="Activity" subtitle="Audit trail" onClick={() => goToTab("activity", { resetActivityList: true })} testId="more-activity" />
              <AdminMoreTile icon={Inbox} title="Complaints" subtitle={stats?.complaints_pending ? `${stats.complaints_pending} open` : "Inbox"} onClick={() => goToTab("complaints")} testId="more-complaints" />
              <AdminMoreTile icon={HardDrive} title="Storage" subtitle="Usage & quotas" onClick={() => goToTab("storage")} testId="more-storage" />
              <AdminMoreTile icon={UserX} title="Inactive" subtitle="Deactivated clients" onClick={() => goToTab("inactive")} testId="more-inactive" />
            </div>
            <button
              type="button"
              onClick={() => navigate(profilePath("admin"))}
              className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-emerald-900 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-emerald-200"
              data-testid="more-profile-btn"
            >
              <UserCircle2 className="h-5 w-5" strokeWidth={1.5} />
              Profile & preferences
            </button>
          </div>
        )}

        {tab === "batches" && (
          <div className="flex min-h-0 flex-1 overflow-hidden" data-testid="admin-batches-pane">
            {/* Employees */}
            <div className={`flex min-h-0 w-full flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 md:w-72 ${mobileBatchesStep !== "employees" ? "hidden md:flex" : ""}`}>
              <div className="hidden md:block p-4 border-b border-gray-200 dark:border-gray-800">
                <h2 className="font-display font-semibold dark:text-gray-100">Employees</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Pick an employee to view their batches.</p>
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
                    className={`w-full flex items-center gap-3 p-3 border-b border-gray-50 dark:border-gray-800/60 text-left transition-colors ${
                      selectedEmployee?.id === e.id
                        ? "bg-emerald-50 dark:bg-emerald-500/15"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
                    }`}
                  >
                    <Avatar name={e.full_name} avatarUrl={e.avatar_url} online={onlineUsers[e.id]} status={e.status} size={38} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate dark:text-gray-100">{e.full_name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">@{e.username}</div>
                    </div>
                  </button>
                ))}
                {(employees || []).length === 0 && (
                  <div className="p-6 text-sm text-gray-400 dark:text-gray-500">No employees found.</div>
                )}
              </div>
            </div>

            {/* Batches & clients */}
            <div className={`flex min-h-0 w-full flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 md:w-[420px] ${mobileBatchesStep !== "batches" ? "hidden md:flex" : ""}`}>
              <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display font-semibold dark:text-gray-100">Batches</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {selectedEmployee ? `Batches for ${selectedEmployee.full_name}` : "Select an employee first."}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setNewBatchOpen(true)}
                  disabled={!selectedEmployee}
                  className="rounded-full bg-emerald-900 hover:bg-emerald-950 shrink-0"
                  data-testid="admin-new-batch-btn"
                >
                  <FolderPlus className="h-4 w-4 mr-1.5" />
                  New batch
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {!selectedEmployee ? (
                  <div className="p-6 text-sm text-gray-400 dark:text-gray-500">Choose an employee to see batches.</div>
                ) : employeeBatches.length === 0 ? (
                  <div className="p-6 text-sm text-gray-400 dark:text-gray-500">No batches for this employee.</div>
                ) : (
                  employeeBatches.map((b) => (
                    <div key={b.id} className="border-b border-gray-100 dark:border-gray-800/60">
                      <div className="px-4 py-3">
                        <div className="font-medium dark:text-gray-100">{b.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{b.client_count || 0}/{b.max_clients || 20} clients</div>
                      </div>
                      <div className="pb-2">
                        {(b.clients || []).map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/60"
                            data-testid={`admin-batch-client-${b.id}-${c.id}`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelected({ id: c.conversation_id, type: "direct", participants: [selectedEmployee.id, c.id], other_user: c });
                                setMobileBatchesStep("chat");
                              }}
                              className="flex-1 flex items-center gap-3 text-left min-w-0"
                            >
                              <Avatar name={c.full_name} avatarUrl={c.avatar_url} online={onlineUsers[c.id]} status={c.status} size={34} />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate dark:text-gray-100">{c.full_name}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.conversation_last_message || "No messages yet"}</div>
                              </div>
                            </button>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="rounded-full h-8 w-8 shrink-0"
                              title="Move to another employee / batch"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMoveClientTarget({
                                  ...c,
                                  current_employee_id: selectedEmployee.id,
                                  current_batch_id: b.id,
                                });
                              }}
                              data-testid={`admin-move-client-${c.id}`}
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                        {(b.clients || []).length === 0 && (
                          <div className="px-4 pb-3 text-xs text-gray-400 dark:text-gray-500">No clients yet.</div>
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
                onPatchMessage={patchMessage}
                typingUsers={(selected && typingUsers[selected.id]) || {}}
                onlineUsers={onlineUsers}
                lastSeenByUser={lastSeenByUser}
                sendTyping={sendTyping}
                readOnly
                onBack={backToBatchesChat}
                statusBarInset={mobileInChat}
              />
            </main>
          </div>
        )}

        {(tab === "chats" || tab === "mychats") && (
          <div className="flex min-h-0 flex-1 overflow-hidden" data-testid={`admin-${tab}-pane`}>
            <div className={`flex h-full min-h-0 w-full flex-col md:w-80 lg:w-96 bg-white dark:bg-gray-900 ${mobileChatStep !== "list" ? "hidden md:flex" : ""}`}>
              <div className="hidden md:block shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3">
                <h2 className="font-display font-semibold dark:text-gray-100">
                  {tab === "chats" ? "Monitoring" : "My Chats"}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {tab === "chats" ? "Read-only view of all conversations" : "Conversations you're part of"}
                </p>
              </div>
              <ChatSidebar
                conversations={currentConvs}
                onlineUsers={onlineUsers}
                selectedId={selected?.id}
                onSelect={(c) => {
                  setListSelection(null);
                  setSelected(c);
                  setMobileChatStep("chat");
                }}
                onNewChat={openNewConversation}
                adminView={tab === "chats"}
                batches={[]}
                selectedBatchId={null}
                onSelectBatch={undefined}
                onBatchesChanged={undefined}
                onPreferenceChange={tab === "mychats" ? handlePreferenceChange : undefined}
                readOnlyPrefs={tab === "chats"}
                selectedConversation={listSelection}
                onSelectedConversationChange={setListSelection}
                onAvatarPress={tab === "mychats" ? (conv, u) => setQuickView({ conv, user: u }) : undefined}
                listScrollRef={listScrollRef}
              />
            </div>
            <main className={`flex min-h-0 flex-1 flex-col overflow-hidden ${mobileChatStep !== "chat" ? "hidden md:flex" : ""}`}>
              <ChatWindow
                conversation={selected}
                messages={messages}
                onSendMessage={handleSendMessage}
                onPatchMessage={patchMessage}
                typingUsers={(selected && typingUsers[selected.id]) || {}}
                onlineUsers={onlineUsers}
                lastSeenByUser={lastSeenByUser}
                sendTyping={sendTyping}
                readOnly={tab === "chats" && !isSelectedAdminChat}
                onBack={backToChatList}
                statusBarInset={mobileInChat}
              />
            </main>
          </div>
        )}

        {tab === "activity" && (
          <div className="flex flex-1 overflow-hidden" data-testid="admin-activity-pane">
            <div className={`w-full md:w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col ${mobileActivityStep !== "list" ? "hidden md:flex" : ""}`}>
              <div className="hidden md:block p-4 border-b border-gray-200 dark:border-gray-800">
                <h2 className="font-display font-semibold dark:text-gray-100">Employee activity</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Tap a person to see their chats.</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {users.filter((u) => u.role !== "admin").map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { loadActivity(u); setMobileActivityStep("detail"); }}
                    data-testid={`activity-user-${u.id}`}
                    className={`w-full flex items-center gap-3 p-3 border-b border-gray-50 dark:border-gray-800/60 text-left transition-colors ${
                      activityTarget?.id === u.id
                        ? "bg-amber-50 dark:bg-amber-500/15"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
                    }`}
                  >
                    <Avatar name={u.full_name} avatarUrl={u.avatar_url} online={onlineUsers[u.id]} status={u.status} size={38} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate dark:text-gray-100">{u.full_name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{u.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <main className={`flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 ${mobileActivityStep !== "detail" ? "hidden md:block" : "block"}`}>
              {!activityTarget ? (
                <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm" data-testid="activity-empty">
                  Select a user from the left to view their activity.
                </div>
              ) : !activityData ? (
                <div className="p-10 text-gray-400 dark:text-gray-500">Loading activity...</div>
              ) : (
                <div className="p-4 sm:p-6 lg:p-10 space-y-6">
                  <div className="flex items-start gap-4">
                    <Avatar name={activityData.user.full_name} avatarUrl={activityData.user.avatar_url} online={onlineUsers[activityData.user.id]} status={activityData.user.status} size={64} />
                    <div className="min-w-0">
                      <h1 className="font-display text-2xl font-semibold dark:text-gray-100 truncate">{activityData.user.full_name}</h1>
                      <div className="text-sm text-gray-500 dark:text-gray-400 capitalize">@{activityData.user.username}  |  {activityData.user.role}</div>
                      {activityData.user.bio && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 max-w-md">{activityData.user.bio}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg">
                    <StatCard icon={MessageSquare} label="Conversations" value={activityData.conversations.length} testId="activity-stat-convs" />
                    <StatCard icon={Activity} label="Messages sent" value={activityData.messages_sent} testId="activity-stat-msgs" accent="bg-amber-50 text-amber-900" />
                    <StatCard icon={Users} label="Groups" value={activityData.conversations.filter((c) => c.type === "group").length} testId="activity-stat-groups" accent="bg-violet-50 text-violet-900" />
                  </div>
                  <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                      <h3 className="font-display font-semibold dark:text-gray-100">Conversations</h3>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {activityData.conversations.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => goToTab("chats", { selectedConv: c, mobileChatStep: "chat" })}
                          data-testid={`activity-conv-${c.id}`}
                          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 text-left"
                        >
                          <div className="flex -space-x-2">
                            {(c.participants_info || []).slice(0, 2).map((p) => (
                              <Avatar key={p.id} name={p.full_name} avatarUrl={p.avatar_url} online={onlineUsers[p.id]} size={32} />
                            ))}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate dark:text-gray-100">
                              {c.type === "group" ? c.name : (c.participants_info || []).map((p) => p.full_name).join(", ")}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.last_message || "No messages"}</div>
                          </div>
                          <Eye className="h-4 w-4 text-gray-400" />
                        </button>
                      ))}
                      {activityData.conversations.length === 0 && (
                        <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">No conversations yet.</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </main>
          </div>
        )}

        {tab === "accounts" && (
          <div className="p-4 sm:p-6 lg:p-10 overflow-y-auto space-y-6" data-testid="admin-accounts-pane">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-800 dark:text-emerald-300">Admin  |  Accounts</div>
                <h1 className="font-display text-2xl sm:text-3xl font-semibold mt-1 dark:text-gray-100">Create accounts</h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1">Provision employees and clients. Only authorised users may sign in.</p>
              </div>
              <Button
                className="rounded-full bg-emerald-900 hover:bg-emerald-950 self-start sm:self-auto"
                onClick={() =>
                  navigate(createAccountPath("admin"), {
                    state: { allowedRoles: ["employee", "client"], defaultRole: "client", backTo: "/admin/accounts" },
                  })
                }
                data-testid="accounts-create-btn"
              >
                <UserPlus className="h-4 w-4 mr-1.5" />
                New account
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl">
              <StatCard icon={Users} label="Total users" value={formatStatValue(stats?.total_users)} testId="accounts-stat-total" />
              <StatCard icon={Briefcase} label="Employees" value={formatStatValue(stats?.employees)} testId="accounts-stat-employees" accent="bg-amber-50 text-amber-900" />
              <StatCard icon={UserCircle2} label="Clients" value={formatStatValue(stats?.clients)} testId="accounts-stat-clients" accent="bg-sky-50 text-sky-900" />
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <h2 className="font-display font-semibold dark:text-gray-100">Recent accounts</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Most recently created accounts and the user who created them.</p>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {[...users]
                  .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
                  .slice(0, 12)
                  .map((u) => (
                    <div
                      key={u.id}
                      className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
                      data-testid={`accounts-recent-${u.id}`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar name={u.full_name} avatarUrl={u.avatar_url} status={u.status} size={36} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate dark:text-gray-100">{u.full_name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            @{u.username}  |  {u.phone_number || "no phone"}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                        Created {u.created_at ? new Date(u.created_at).toLocaleString() : "-"}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 hidden lg:block">
                        by {u.created_by ? (usersById[u.created_by]?.full_name || "Unknown") : <span className="italic">system</span>}
                      </div>
                      <Button size="sm" variant="outline" className="rounded-full self-start sm:self-auto" onClick={() => openUserDetail(u)} data-testid={`accounts-detail-${u.id}`}>
                        Details
                      </Button>
                    </div>
                  ))}
                {users.length === 0 && (
                  <div className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">No accounts yet.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "permissions" && (
          <div className="p-4 sm:p-6 lg:p-10 overflow-y-auto space-y-6" data-testid="admin-permissions-pane">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-800 dark:text-emerald-300">Admin  |  Permissions</div>
              <h1 className="font-display text-2xl sm:text-3xl font-semibold mt-1 dark:text-gray-100">Delegated permissions</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Grant trusted employees the ability to create client accounts. Revoke at any time.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Sensitive: changes take effect immediately.</span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {employees.length === 0 && (
                  <div className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">No employees yet.</div>
                )}
                {employees.map((e) => {
                  const granted = !!e.account_creation_access;
                  return (
                    <div key={e.id} className="px-4 sm:px-5 py-3 flex items-center gap-3" data-testid={`permissions-row-${e.id}`}>
                      <Avatar name={e.full_name} avatarUrl={e.avatar_url} status={e.status} online={onlineUsers[e.id]} size={40} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate dark:text-gray-100">{e.full_name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">@{e.username}  |  {e.phone_number || "no phone"}</div>
                      </div>
                      <span className={`hidden sm:inline text-[11px] px-2 py-1 rounded-full ${granted ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>
                        {granted ? "Can create clients" : "No creation access"}
                      </span>
                      <Switch
                        checked={granted}
                        onCheckedChange={(v) => togglePermission(e, !!v)}
                        disabled={permissionSavingId === e.id}
                        data-testid={`permissions-switch-${e.id}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === "inactive" && (
          <div className="p-4 sm:p-6 lg:p-10 overflow-y-auto space-y-6" data-testid="admin-inactive-pane">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300">Admin  |  Archive</div>
              <h1 className="font-display text-2xl sm:text-3xl font-semibold mt-1 dark:text-gray-100">Inactive clients</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Clients whose service period has ended. Their chats and batch
                history are preserved here - reactivate them whenever you want
                to grant access again.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              {(() => {
                const inactive = users.filter((u) => u.role === "client" && u.is_active === false);
                if (inactive.length === 0) {
                  return (
                    <div className="py-12 text-center text-sm text-gray-400 dark:text-gray-500" data-testid="inactive-empty">
                      No inactive clients right now.
                    </div>
                  );
                }
                return (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    {inactive.map((u) => (
                      <li
                        key={u.id}
                        className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
                        data-testid={`inactive-row-${u.id}`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar name={u.full_name} avatarUrl={u.avatar_url} size={40} />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate dark:text-gray-100">{u.full_name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              @{u.username}  |  <span className="font-mono">{u.phone_number || "-"}</span>
                            </div>
                            {u.inactive_at && (
                              <div className="text-[11px] text-rose-700 dark:text-rose-300 mt-0.5">
                                Deactivated {new Date(u.inactive_at).toLocaleString()}
                                {u.inactive_by && usersById[u.inactive_by] ? ` by ${usersById[u.inactive_by].full_name}` : ""}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full"
                            onClick={() => navigate(medicalPath("admin", u.id))}
                            data-testid={`inactive-medical-${u.id}`}
                          >
                            <Stethoscope className="h-3.5 w-3.5 mr-1" />
                            Medical
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full"
                            onClick={() => openUserDetail(u)}
                            data-testid={`inactive-details-${u.id}`}
                          >
                            Details
                          </Button>
                          <Button
                            size="sm"
                            className="rounded-full bg-emerald-900 hover:bg-emerald-950"
                            onClick={() => toggleActive(u, true)}
                            disabled={activeSavingId === u.id}
                            data-testid={`inactive-reactivate-${u.id}`}
                          >
                            <Power className="h-3.5 w-3.5 mr-1" />
                            Reactivate
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </div>
          </div>
        )}

        {tab === "complaints" && (
          <div className="p-4 sm:p-6 lg:p-10 overflow-y-auto space-y-6" data-testid="admin-complaints-pane">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300">Admin  |  Complaint box</div>
                <h1 className="font-display text-2xl sm:text-3xl font-semibold mt-1 dark:text-gray-100">Complaint box</h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1 max-w-xl">
                  Complaints raised by clients about their dietitians or the
                  service. Mark them solved once you've reached out and the
                  client confirms - they'll still see them in their history.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full self-start sm:self-auto"
                onClick={() => loadComplaints()}
                disabled={complaintsLoading}
                data-testid="complaints-refresh-btn"
              >
                {complaintsLoading
                  ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  : <RotateCcw className="h-4 w-4 mr-1.5" />}
                Refresh
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl">
              <StatCard icon={Inbox} label="Pending" value={formatStatValue(stats?.complaints_pending)} testId="complaints-stat-pending" accent="bg-rose-50 text-rose-900" />
              <StatCard icon={CheckCircle2} label="Solved" value={formatStatValue(stats?.complaints_solved)} testId="complaints-stat-solved" accent="bg-emerald-50 text-emerald-900" />
              <StatCard icon={Users} label="Active clients" value={formatStatValue(stats?.active_clients)} testId="complaints-stat-active" accent="bg-sky-50 text-sky-900" />
            </div>

            <div className="inline-flex rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden text-xs" data-testid="complaints-filter">
              {[
                { id: "pending", label: "Pending" },
                { id: "solved", label: "Solved" },
                { id: "all", label: "All" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setComplaintsFilter(opt.id)}
                  className={`px-4 py-1.5 ${
                    complaintsFilter === opt.id
                      ? "bg-emerald-900 text-white"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                  data-testid={`complaints-filter-${opt.id}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {complaintsLoading && complaints.length === 0 && (
                <div className="py-10 text-center text-sm text-gray-400 dark:text-gray-500" data-testid="complaints-loading">
                  Loading complaints...
                </div>
              )}
              {!complaintsLoading && complaints.length === 0 && (
                <div className="py-10 text-center text-sm text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl" data-testid="complaints-empty">
                  No complaints to show in this view.
                </div>
              )}
              {complaints.map((c) => (
                <ComplaintCard
                  key={c.id}
                  complaint={c}
                  saving={complaintSavingId === c.id}
                  onMarkSolved={(notes) => updateComplaintStatus(c, "solved", notes)}
                  onReopen={() => updateComplaintStatus(c, "pending", null)}
                />
              ))}
            </div>
          </div>
        )}

        {tab === "storage" && (
          <div className="p-4 sm:p-6 lg:p-10 overflow-y-auto space-y-6" data-testid="admin-storage-pane">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-800 dark:text-emerald-300">Admin  |  Storage</div>
                <h1 className="font-display text-2xl sm:text-3xl font-semibold mt-1 dark:text-gray-100">Storage & cleanup</h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
                  Database footprint (MongoDB) and chat uploads bucket (S3 <code className="text-xs">uploads/</code>).
                  Set <code className="text-xs">MONGO_STORAGE_QUOTA_BYTES</code> and <code className="text-xs">S3_STORAGE_QUOTA_BYTES</code> on the server to show free space.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full self-start"
                onClick={() => loadStorage()}
                disabled={storageLoading}
                data-testid="storage-refresh-btn"
              >
                {storageLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RotateCcw className="h-4 w-4 mr-1.5" />}
                Refresh
              </Button>
            </div>

            {storageLoading && !storage && (
              <div className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">Loading storage...</div>
            )}

            {storage && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
                <StorageMeter
                  title="Database (MongoDB)"
                  usedBytes={storage.database?.used_bytes}
                  quotaBytes={storage.database?.quota_bytes}
                  freeBytes={storage.database?.free_bytes}
                  percentUsed={storage.database?.percent_used}
                  subtitle={
                    storage.database?.error
                      ? storage.database.error
                      : `${formatStatValue(storage.database?.collections)} collections  |  ${formatStatValue(storage.database?.objects)} objects`
                  }
                  testId="storage-meter-db"
                />
                <StorageMeter
                  title="Object storage (S3)"
                  usedBytes={storage.object_storage?.used_bytes}
                  quotaBytes={storage.object_storage?.quota_bytes}
                  freeBytes={storage.object_storage?.free_bytes}
                  percentUsed={storage.object_storage?.percent_used}
                  subtitle={
                    storage.object_storage?.error
                      ? storage.object_storage.error
                      : (storage.object_storage?.configured
                        ? `${storage.object_storage?.object_count ?? 0} objects under ${storage.object_storage?.prefix || "uploads/"} in ${storage.object_storage?.bucket || "bucket"}`
                        : "S3 not configured - uploads are stored on the server disk (not counted here).")
                  }
                  testId="storage-meter-s3"
                />
              </div>
            )}

            <div className="rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 p-4 sm:p-6 space-y-4 max-w-4xl">
              <div className="flex items-center gap-2 text-rose-900 dark:text-rose-200 font-display font-semibold">
                <Trash2 className="h-5 w-5" />
                Free space - delete data
              </div>
              <p className="text-sm text-rose-900/90 dark:text-rose-200/90">
                Deleting a user removes their account, complaints, diet days, and chat they participated in (direct chats are removed entirely; in groups their messages are removed).
                Deleting a conversation removes all messages and S3 attachments for that thread.
              </p>
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                  Conversations (first 80 - use Monitor for full list)
                </div>
                <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                  {(allConvs || []).slice(0, 80).map((c) => (
                    <div key={c.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate dark:text-gray-100">
                          {c.type === "group" ? c.name : (c.participants_info || []).map((p) => p.full_name).join(", ")}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 font-mono truncate">{c.id}</div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-full shrink-0 text-rose-700 border-rose-200 dark:text-rose-300 dark:border-rose-800"
                        onClick={() => setDeleteConvTarget(c)}
                        data-testid={`storage-delete-conv-${c.id}`}
                      >
                        Delete
                      </Button>
                    </div>
                  ))}
                  {(!allConvs || allConvs.length === 0) && (
                    <div className="px-3 py-6 text-center text-xs text-gray-400">No conversations loaded.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "users" && (
          <div className="p-4 sm:p-6 lg:p-10 overflow-y-auto" data-testid="admin-users-pane">
            <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center justify-between gap-3">
                <h1 className="font-display text-2xl sm:text-3xl font-semibold dark:text-gray-100">Users</h1>
                <Button
                  className="rounded-full bg-emerald-900 hover:bg-emerald-950 sm:hidden"
                  onClick={() =>
                  navigate(createAccountPath("admin"), {
                    state: { allowedRoles: ["employee", "client"], defaultRole: "client", backTo: "/admin/accounts" },
                  })
                }
                  size="sm"
                  data-testid="users-create-account-btn-mobile"
                >
                  <UserPlus className="h-4 w-4 mr-1" /> New
                </Button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden text-xs w-full sm:w-auto" data-testid="users-role-filter">
                  {[
                    { id: "all", label: "All" },
                    { id: "employees", label: "Employees" },
                    { id: "clients", label: "Clients" },
                    { id: "inactive_clients", label: "Inactive Clients" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setUsersRoleFilter(opt.id)}
                      className={`px-3 py-1.5 flex-1 sm:flex-none whitespace-nowrap ${
                        usersRoleFilter === opt.id
                          ? "bg-emerald-900 text-white"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                      data-testid={`users-role-filter-${opt.id}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <Button
                  className="rounded-full bg-emerald-900 hover:bg-emerald-950 hidden sm:inline-flex"
                  onClick={() =>
                  navigate(createAccountPath("admin"), {
                    state: { allowedRoles: ["employee", "client"], defaultRole: "client", backTo: "/admin/accounts" },
                  })
                }
                  data-testid="users-create-account-btn"
                >
                  <UserPlus className="h-4 w-4 mr-1.5" />
                  New account
                </Button>
              </div>
            </div>
            <div className="md:hidden space-y-3">
              {users
                .filter(filterUsersForTab)
                .map((u) => (
                <div key={u.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4" data-testid={`admin-user-card-${u.id}`}>
                  <div className="flex items-center gap-3">
                    <Avatar name={u.full_name} avatarUrl={u.avatar_url} online={onlineUsers[u.id]} status={u.status} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate dark:text-gray-100">{u.full_name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">@{u.username}  |  {u.phone_number || "-"}</div>
                    </div>
                    <span className={`inline-flex text-[11px] px-2 py-1 rounded-full shrink-0 ${
                      u.role === "admin" ? "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
                      : u.role === "employee" ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200"
                      : "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200"
                    }`}>{u.role}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${onlineUsers[u.id] ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`} />
                      {onlineUsers[u.id] ? "Online" : "Offline"}  |  {u.status || "available"}
                    </span>
                    {u.role !== "admin" && (
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${
                          u.is_active === false
                            ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-500/30"
                            : "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30"
                        }`}
                      >
                        {u.is_active === false ? "Inactive" : "Active"}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="rounded-full" onClick={() => openUserDetail(u)} data-testid={`users-details-mobile-${u.id}`}>
                      Details
                    </Button>
                    {u.role === "client" && (
                      u.is_active === false ? (
                        <Button
                          size="sm"
                          className="rounded-full bg-emerald-900 hover:bg-emerald-950"
                          onClick={() => toggleActive(u, true)}
                          disabled={activeSavingId === u.id}
                          data-testid={`users-activate-mobile-${u.id}`}
                        >
                          Activate
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full text-rose-700 border-rose-200"
                          onClick={() => {
                            if (window.confirm(`Mark ${u.full_name} as inactive?`)) toggleActive(u, false);
                          }}
                          disabled={activeSavingId === u.id}
                          data-testid={`users-deactivate-mobile-${u.id}`}
                        >
                          Deactivate
                        </Button>
                      )
                    )}
                    {u.role !== "admin" && (
                      <Button size="sm" variant="outline" className="rounded-full" onClick={() => navigate(resetPasswordPath(u.id))} data-testid={`users-reset-mobile-${u.id}`}>
                        Reset
                      </Button>
                    )}
                    {u.id !== user.id && (
                      <Button size="sm" variant="outline" className="rounded-full" onClick={() => handleStartDirect(u)} data-testid={`users-chat-mobile-${u.id}`}>
                        Chat
                      </Button>
                    )}
                    {u.id !== user.id && (u.role !== "admin" || adminCount > 1) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full text-rose-700 border-rose-200 dark:text-rose-300 dark:border-rose-800"
                        onClick={() => setDeleteUserTarget(u)}
                        data-testid={`users-delete-mobile-${u.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {users.length === 0 && (<div className="py-8 text-center text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">No users yet.</div>)}
            </div>
            <div className="hidden md:block bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500 dark:text-gray-400 text-[10px] uppercase tracking-[0.2em]">
                  <tr>
                    <th className="text-left px-4 py-3">User</th>
                    <th className="text-left px-4 py-3">Phone</th>
                    <th className="text-left px-4 py-3">Role</th>
                    <th className="text-left px-4 py-3">Active</th>
                    <th className="text-left px-4 py-3">Presence</th>
                    <th className="text-left px-4 py-3">Created by</th>
                    <th className="text-left px-4 py-3">Joined</th>
                    <th className="text-left px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 dark:text-gray-200">
                  {users
                    .filter(filterUsersForTab)
                    .map((u) => (
                    <tr key={u.id} data-testid={`admin-user-row-${u.id}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.full_name} avatarUrl={u.avatar_url} online={onlineUsers[u.id]} status={u.status} size={36} />
                          <div>
                            <div className="font-medium dark:text-gray-100">{u.full_name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">@{u.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-mono text-xs">{u.phone_number || "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex text-xs px-2 py-1 rounded-full ${
                          u.role === "admin" ? "bg-amber-100 text-amber-900"
                          : u.role === "employee" ? "bg-emerald-100 text-emerald-900"
                          : "bg-sky-100 text-sky-900"
                        }`}>{u.role}</span>
                        {u.role === "employee" && u.account_creation_access && (
                          <span className="ml-1 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200" title="Can create client accounts">
                            <ShieldCheck className="h-3 w-3" /> creator
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.role === "admin" ? (
                          <span className="text-xs text-gray-400">-</span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${
                              u.is_active === false
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-emerald-50 text-emerald-800 border-emerald-200"
                            }`}
                            data-testid={`users-active-pill-${u.id}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${u.is_active === false ? "bg-rose-500" : "bg-emerald-500"}`} />
                            {u.is_active === false ? "Inactive" : "Active"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 text-xs">
                          <span className={`h-2 w-2 rounded-full ${onlineUsers[u.id] ? "bg-emerald-500" : "bg-gray-300"}`} />
                          {onlineUsers[u.id] ? "Online" : "Offline"}  |  {u.status || "available"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                        {u.created_by
                          ? (usersById[u.created_by]?.full_name || "Unknown")
                          : <span className="italic">system</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-2">
                          <Button size="sm" variant="outline" className="rounded-full" onClick={() => openUserDetail(u)} data-testid={`users-details-${u.id}`}>
                            Details
                          </Button>
                          {u.role === "client" && (
                            u.is_active === false ? (
                              <Button
                                size="sm"
                                className="rounded-full bg-emerald-900 hover:bg-emerald-950"
                                onClick={() => toggleActive(u, true)}
                                disabled={activeSavingId === u.id}
                                data-testid={`users-activate-${u.id}`}
                              >
                                <Power className="h-3.5 w-3.5 mr-1" />
                                Activate
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-full text-rose-700 border-rose-200 hover:bg-rose-50"
                                onClick={() => {
                                  if (window.confirm(`Mark ${u.full_name} as inactive? They will lose login access but their chats and batch history are preserved.`)) {
                                    toggleActive(u, false);
                                  }
                                }}
                                disabled={activeSavingId === u.id}
                                data-testid={`users-deactivate-${u.id}`}
                              >
                                <PowerOff className="h-3.5 w-3.5 mr-1" />
                                Deactivate
                              </Button>
                            )
                          )}
                          {u.role === "client" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full"
                              onClick={() => navigate(medicalPath("admin", u.id))}
                              data-testid={`users-medical-${u.id}`}
                            >
                              <Stethoscope className="h-3.5 w-3.5 mr-1" />
                              Medical
                            </Button>
                          )}
                          {u.role !== "admin" && (
                            <Button size="sm" variant="outline" className="rounded-full" onClick={() => navigate(resetPasswordPath(u.id))} data-testid={`users-reset-${u.id}`}>
                              <KeyRound className="h-3.5 w-3.5 mr-1" />
                              Reset
                            </Button>
                          )}
                          {u.id !== user.id && (
                            <Button size="sm" variant="outline" className="rounded-full" onClick={() => handleStartDirect(u)} data-testid={`users-chat-${u.id}`}>
                              Chat
                            </Button>
                          )}
                          {u.id !== user.id && (u.role !== "admin" || adminCount > 1) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full text-rose-700 border-rose-200 hover:bg-rose-50 dark:text-rose-300 dark:border-rose-800 dark:hover:bg-rose-950/40"
                              onClick={() => setDeleteUserTarget(u)}
                              data-testid={`users-delete-${u.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Delete
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (<tr><td colSpan={8} className="py-8 text-center text-gray-400 dark:text-gray-500">No users yet.</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!deleteUserTarget} onOpenChange={(v) => !v && !deleteBusy && setDeleteUserTarget(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md bg-white dark:bg-gray-950" data-testid="delete-user-dialog">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-100">Delete account permanently?</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              {deleteUserTarget ? (
                <>
                  This removes <span className="font-semibold text-gray-900 dark:text-gray-200">{deleteUserTarget.full_name}</span>
                  {" "}(@{deleteUserTarget.username}, {deleteUserTarget.phone_number || "no phone"}) and their data from the database,
                  and deletes matching files from S3 where possible. This cannot be undone.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setDeleteUserTarget(null)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button type="button" className="rounded-full bg-rose-600 hover:bg-rose-700" onClick={submitDeleteUser} disabled={deleteBusy} data-testid="delete-user-confirm">
              {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
              Delete account
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteConvTarget} onOpenChange={(v) => !v && !deleteBusy && setDeleteConvTarget(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md bg-white dark:bg-gray-950" data-testid="delete-conv-dialog">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-100">Delete entire conversation?</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              {deleteConvTarget ? (
                <>
                  All messages in this thread will be removed and media files deleted from object storage.
                  Conversation ID: <span className="font-mono text-xs">{deleteConvTarget.id}</span>
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setDeleteConvTarget(null)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button type="button" className="rounded-full bg-rose-600 hover:bg-rose-700" onClick={submitDeleteConversation} disabled={deleteBusy} data-testid="delete-conv-confirm">
              {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
              Delete chat
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <NewBatchDialog
        open={newBatchOpen}
        onOpenChange={setNewBatchOpen}
        employee={selectedEmployee}
        onCreated={() => {
          if (selectedEmployee) loadEmployeeBatches(selectedEmployee.id);
          loadOverview();
        }}
      />

      <MoveClientDialog
        open={!!moveClientTarget}
        onOpenChange={(v) => !v && setMoveClientTarget(null)}
        client={moveClientTarget}
        currentEmployeeId={moveClientTarget?.current_employee_id}
        currentBatchId={moveClientTarget?.current_batch_id}
        employees={employees}
        onMoved={() => {
          if (selectedEmployee) loadEmployeeBatches(selectedEmployee.id);
          loadOverview();
          loadEmployees();
        }}
      />
      </div>

      {/* Mobile "+" FAB for starting a new chat from My Chats list view.
          Sits above the bottom nav. Hidden once a chat is opened. */}
      {tab === "mychats" && mobileChatStep === "list" && (
        <button
          type="button"
          onClick={openNewConversation}
          data-testid="admin-mychats-fab"
          className="md:hidden fixed right-4 bottom-[calc(56px+env(safe-area-inset-bottom)+1rem)] h-12 w-12 rounded-full bg-emerald-900 hover:bg-emerald-950 text-white shadow-lg flex items-center justify-center z-30"
          title="New chat"
        >
          <Plus className="h-5 w-5" />
        </button>
      )}

      <ProfileQuickView
        open={!!quickView}
        name={quickView?.user?.full_name}
        avatarUrl={quickView?.user?.avatar_url}
        status={quickView?.user?.status}
        online={!!onlineUsers[quickView?.user?.id]}
        onClose={() => setQuickView(null)}
        onChat={() => {
          const c = quickView?.conv;
          setQuickView(null);
          if (c) {
            setListSelection(null);
            setSelected(c);
            setMobileChatStep("chat");
          }
        }}
        onInfo={() => {
          const { conv, user: u } = quickView || {};
          setQuickView(null);
          openUserProfile(u, conv);
        }}
      />

      {/* Mobile bottom nav (Flutter-style BottomNavigationBar) */}
      <div
        className={`md:hidden fixed bottom-0 left-0 right-0 z-20 flex items-stretch justify-around border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_rgba(0,0,0,0.06)] backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 dark:shadow-[0_-4px_18px_rgba(0,0,0,0.5)] ${mobileInChat ? "hidden" : ""}`}
        data-testid="admin-bottom-nav"
      >
        <BottomNavButton
          icon={LayoutDashboard}
          label="Home"
          active={tab === "overview"}
          onClick={() => goToTab("overview")}
          testId="admin-nav-mobile-home"
        />
        <BottomNavButton
          icon={MessageSquare}
          label="Chats"
          active={tab === "mychats"}
          badge={unreadTotal}
          onClick={() => goToTab("mychats", { mobileChatStep: "list" })}
          testId="admin-nav-mobile-chats"
        />
        <BottomNavButton
          icon={Users}
          label="Contacts"
          active={tab === "users"}
          onClick={() => goToTab("users")}
          testId="admin-nav-mobile-contacts"
        />
        <BottomNavButton
          icon={Settings}
          label="Settings"
          active={
            tab === "more" ||
            ["accounts", "permissions", "batches", "chats", "activity", "complaints", "storage", "inactive"].includes(tab)
          }
          onClick={() => goToTab("more")}
          testId="admin-nav-mobile-settings"
        />
      </div>
    </div>
  );
}

function NavButton({ icon: Icon, label, active, onClick, testId, badge }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors mb-1 ${
        active ? "bg-emerald-800/60 text-white" : "hover:bg-emerald-900 text-emerald-100"
      }`}
    >
      <span className="relative">
        <Icon className="h-5 w-5" strokeWidth={1.5} />
        {badge ? (
          <span
            className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-semibold flex items-center justify-center border border-emerald-950"
            data-testid={`${testId}-badge`}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
      <span className="hidden lg:inline text-sm font-medium">{label}</span>
    </button>
  );
}

function AdminMoreTile({ icon: Icon, title, subtitle, onClick, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex min-h-[88px] touch-manipulation flex-col items-start justify-center gap-1 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition active:scale-[0.98] dark:border-gray-800 dark:bg-gray-900"
    >
      <Icon className="h-5 w-5 text-emerald-800 dark:text-emerald-300" strokeWidth={1.5} />
      <span className="font-display text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</span>
      <span className="text-[11px] text-gray-500 dark:text-gray-400">{subtitle}</span>
    </button>
  );
}

function BottomNavButton({ icon: Icon, label, active, onClick, testId, badge = 0 }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex h-14 min-h-[56px] flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 select-none transition-transform active:scale-[0.97]"
    >
      <span
        className={`relative flex items-center justify-center h-7 w-12 rounded-full transition-colors ${
          active
            ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-300"
            : "text-gray-500 dark:text-gray-400"
        }`}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.7} />
        {badge > 0 ? (
          <span
            className="absolute -top-1 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-semibold flex items-center justify-center border-2 border-white dark:border-gray-950"
            data-testid={`${testId}-badge`}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
      <span
        className={`text-[10.5px] leading-none ${
          active
            ? "text-emerald-900 dark:text-emerald-300 font-semibold"
            : "text-gray-500 dark:text-gray-400 font-medium"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

function ComplaintCard({ complaint, saving, onMarkSolved, onReopen }) {
  const [notes, setNotes] = useState(complaint.resolution_notes || "");
  const [showResolveForm, setShowResolveForm] = useState(false);
  const isSolved = complaint.status === "solved";

  return (
    <div
      className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-5 space-y-3"
      data-testid={`complaint-card-${complaint.id}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar
            name={complaint.client?.full_name}
            avatarUrl={complaint.client?.avatar_url}
            size={40}
          />
          <div className="min-w-0">
            <div className="text-sm font-medium dark:text-gray-100 truncate">
              {complaint.client?.full_name || "Client"}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {complaint.client?.phone_number || "-"}
              {"  |  "}
              {complaint.created_at ? new Date(complaint.created_at).toLocaleString() : "-"}
            </div>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] px-2 py-1 rounded-full self-start ${
            isSolved
              ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200"
              : "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
          }`}
        >
          {isSolved
            ? <><CheckCircle2 className="h-3 w-3" /> Solved</>
            : <><Clock className="h-3 w-3" /> Pending</>}
        </span>
      </div>

      {complaint.employee && (
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 px-3 py-2">
          <Avatar
            name={complaint.employee.full_name}
            avatarUrl={complaint.employee.avatar_url}
            size={24}
          />
          <span>
            About dietitian <span className="font-medium dark:text-gray-100">{complaint.employee.full_name}</span>
          </span>
        </div>
      )}

      {Array.isArray(complaint.answers) && complaint.answers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {complaint.answers.map((a, i) => (
            <span
              key={`${complaint.id}-ans-${i}`}
              className="text-[11px] px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              title={a.question}
            >
              {a.answer}
            </span>
          ))}
        </div>
      )}

      <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
        {complaint.description}
      </p>

      {isSolved && complaint.resolution_notes && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-300">
            Resolution
          </div>
          <p className="text-sm text-emerald-900 dark:text-emerald-100 mt-1 whitespace-pre-wrap break-words">
            {complaint.resolution_notes}
          </p>
          {complaint.resolver?.full_name && (
            <div className="text-[11px] text-emerald-700 dark:text-emerald-200 mt-2">
              - {complaint.resolver.full_name}
              {complaint.resolved_at ? `  |  ${new Date(complaint.resolved_at).toLocaleString()}` : ""}
            </div>
          )}
        </div>
      )}

      {!isSolved && showResolveForm && (
        <div className="space-y-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Optional: note what you did to resolve this (visible to the client)."
            className="w-full text-sm rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 dark:text-gray-100 p-3 resize-none"
            data-testid={`complaint-resolve-notes-${complaint.id}`}
            maxLength={2000}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {isSolved ? (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={onReopen}
            disabled={saving}
            data-testid={`complaint-reopen-${complaint.id}`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
            Reopen
          </Button>
        ) : showResolveForm ? (
          <>
            <Button
              size="sm"
              className="rounded-full bg-emerald-900 hover:bg-emerald-950"
              onClick={() => onMarkSolved(notes.trim() || null)}
              disabled={saving}
              data-testid={`complaint-confirm-solve-${complaint.id}`}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Mark solved
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full"
              onClick={() => setShowResolveForm(false)}
              disabled={saving}
              data-testid={`complaint-cancel-solve-${complaint.id}`}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            className="rounded-full bg-emerald-900 hover:bg-emerald-950"
            onClick={() => setShowResolveForm(true)}
            disabled={saving}
            data-testid={`complaint-solve-${complaint.id}`}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Mark as solved
          </Button>
        )}
      </div>
    </div>
  );
}


function NewBatchDialog({ open, onOpenChange, employee, onCreated }) {
  const [name, setName] = useState("");
  const [maxClients, setMaxClients] = useState(20);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setMaxClients(20);
    }
  }, [open]);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!employee?.id) return toast.error("Pick an employee first");
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Batch name is required");
    setSaving(true);
    try {
      await api.post("/batches", {
        name: trimmed,
        employee_id: employee.id,
        max_clients: Number(maxClients) || 20,
      });
      toast.success("Batch created");
      onCreated?.();
      onOpenChange?.(false);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md p-4 sm:p-6 bg-white dark:bg-gray-950" data-testid="admin-new-batch-dialog">
        <DialogHeader>
          <DialogTitle className="font-display dark:text-gray-100">Create batch</DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            New batch for {employee?.full_name || "this employee"}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-gray-600 dark:text-gray-300" htmlFor="admin-new-batch-name">Batch name</label>
            <input
              id="admin-new-batch-name"
              data-testid="admin-new-batch-name"
              className="h-11 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Batch 1"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-gray-600 dark:text-gray-300" htmlFor="admin-new-batch-max">Max clients</label>
            <input
              id="admin-new-batch-max"
              data-testid="admin-new-batch-max"
              type="number"
              min={1}
              max={500}
              className="h-11 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 dark:text-gray-100 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              value={maxClients}
              onChange={(e) => setMaxClients(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            disabled={saving}
            className="w-full h-11 rounded-full bg-emerald-900 hover:bg-emerald-950"
            data-testid="admin-new-batch-submit"
          >
            {saving ? "Creating..." : "Create batch"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoveClientDialog({ open, onOpenChange, client, currentEmployeeId, currentBatchId, employees, onMoved }) {
  const [targetEmployee, setTargetEmployee] = useState("");
  const [targetBatch, setTargetBatch] = useState("");
  const [batches, setBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTargetEmployee("");
      setTargetBatch("");
      setBatches([]);
    }
  }, [open]);

  useEffect(() => {
    if (!targetEmployee) {
      setBatches([]);
      return;
    }
    setLoadingBatches(true);
    api.get(`/admin/employees/${targetEmployee}/batches`)
      .then((res) => setBatches(res.data?.batches || []))
      .catch((err) => toast.error(formatApiError(err)))
      .finally(() => setLoadingBatches(false));
  }, [targetEmployee]);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!client?.id) return;
    if (!targetEmployee) return toast.error("Pick a target employee");
    if (!targetBatch) return toast.error("Pick a target batch");
    if (targetEmployee === currentEmployeeId && targetBatch === currentBatchId) {
      return toast.error("Client is already in this batch");
    }
    setSaving(true);
    try {
      await api.post(`/admin/clients/${client.id}/assign`, {
        employee_id: targetEmployee,
        batch_id: targetBatch,
      });
      toast.success(`${client.full_name} moved successfully`);
      onMoved?.();
      onOpenChange?.(false);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  if (!client) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md p-4 sm:p-6 bg-white dark:bg-gray-950" data-testid="admin-move-client-dialog">
        <DialogHeader>
          <DialogTitle className="font-display dark:text-gray-100">Move client</DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            Reassign <span className="font-semibold">{client.full_name}</span> to another employee or batch.
            All chats and history follow them automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-gray-600 dark:text-gray-300">Target employee</label>
            <select
              value={targetEmployee}
              onChange={(e) => { setTargetEmployee(e.target.value); setTargetBatch(""); }}
              className="h-11 w-full rounded-xl border border-gray-200 dark:border-gray-700 px-3 bg-white dark:bg-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              data-testid="admin-move-employee-select"
            >
              <option value="">Select employee...</option>
              {(employees || []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}{e.id === currentEmployeeId ? " (current)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-gray-600 dark:text-gray-300">Target batch</label>
            <select
              value={targetBatch}
              onChange={(e) => setTargetBatch(e.target.value)}
              disabled={!targetEmployee || loadingBatches}
              className="h-11 w-full rounded-xl border border-gray-200 dark:border-gray-700 px-3 bg-white dark:bg-gray-900 dark:text-gray-100 disabled:bg-gray-50 dark:disabled:bg-gray-800/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              data-testid="admin-move-batch-select"
            >
              <option value="">
                {!targetEmployee ? "Pick an employee first" : loadingBatches ? "Loading..." : "Select batch..."}
              </option>
              {batches.map((b) => {
                const full = (b.client_count || 0) >= (b.max_clients || 20);
                const isCurrent = b.id === currentBatchId && targetEmployee === currentEmployeeId;
                return (
                  <option key={b.id} value={b.id} disabled={full && !isCurrent}>
                    {b.name} ({b.client_count || 0}/{b.max_clients || 20})
                    {full ? "  |  full" : ""}{isCurrent ? "  |  current" : ""}
                  </option>
                );
              })}
            </select>
          </div>
          <Button
            type="submit"
            disabled={saving}
            className="w-full h-11 rounded-full bg-emerald-900 hover:bg-emerald-950"
            data-testid="admin-move-client-submit"
          >
            <ArrowRightLeft className="h-4 w-4 mr-1.5" />
            {saving ? "Moving..." : "Move client"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
