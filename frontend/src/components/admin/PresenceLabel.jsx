import React from "react";

/** Online/offline from socket presence only (ignores legacy status field). */
export default function PresenceLabel({ online, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2 text-xs ${className}`}>
      <span
        className={`h-2 w-2 rounded-full shrink-0 ${
          online ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
        }`}
      />
      {online ? "Online" : "Offline"}
    </span>
  );
}
