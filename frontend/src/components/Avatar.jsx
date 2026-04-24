import React from "react";
import { fileUrl } from "@/lib/api";

const COLORS = [
  "bg-emerald-700", "bg-amber-600", "bg-rose-500", "bg-sky-600",
  "bg-violet-600", "bg-teal-600", "bg-fuchsia-600", "bg-indigo-600",
];

const STATUS_COLORS = {
  available: "bg-emerald-500",
  busy: "bg-rose-500",
  away: "bg-amber-500",
  dnd: "bg-gray-800",
};

function colorFor(key) {
  if (!key) return COLORS[0];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export default function Avatar({ name, online, status, size = 40, avatarUrl, testId }) {
  const initials = (name || "?")
    .split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const bg = colorFor(name);
  const statusColor = status && STATUS_COLORS[status];
  const showDot = typeof online === "boolean" || !!statusColor;
  const dotClass = statusColor || (online ? "bg-emerald-500" : "bg-gray-300");

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} data-testid={testId}>
      {avatarUrl ? (
        <img
          src={fileUrl(avatarUrl)}
          alt={name || "avatar"}
          className="rounded-full object-cover border-2 border-white shadow-sm"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className={`${bg} text-white rounded-full flex items-center justify-center font-medium`}
          style={{ width: size, height: size, fontSize: size * 0.38 }}
        >
          {initials}
        </div>
      )}
      {showDot && (
        <span
          className={`absolute bottom-0 right-0 block rounded-full border-2 border-white ${dotClass}`}
          style={{ width: Math.max(size * 0.3, 10), height: Math.max(size * 0.3, 10) }}
        />
      )}
    </div>
  );
}
