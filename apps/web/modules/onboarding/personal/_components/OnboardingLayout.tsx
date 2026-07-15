"use client";

import { useCurrentAuthActions } from "@calcom/features/auth/lib/useCurrentAuthActions";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import type { ReactNode } from "react";
import { ConvenioMark } from "../../../auth/components/AuthShell";

type OnboardingLayoutProps = {
  userEmail: string;
  currentStep: 1 | 2 | 3 | 4;
  children: ReactNode;
};

export const OnboardingLayout = ({ userEmail, currentStep, children }: OnboardingLayoutProps) => {
  const { signOut } = useCurrentAuthActions();
  const { t } = useLocale();

  const handleSignOut = () => {
    signOut({ redirectUrl: "/auth/logout" });
  };

  return (
    <div className="bg-default flex min-h-screen w-full flex-col items-start overflow-clip rounded-xl">
      {/* Header */}
      <div className="flex w-full items-center justify-between px-6 py-4">
        <div className="text-emphasis flex items-center gap-2.5">
          <ConvenioMark className="h-6 w-6" />
          <span className="font-cal text-base tracking-tight">Convenio</span>
        </div>

        {/* Numbered progress — mono, the sequence carries the information */}
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center justify-center gap-3 font-mono text-[11px] tracking-[0.14em]">
          {[1, 2, 3, 4].map((step) => (
            <span
              key={step}
              aria-label={t("step_of", { step, total: 4 })}
              className={
                step === currentStep ? "text-emphasis" : step < currentStep ? "text-subtle" : "text-muted"
              }>
              {String(step).padStart(2, "0")}
            </span>
          ))}
        </div>

        <div className="bg-cal-muted flex items-center gap-2 rounded-full px-3 py-2">
          <p className="text-emphasis text-sm font-medium leading-none">{userEmail}</p>
        </div>
      </div>

      {/* Main content */}
      <div className="flex w-full flex-1 items-start justify-center px-6 py-8">
        <div className="flex w-full max-w-[600px] flex-col gap-4">{children}</div>
      </div>

      {/* Footer with signout button */}
      <div className="flex w-full items-center justify-center px-6 py-6">
        <Button onClick={handleSignOut} color="minimal">
          {t("sign_out")}
        </Button>
      </div>
    </div>
  );
};
