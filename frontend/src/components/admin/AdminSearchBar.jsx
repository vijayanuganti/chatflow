import React from "react";
import { Search, X } from "lucide-react";

/**
 * Consistent admin panel search input (40px, flat, emerald focus ring via border).
 */
export default function AdminSearchBar({
  value,
  onChange,
  placeholder,
  testId = "admin-search",
  className = "",
}) {
  const hasText = Boolean((value || "").length);

  return (
    <div className={`relative h-10 w-full ${className}`} data-testid={testId}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white pl-9 pr-9 text-sm text-[#1A1A2E] placeholder:text-[#6B7280] focus:border-[#064e3b] focus:outline-none focus:ring-0 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-emerald-600"
        data-testid={`${testId}-input`}
        aria-label={placeholder}
      />
      {hasText ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#6B7280] hover:bg-gray-100 hover:text-[#1A1A2E] dark:hover:bg-gray-800 dark:hover:text-gray-200"
          aria-label="Clear search"
          data-testid={`${testId}-clear`}
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
