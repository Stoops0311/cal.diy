"use client";

import { useCurrentAuthActions } from "@calcom/features/auth/lib/useCurrentAuthActions";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import classNames from "classnames";
import { Children, type ReactNode } from "react";
import { Toaster } from "sonner";
import { ConvenioMark } from "../../auth/components/AuthShell";

type OnboardingLayoutProps = {
  userEmail: string;
  currentStep?: number;
  totalSteps?: number;
  children: ReactNode;
};

export const OnboardingLayout = ({ userEmail, currentStep, totalSteps, children }: OnboardingLayoutProps) => {
  const { signOut } = useCurrentAuthActions();
  const { t } = useLocale();

  const handleSignOut = () => {
    signOut({ redirectUrl: "/auth/logout" });
  };

  // Extract children as array
  const childrenArray = Children.toArray(children);
  const column1 = childrenArray[0];
  const column2 = childrenArray[1];

  return (
    <div className="bg-cal-muted flex min-h-screen w-full flex-col items-center justify-between overflow-clip rounded-[12px] px-4 py-2 md:px-6">
      {/* Wordmark and container - centered */}
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-6">
        <div className="text-emphasis mt-4 flex shrink-0 items-center gap-2.5">
          <ConvenioMark className="h-6 w-6" />
          <span className="font-cal text-base tracking-tight">Convenio</span>
        </div>
        <div className="border-subtle bg-default grid max-h-[690px] min-h-0 w-full max-w-[532px] flex-1 grid-cols-1 gap-12 overflow-auto rounded-2xl border px-4 py-2 sm:px-12 sm:py-10 xl:h-[690px] xl:max-w-[1130px] xl:grid-cols-[40%_1fr] xl:pl-10 xl:pr-0">
          {/* Column 1 - Always visible, 40% on xl+ */}
          <div className="flex h-full min-h-0 flex-col">{column1}</div>
          {/* Column 2 - Hidden on mobile, visible on xl+, 60% on xl+ */}
          {column2 && (
            <div className="hidden h-full max-h-full min-h-0 flex-col overflow-hidden xl:flex">{column2}</div>
          )}
        </div>
      </div>

      {/* Footer with progress dots and sign out */}
      <div className="flex w-full flex-col items-center justify-center gap-4 px-10 py-8">
        <div className="flex min-h-[6px] items-center gap-3 font-mono text-[11px] tracking-[0.14em]">
          {totalSteps && totalSteps > 0 ? (
            Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => {
              const isCurrent = step === currentStep;
              const isPast = currentStep !== undefined && step < currentStep;

              return (
                <span
                  key={step}
                  className={classNames("shrink-0 transition-colors", {
                    "text-emphasis": isCurrent,
                    "text-subtle": isPast,
                    "text-muted opacity-70": !isCurrent && !isPast,
                  })}
                  aria-label={t("step_of", { step, total: totalSteps })}>
                  {String(step).padStart(2, "0")}
                </span>
              );
            })
          ) : (
            <div className="h-[6px]" aria-hidden="true" />
          )}
        </div>
        <Button onClick={handleSignOut} color="minimal" className="text-subtle h-7">
          {t("sign_out")}
        </Button>
        <p className="text-muted font-mono text-[10px] uppercase tracking-[0.18em]">
          {t("auth_panel_etymology")}
        </p>
      </div>
      <Toaster position="bottom-right" />
    </div>
  );
};
