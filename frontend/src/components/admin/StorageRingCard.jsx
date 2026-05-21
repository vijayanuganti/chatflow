import React, { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

const COMPANY_PRIMARY = "#064e3b";
const RING_FREE = "#E5E7EB";
const WARN_AMBER = "#F59E0B";
const WARN_RED = "#DC2626";

export function formatStorageBytes(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  if (v < 1024) return `${Math.round(v)} B`;
  if (v < 1024 ** 2) {
    const kb = v / 1024;
    return Number.isInteger(kb) ? `${kb} KB` : `${kb.toFixed(1)} KB`;
  }
  if (v < 1024 ** 3) {
    const mb = v / 1024 ** 2;
    return Math.abs(mb - Math.round(mb)) < 0.05 ? `${Math.round(mb)} MB` : `${mb.toFixed(2)} MB`;
  }
  const gb = v / 1024 ** 3;
  return Math.abs(gb - Math.round(gb)) < 0.05 ? `${Math.round(gb)} GB` : `${gb.toFixed(2)} GB`;
}

function formatUpdatedTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return null;
  }
}

function usageLevel(percent) {
  if (percent == null || Number.isNaN(percent)) return "normal";
  if (percent >= 90) return "critical";
  if (percent >= 75) return "warning";
  return "normal";
}

function usedRingColor(level) {
  if (level === "critical") return WARN_RED;
  if (level === "warning") return WARN_AMBER;
  return COMPANY_PRIMARY;
}

/**
 * SVG donut ring (stroke only), animated on load.
 */
function StorageRing({ percent, usedColor, size = 160, strokeWidth = 16, className = "" }) {
  const [animatedPct, setAnimatedPct] = useState(0);
  const target = percent != null ? Math.min(100, Math.max(0, percent)) : 0;

  useEffect(() => {
    setAnimatedPct(0);
    const t = window.setTimeout(() => setAnimatedPct(target), 40);
    return () => window.clearTimeout(t);
  }, [target]);

  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - animatedPct / 100);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={percent != null ? `${Math.round(percent)}% storage used` : "Storage usage"}
    >
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={RING_FREE}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={usedColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 600ms ease-in-out" }}
      />
    </svg>
  );
}

function DetailRow({ label, value, dotColor }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-[#E5E7EB] dark:border-gray-800 last:border-0">
      <span className="text-[9px] uppercase tracking-[0.14em] text-[#6B7280] dark:text-gray-400">{label}</span>
      <span className="inline-flex items-center gap-2 text-[10px] font-semibold text-[#1A1A2E] dark:text-gray-100">
        {dotColor ? (
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: dotColor }}
            aria-hidden
          />
        ) : null}
        {value}
      </span>
    </div>
  );
}

export default function StorageRingCard({
  title,
  subtitle,
  icon: Icon,
  usedBytes,
  quotaBytes,
  totalLabel,
  freeBytes,
  percentUsed,
  error,
  metaLine,
  lastUpdated,
  onRefresh,
  refreshing = false,
  testId = "storage-ring-card",
}) {
  const [ringSize, setRingSize] = useState(160);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setRingSize(mq.matches ? 120 : 160);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const level = usageLevel(percentUsed);
  const usedColor = usedRingColor(level);
  const strokeWidth = ringSize >= 160 ? 16 : 12;

  const centerLabel = useMemo(() => {
    if (percentUsed != null) return `${Math.round(percentUsed)}%`;
    if (usedBytes != null) return formatStorageBytes(usedBytes);
    return "—";
  }, [percentUsed, usedBytes]);

  const warningText =
    level === "critical"
      ? "⚠ Storage almost full"
      : level === "warning"
        ? "Storage filling up"
        : null;

  const cardBorder =
    level === "critical"
      ? "border-[#DC2626]"
      : "border-[#E5E7EB] dark:border-gray-800";

  return (
    <div
      className={`rounded-xl border bg-white dark:bg-gray-900 p-6 ${cardBorder}`}
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon ? (
            <Icon className="h-5 w-5 shrink-0 text-[#064e3b] dark:text-emerald-400" strokeWidth={2} />
          ) : null}
          <div className="min-w-0">
            <span className="font-semibold text-[13px] text-[#1A1A2E] dark:text-gray-100 truncate block">{title}</span>
            {subtitle ? (
              <span className="text-[10px] text-[#6B7280] dark:text-gray-400 truncate block">
                Storage capacity: {subtitle}
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="shrink-0 p-1.5 text-[#6B7280] hover:text-[#1A1A2E] dark:text-gray-400 dark:hover:text-gray-200 rounded-md disabled:opacity-50"
          aria-label={`Refresh ${title}`}
          data-testid={`${testId}-refresh`}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-rose-700 dark:text-rose-300 mb-4">{error}</p>
      ) : null}

      <div className="flex flex-col items-center">
        <div
          className="relative flex items-center justify-center"
          style={{ width: ringSize, height: ringSize }}
        >
          <StorageRing
            percent={percentUsed ?? 0}
            usedColor={usedColor}
            size={ringSize}
            strokeWidth={strokeWidth}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span
              className="font-bold text-[22px] leading-none"
              style={{ color: percentUsed != null ? usedColor : COMPANY_PRIMARY }}
            >
              {centerLabel}
            </span>
            <span className="text-[9px] text-[#6B7280] dark:text-gray-400 mt-1">
              {percentUsed != null ? "Used" : "Used (no quota)"}
            </span>
          </div>
        </div>

        {warningText ? (
          <p
            className={`mt-3 text-[9px] font-medium ${
              level === "critical" ? "text-[#DC2626]" : "text-[#F59E0B]"
            }`}
            data-testid={`${testId}-warning`}
          >
            {warningText}
          </p>
        ) : (
          <div className="mt-3 h-[14px]" />
        )}

        <div className="w-full mt-4 max-w-[240px]">
          <DetailRow
            label="Total"
            value={
              totalLabel
              || (quotaBytes != null ? formatStorageBytes(quotaBytes) : "—")
            }
          />
          <DetailRow
            label="Used"
            value={formatStorageBytes(usedBytes)}
            dotColor={usedColor}
          />
          <DetailRow
            label="Free"
            value={freeBytes != null ? formatStorageBytes(freeBytes) : "—"}
            dotColor={RING_FREE}
          />
        </div>

        {metaLine ? (
          <p className="text-[10px] text-[#6B7280] dark:text-gray-400 mt-3 text-center">{metaLine}</p>
        ) : null}

        {lastUpdated ? (
          <p className="text-[8px] text-[#6B7280] dark:text-gray-500 mt-2">
            Last updated: {formatUpdatedTime(lastUpdated) || "—"}
          </p>
        ) : null}
      </div>
    </div>
  );
}
