import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, Image as ImageIcon, Loader2, Video } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { categorizeSharedMessages } from "@/lib/sharedMedia";
import { toast } from "sonner";

const TABS = [
  { id: "media", label: "Media" },
  { id: "documents", label: "Documents" },
  { id: "links", label: "Links" },
];

export default function SharedMediaSection({ profileUserId, title = "Shared Media" }) {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("media");
  const [categorized, setCategorized] = useState({ media: [], documents: [], links: [] });

  const load = useCallback(async () => {
    if (!profileUserId) return;
    setLoading(true);
    try {
      const start = await api.post("/conversations/start", { other_user_id: profileUserId });
      const convId = start.data?.conversation?.id;
      if (!convId) {
        setCategorized({ media: [], documents: [], links: [] });
        return;
      }
      const res = await api.get(`/conversations/${convId}/messages`);
      setCategorized(categorizeSharedMessages(res.data));
    } catch (err) {
      toast.error(formatApiError(err));
      setCategorized({ media: [], documents: [], links: [] });
    } finally {
      setLoading(false);
    }
  }, [profileUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      media: categorized.media.length,
      documents: categorized.documents.length,
      links: categorized.links.length,
    }),
    [categorized],
  );

  const items = tab === "media" ? categorized.media
    : tab === "documents" ? categorized.documents
    : categorized.links;

  return (
    <section className="mt-6 space-y-3" data-testid="shared-media-section">
      <h2 className="font-display text-base font-semibold dark:text-gray-100">{title}</h2>
      <div className="flex gap-1 overflow-x-auto rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            data-testid={`shared-media-tab-${t.id}`}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.id
                ? "bg-emerald-900 text-white"
                : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            {t.label}
            <span className="ml-1 opacity-70">({counts[t.id]})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-8 flex items-center justify-center text-gray-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Scanning chat history…
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
          No {tab} shared in this conversation yet.
        </p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
          {tab === "media" && items.map((m) => (
            <a
              key={m.id}
              href={m.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-900/50"
            >
              {m.message_type === "video" ? (
                <Video className="h-5 w-5 text-rose-600 shrink-0" />
              ) : (
                <ImageIcon className="h-5 w-5 text-violet-600 shrink-0" />
              )}
              <span className="text-sm truncate dark:text-gray-200">{m.file_name || m.message_type}</span>
            </a>
          ))}
          {tab === "documents" && items.map((m) => (
            <a
              key={m.id}
              href={m.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-900/50"
            >
              <FileText className="h-5 w-5 text-sky-600 shrink-0" />
              <span className="text-sm truncate dark:text-gray-200">{m.file_name || "Document"}</span>
            </a>
          ))}
          {tab === "links" && items.map((m) => (
            <div key={m.id} className="px-3 py-2 space-y-1">
              {(m.urls || []).map((url) => (
                <a
                  key={`${m.id}-${url}`}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300 hover:underline break-all"
                >
                  <ExternalLink className="h-4 w-4 shrink-0" />
                  {url}
                </a>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
