import React from "react";

const stroke = 1.75;

export function IconEmoji({ className = "h-6 w-6" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={stroke} />
      <path d="M8.5 14.5c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="15" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}

export function IconAttach({ className = "h-6 w-6" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth={stroke + 0.25}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconCamera({ className = "h-6 w-6" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 8.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.5l-2.2-2.4A2 2 0 0 0 15.9 5H8.1a2 2 0 0 0-1.3.5L4 8.5Z"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.25" stroke="currentColor" strokeWidth={stroke} />
    </svg>
  );
}

export function IconMic({ className = "h-6 w-6" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="4" width="6" height="11" rx="3" stroke="currentColor" strokeWidth={stroke} />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v3" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
    </svg>
  );
}

export function IconSend({ className = "h-5 w-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3.4 20.6 21 12 3.4 3.4l2.8 7.2L17 12l-10.8 1.4-2.8 7.2Z" />
    </svg>
  );
}

export function IconPlay({ className = "h-6 w-6" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.8v12.4c0 .9 1 .4 1.6-.1l8.2-6.1c.5-.4.5-1.2 0-1.6L9.6 5.9c-.6-.5-1.6 0-1.6.9Z" />
    </svg>
  );
}

export function IconPdf({ className = "h-8 w-8" }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="6" fill="#E53935" />
      <text x="16" y="20" textAnchor="middle" fill="white" fontSize="9" fontWeight="700" fontFamily="system-ui,sans-serif">
        PDF
      </text>
    </svg>
  );
}

export function IconDoc({ className = "h-8 w-8" }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="6" fill="#5C6BC0" />
      <path d="M10 8h8l4 4v12H10V8Z" fill="white" fillOpacity="0.9" />
    </svg>
  );
}
