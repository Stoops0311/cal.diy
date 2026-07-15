"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { ReactNode } from "react";
import { Toaster } from "sonner";

type SetupShellProps = {
  logo: ReactNode;
  name: string;
  description?: ReactNode;
  children: ReactNode;
};

export default function SetupShell({ logo, name, description, children }: SetupShellProps) {
  const { t } = useLocale();

  return (
    <div className="bg-default min-h-screen px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto w-full max-w-xl">
        {logo}
        <p className="font-mono text-subtle mt-6 text-[11px] uppercase tracking-[0.18em]">{t("install")}</p>
        <h1 className="font-cal text-emphasis mt-1 text-3xl font-bold tracking-tight">{name}</h1>
        {description ? (
          <div className="text-subtle mt-2 max-w-prose text-sm leading-6">{description}</div>
        ) : null}
        <div className="border-subtle mt-6 border-b" />
        <div className="mt-6">{children}</div>
      </div>
      <Toaster position="bottom-right" />
    </div>
  );
}
