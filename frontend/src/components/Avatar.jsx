import React, { useEffect, useState } from "react";
import { fileUrl } from "@/lib/api";

const COLORS = [
  "bg-emerald-700", "bg-amber-600", "bg-rose-500", "bg-sky-600",
  "bg-violet-600", "bg-teal-600", "bg-fuchsia-600", "bg-indigo-600",
];

function colorFor(key) {
  if (!key) return COLORS[0];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function avatarInitials(name) {
  return (name || "?")
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Renders profile photo when `avatarUrl` is set, otherwise initials.
 * Extra props (`online`, `status`) from callers are ignored — no presence dot.
 */
export default function Avatar({
  name,
  size = 40,
  avatarUrl,
  testId,
  variant = "default",
  className = "",
  imageClassName = "",
  fallbackClassName = "",
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = avatarInitials(name);
  const bg = colorFor(name);
  const src = avatarUrl ? fileUrl(avatarUrl) : "";
  const showImage = Boolean(src) && !imgFailed;

  useEffect(() => {
    setImgFailed(false);
  }, [avatarUrl, src]);

  const imageBorder =
    variant === "dark"
      ? "border-2 border-emerald-950/70"
      : "border-2 border-white shadow-sm dark:border-gray-800";

  return (
    <div
      className={`relative shrink-0 ${className}`.trim()}
      style={{ width: size, height: size }}
      data-testid={testId}
    >
      {showImage ? (
        <img
          src={src}
          alt={name || "avatar"}
          className={`rounded-full object-cover ${imageBorder} ${imageClassName}`.trim()}
          style={{ width: size, height: size }}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div
          className={`${bg} text-white rounded-full flex items-center justify-center font-medium ${fallbackClassName}`.trim()}
          style={{ width: size, height: size, fontSize: size * 0.38 }}
        >
          {initials}
        </div>
      )}
    </div>
  );
}
