import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Laptop, Smartphone, Tablet, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

function DeviceIcon({ deviceName }) {
  const name = (deviceName || "").toLowerCase();
  if (name.includes("android") || name.includes("iphone") || name.includes("ios") || name.includes("mobile app")) {
    return <Smartphone className="h-5 w-5 text-emerald-700 dark:text-emerald-300 shrink-0" strokeWidth={1.75} />;
  }
  if (name.includes("ipad") || name.includes("tablet")) {
    return <Tablet className="h-5 w-5 text-emerald-700 dark:text-emerald-300 shrink-0" strokeWidth={1.75} />;
  }
  if (name.includes("windows") || name.includes("mac") || name.includes("linux") || name.includes("chrome") || name.includes("firefox") || name.includes("edge") || name.includes("safari")) {
    return <Laptop className="h-5 w-5 text-emerald-700 dark:text-emerald-300 shrink-0" strokeWidth={1.75} />;
  }
  return <Monitor className="h-5 w-5 text-emerald-700 dark:text-emerald-300 shrink-0" strokeWidth={1.75} />;
}

function formatSessionDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function LoginHistorySection() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/auth/login-history");
      setSessions(res.data?.sessions || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const revokeSession = async (sessionId) => {
    setRevokingId(sessionId);
    try {
      await api.post(`/auth/sessions/${sessionId}/revoke`);
      toast.success("Session signed out");
      await loadSessions();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <section className="space-y-3" data-testid="login-history-section">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Login history</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Devices that have signed in to your account. Only one active session is allowed at a time.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-6 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-2">No sign-in history yet.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="session-card flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
              data-testid={`session-card-${session.id}`}
            >
              <DeviceIcon deviceName={session.device_name} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                  {session.device_name || "Unknown device"}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {session.location || "Unknown location"} · {formatSessionDate(session.last_active || session.created_at)}
                </p>
              </div>
              {session.is_current ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium shrink-0">
                  This device
                </span>
              ) : session.is_active ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0 h-8 px-2"
                  disabled={revokingId === session.id}
                  onClick={() => void revokeSession(session.id)}
                  data-testid={`revoke-session-${session.id}`}
                >
                  {revokingId === session.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Log out"}
                </Button>
              ) : (
                <span className="text-[10px] text-gray-400 shrink-0">Ended</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
