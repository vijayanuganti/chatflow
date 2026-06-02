import React from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMPANY_PRIMARY } from "@/lib/appInfo";
import {
  PRIVACY_POLICY_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
  PRIVACY_POLICY_FOOTER,
} from "@/lib/privacyPolicyContent";

function SectionDivider() {
  return <div className="my-6 h-px w-full bg-[#E5E7EB]" aria-hidden />;
}

function DashList({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="mt-2 space-y-1.5 list-none p-0 m-0">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-[14px] text-[#1A1A2E] leading-[1.6]">
          <span className="shrink-0 text-[#6B7280]" aria-hidden>
            -
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SectionBlock({ section, showDivider }) {
  const heading = (
    <h2
      className="text-[13px] font-bold leading-snug"
      style={{ color: COMPANY_PRIMARY }}
    >
      {section.number}. {section.title}
    </h2>
  );

  return (
    <section data-testid={`privacy-section-${section.number}`}>
      {showDivider ? <SectionDivider /> : null}
      {heading}

      {section.paragraphs?.map((p) => (
        <p key={p} className="mt-3 text-[14px] text-[#1A1A2E] leading-[1.6]">
          {p}
        </p>
      ))}

      {section.intro ? (
        <p className="mt-3 text-[14px] text-[#1A1A2E] leading-[1.6]">{section.intro}</p>
      ) : null}

      {section.bullets ? <DashList items={section.bullets} /> : null}

      {section.outro ? (
        <p className="mt-4 text-[14px] text-[#1A1A2E] leading-[1.6]">{section.outro}</p>
      ) : null}

      {section.bulletsAfter ? <DashList items={section.bulletsAfter} /> : null}

      {section.bulletGroups?.map((group) => (
        <div key={group.intro} className="mt-3">
          <p className="text-[14px] text-[#1A1A2E] leading-[1.6]">{group.intro}</p>
          <DashList items={group.bullets} />
        </div>
      ))}

      {section.subsections?.map((sub) => (
        <div key={sub.label} className="mt-4">
          <p className="text-[13px] font-bold text-[#6B7280]">{sub.label}</p>
          <DashList items={sub.bullets} />
        </div>
      ))}
    </section>
  );
}

/**
 * Full-screen in-app Privacy Policy (portal). Back returns to About.
 */
export default function PrivacyPolicyScreen({ onBack }) {
  const content = (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-white"
      data-testid="privacy-policy-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-policy-title"
    >
      <header
        className="shrink-0 border-b border-[#E5E7EB] bg-white pt-[max(env(safe-area-inset-top,0px),12px)]"
      >
        <div className="flex min-h-[52px] items-center gap-1 px-2 pb-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full touch-manipulation"
            onClick={onBack}
            aria-label="Back to About"
            data-testid="privacy-policy-back"
          >
            <ArrowLeft className="h-5 w-5 text-[#1A1A2E]" strokeWidth={1.75} />
          </Button>
          <h1
            id="privacy-policy-title"
            className="flex-1 text-center text-[17px] font-bold text-[#1A1A2E] pr-11"
          >
            Privacy Policy
          </h1>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain scroll-smooth">
        <div className="px-5 pt-6 pb-[40px]">
          <p
            className="text-[13px] font-bold uppercase tracking-wide"
            style={{ color: COMPANY_PRIMARY }}
          >
            Privacy Policy
          </p>
          <p className="mt-2 text-[14px] text-[#6B7280] leading-[1.6]">
            Last updated: {PRIVACY_POLICY_LAST_UPDATED}
          </p>

          {PRIVACY_POLICY_SECTIONS.map((section, index) => (
            <SectionBlock
              key={section.number}
              section={section}
              showDivider={index > 0}
            />
          ))}

          <SectionDivider />

          <footer className="text-center space-y-2 pb-10">
            <p className="text-[14px] text-[#6B7280] leading-[1.6]">
              {PRIVACY_POLICY_FOOTER.credit}
            </p>
            <p className="text-[13px] text-[#9CA3AF]">{PRIVACY_POLICY_FOOTER.copyright}</p>
          </footer>
        </div>
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(content, document.body);
  }
  return content;
}
