import React, { useCallback, useRef } from "react";
import { MessageCircle, ChevronRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  APP_VERSION,
  APP_LAST_UPDATED,
  APP_NAME,
  APP_TAGLINE,
  DEVELOPER_NAME,
  DEVELOPER_ROLE,
  DEVELOPER_INITIALS,
  SUPPORT_EMAIL,
  PRIVACY_POLICY_URL,
  COMPANY_PRIMARY,
  COMPANY_PRIMARY_LIGHT,
} from "@/lib/appInfo";

const FEATURES = [
  { icon: "💬", label: "Real-time Chat with Assigned Professional" },
  { icon: "📁", label: "Shared Folders — Media, Documents & Links" },
  { icon: "🥗", label: "Daily Diet Photo Tracking" },
  { icon: "📊", label: "Progress Reports & PDF Downloads" },
  { icon: "🔔", label: "Instant Notifications" },
  { icon: "🔒", label: "Secure Single-Session Login" },
  { icon: "📋", label: "Complaint Management with Admin" },
];

function Divider() {
  return <div className="h-px w-full bg-[#E5E7EB] dark:bg-gray-800" />;
}

function SectionLabel({ children }) {
  return (
    <p
      className="text-[11px] font-bold uppercase tracking-[0.12em] text-left mb-2"
      style={{ color: COMPANY_PRIMARY }}
    >
      {children}
    </p>
  );
}

function FeatureRow({ icon, label, showDivider }) {
  return (
    <>
      <div
        className="flex min-h-[36px] items-center gap-3 py-2"
        data-testid="about-feature-row"
      >
        <span className="text-base shrink-0 w-6 text-center" aria-hidden>
          {icon}
        </span>
        <span className="text-[11px] text-[#1A1A2E] dark:text-gray-100 leading-snug flex-1">
          {label}
        </span>
      </div>
      {showDivider ? <Divider /> : null}
    </>
  );
}

function LinkRow({ icon: Icon, emoji, label, onClick, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full min-h-[36px] items-center gap-3 py-2 text-left touch-manipulation hover:bg-gray-50 dark:hover:bg-gray-900/50 rounded-lg -mx-1 px-1"
      data-testid={testId}
    >
      {emoji ? (
        <span className="text-base shrink-0 w-6 text-center" aria-hidden>{emoji}</span>
      ) : (
        <Icon className="h-4 w-4 shrink-0 text-[#6B7280]" strokeWidth={1.75} />
      )}
      <span className="text-[11px] text-[#1A1A2E] dark:text-gray-100 flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 text-[#9CA3AF] shrink-0" aria-hidden />
    </button>
  );
}

const SWIPE_CLOSE_PX = 72;

export default function AboutSheet({ open, onOpenChange }) {
  const scrollRef = useRef(null);
  const touchStartY = useRef(null);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const onDragTouchStart = (e) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  };

  const onDragTouchMove = (e) => {
    if (touchStartY.current == null) return;
    const y = e.touches[0]?.clientY ?? touchStartY.current;
    if (y - touchStartY.current > SWIPE_CLOSE_PX) {
      touchStartY.current = null;
      close();
    }
  };

  const onDragTouchEnd = (e) => {
    if (touchStartY.current != null) {
      const y = e.changedTouches[0]?.clientY ?? touchStartY.current;
      if (y - touchStartY.current > SWIPE_CLOSE_PX) close();
    }
    touchStartY.current = null;
  };

  const onContentTouchStart = (e) => {
    const el = scrollRef.current;
    if (!el || el.scrollTop > 4) return;
    touchStartY.current = e.touches[0]?.clientY ?? null;
  };

  const openPrivacy = () => {
    if (PRIVACY_POLICY_URL) {
      window.open(PRIVACY_POLICY_URL, "_blank", "noopener,noreferrer");
      return;
    }
    window.open(
      "https://www.chatflow.app/privacy",
      "_blank",
      "noopener,noreferrer",
    );
  };

  const openSupport = () => {
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`${APP_NAME} Support`)}`;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideClose
        className="rounded-t-[20px] border-0 bg-white p-0 max-h-[92vh] overflow-hidden flex flex-col dark:bg-gray-950"
        data-testid="about-sheet"
      >
        <SheetTitle className="sr-only">About {APP_NAME}</SheetTitle>
        <div
          className="shrink-0 flex flex-col items-center pt-3 pb-2 touch-none cursor-grab active:cursor-grabbing"
          onTouchStart={onDragTouchStart}
          onTouchMove={onDragTouchMove}
          onTouchEnd={onDragTouchEnd}
          onTouchCancel={onDragTouchEnd}
          role="button"
          tabIndex={0}
          aria-label="Swipe down to close"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") close();
          }}
          data-testid="about-sheet-drag-handle"
        >
          <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden />
          <span className="mt-2 text-[10px] text-[#9CA3AF] dark:text-gray-500">Swipe down to close</span>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-8"
          onTouchStart={onContentTouchStart}
          onTouchMove={onDragTouchMove}
          onTouchEnd={onDragTouchEnd}
          onTouchCancel={onDragTouchEnd}
        >
          {/* App identity */}
          <div className="flex flex-col items-center text-center pt-2 pb-6">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl text-white shadow-sm"
              style={{ backgroundColor: COMPANY_PRIMARY }}
            >
              <MessageCircle className="h-10 w-10" strokeWidth={1.4} />
            </div>
            <h2 className="mt-4 text-[20px] font-bold text-[#1A1A2E] dark:text-gray-100">
              {APP_NAME}
            </h2>
            <p className="mt-2 max-w-[280px] text-[13px] italic text-[#6B7280] dark:text-gray-400 leading-snug">
              {APP_TAGLINE}
            </p>
            <div
              className="mt-4 inline-flex items-center rounded-[20px] px-4 py-1.5 text-sm font-semibold"
              style={{ color: COMPANY_PRIMARY, backgroundColor: COMPANY_PRIMARY_LIGHT }}
            >
              Version {APP_VERSION}
            </div>
            <p className="mt-2 text-[9px] text-[#6B7280] dark:text-gray-500">
              Last updated: {APP_LAST_UPDATED}
            </p>
          </div>

          <Divider />

          <div className="py-5">
            <SectionLabel>About</SectionLabel>
            <p className="text-[11px] text-[#6B7280] dark:text-gray-400 leading-[1.6] text-left">
              This platform is designed to streamline health and wellness management by connecting
              clients with their assigned health professionals. It enables seamless communication,
              diet tracking, document sharing, progress monitoring, and personalized batch management
              — all in one place.
              <br />
              <br />
              Built with a focus on simplicity, security, and real-time performance to deliver the
              best experience for admins, employees, and clients.
            </p>
          </div>

          <Divider />

          <div className="py-5">
            <SectionLabel>What&apos;s Inside</SectionLabel>
            <div>
              {FEATURES.map((f, i) => (
                <FeatureRow
                  key={f.label}
                  icon={f.icon}
                  label={f.label}
                  showDivider={i < FEATURES.length - 1}
                />
              ))}
            </div>
          </div>

          <Divider />

          <div className="py-5 space-y-0">
            <p
              className="text-[11px] font-bold uppercase tracking-[0.12em] text-left mb-2"
              style={{ color: COMPANY_PRIMARY }}
            >
              Legal &amp; Support
            </p>
            <LinkRow
              emoji="📄"
              label="Privacy Policy"
              onClick={openPrivacy}
              testId="about-privacy"
            />
            <Divider />
            <LinkRow
              emoji="📩"
              label="Contact Support"
              onClick={openSupport}
              testId="about-support"
            />
          </div>

          <Divider />

          <div className="py-5 flex flex-col items-center text-center w-full">
            <p
              className="text-[11px] font-bold uppercase tracking-[0.12em] w-full mb-2"
              style={{ color: COMPANY_PRIMARY }}
            >
              Credits
            </p>
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full text-white text-sm font-bold"
              style={{ backgroundColor: COMPANY_PRIMARY }}
              aria-hidden
            >
              {DEVELOPER_INITIALS}
            </div>
            <p className="mt-3 text-[10px] text-[#6B7280] dark:text-gray-400">
              Designed &amp; Developed by
            </p>
            <p className="mt-1 text-[16px] font-bold text-[#1A1A2E] dark:text-gray-100">
              {DEVELOPER_NAME}
            </p>
            <p className="mt-0.5 text-[10px] text-[#6B7280] dark:text-gray-400">
              {DEVELOPER_ROLE}
            </p>
          </div>

          <div className="pt-4 pb-2 text-center">
            <p className="text-[9px] text-[#6B7280] dark:text-gray-500">
              © 2025 {DEVELOPER_NAME}. All rights reserved.
            </p>
            <p className="mt-2 text-[8px] text-[#6B7280] dark:text-gray-500">
              Made with ❤️ for better health journeys
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
