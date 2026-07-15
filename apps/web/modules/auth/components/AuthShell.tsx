"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import type React from "react";

export function ConvenioMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <path d="M4 5 Q 22 7, 26 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M4 27 Q 22 25, 26 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="26" cy="16" r="2.6" fill="currentColor" />
    </svg>
  );
}

/**
 * Convenio auth chrome: an inverted statement panel beside the form.
 * The panel is the brand voice; the form side stays quiet and functional.
 * bg-inverted/text-inverted flip with the theme, so light and dark are
 * mirror images per the brand spec.
 */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();

  return (
    <div className="bg-default flex min-h-screen">
      <aside className="bg-inverted relative hidden w-[44%] max-w-2xl flex-col justify-between p-12 lg:flex">
        <div className="text-inverted flex items-center gap-3">
          <ConvenioMark className="h-7 w-7" />
          <span className="font-cal text-lg tracking-tight">Convenio</span>
        </div>
        <div className="text-inverted">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] opacity-60">
            {t("auth_panel_eyebrow")}
          </p>
          <p className="font-cal mt-5 max-w-[12em] text-4xl leading-[1.05] xl:text-5xl">
            {t("auth_panel_statement")}
          </p>
        </div>
        <p className="text-inverted font-mono text-[11px] uppercase tracking-[0.18em] opacity-50">
          {t("auth_panel_etymology")}
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="text-emphasis mb-10 flex items-center gap-3 lg:hidden">
            <ConvenioMark className="h-7 w-7" />
            <span className="font-cal text-lg tracking-tight">Convenio</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
