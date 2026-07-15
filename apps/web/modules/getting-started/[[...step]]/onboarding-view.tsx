"use client";

import { useCurrentAuthActions } from "@calcom/features/auth/lib/useCurrentAuthActions";
import { APP_NAME } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { useParamsWithFallback } from "@calcom/lib/hooks/useParamsWithFallback";
import type { RouterOutputs } from "@calcom/trpc/react";
import classNames from "@calcom/ui/classNames";
import { Button } from "@calcom/ui/components/button";
import { StepCard } from "@calcom/ui/components/card";
import { StepConnectionLoader } from "@components/getting-started/components/StepConnectionLoader";
import { ConnectedCalendars } from "@components/getting-started/steps-views/ConnectCalendars";
import { ConnectedVideoStep } from "@components/getting-started/steps-views/ConnectedVideoStep";
import { SetupAvailability } from "@components/getting-started/steps-views/SetupAvailability";
import UserProfile from "@components/getting-started/steps-views/UserProfile";
import { UserSettings } from "@components/getting-started/steps-views/UserSettings";
import type { TFunction } from "i18next";
import { usePathname, useRouter } from "next/navigation";
import posthog from "posthog-js";
import { Suspense, useTransition } from "react";
import { Toaster } from "sonner";
import { z } from "zod";
import { ConvenioMark } from "../../auth/components/AuthShell";

const INITIAL_STEP = "user-settings";
const BASE_STEPS = [
  "user-settings",
  "connected-calendar",
  "connected-video",
  "setup-availability",
  "user-profile",
] as const;

type StepType = (typeof BASE_STEPS)[number];

const STEP_RAIL_LABELS: Record<StepType, string> = {
  "user-settings": "onboarding_step_basics",
  "connected-calendar": "onboarding_step_calendars",
  "connected-video": "onboarding_step_video",
  "setup-availability": "onboarding_step_availability",
  "user-profile": "onboarding_step_profile",
};

const getStepsAndHeadersForUser = (t: TFunction) => {
  const baseHeaders: {
    title: string;
    subtitle: string[];
    skipText?: string;
  }[] = [
    {
      title: t("welcome_to_cal_header", { appName: APP_NAME }),
      subtitle: [t("we_just_need_basic_info")],
    },
    {
      title: t("connect_your_calendar"),
      subtitle: [t("connect_your_calendar_instructions")],
      skipText: t("connect_calendar_later"),
    },
    {
      title: t("connect_your_video_app"),
      subtitle: [t("connect_your_video_app_instructions")],
      skipText: t("set_up_later"),
    },
    {
      title: t("set_availability"),
      subtitle: [
        `${t("set_availability_getting_started_subtitle_1")} ${t(
          "set_availability_getting_started_subtitle_2"
        )}`,
      ],
    },
    {
      title: t("nearly_there"),
      subtitle: [t("nearly_there_instructions")],
    },
  ];

  return {
    steps: [...BASE_STEPS],
    headers: [...baseHeaders],
  };
};

const stepRouteSchema = z.object({
  step: z
    .array(
      z.enum(["user-settings", "setup-availability", "user-profile", "connected-calendar", "connected-video"])
    )
    .default([INITIAL_STEP]),
  from: z.string().optional(),
});

type PageProps = {
  hasPendingInvites: boolean;
  user: RouterOutputs["viewer"]["me"]["get"];
};

const OnboardingPage = (props: PageProps) => {
  const { signOut } = useCurrentAuthActions();
  const pathname = usePathname();
  const params = useParamsWithFallback();
  const user = props.user;
  const router = useRouter();
  const { t } = useLocale();
  const [isNextStepLoading, startTransition] = useTransition();

  const result = stepRouteSchema.safeParse({
    ...params,
    step: Array.isArray(params.step) ? params.step : [params.step],
  });

  const currentStep = result.success ? result.data.step[0] : INITIAL_STEP;
  const from = result.success ? result.data.from : "";

  // TODO: Add this in when we have solved the ability to move to tokens accept invite and note invitedto
  // Ability to accept other pending invites if any (low priority)
  // if (props.hasPendingInvites) {
  //   headers.unshift(
  //     props.hasPendingInvites && {
  //       title: `${t("email_no_user_invite_heading", { appName: APP_NAME })}`,
  //       subtitle: [], // TODO: come up with some subtitle text here
  //     }
  //   );
  // }
  const { steps, headers } = getStepsAndHeadersForUser(t);
  const stepTransform = (step: StepType) => {
    const stepIndex = steps.indexOf(step as (typeof steps)[number]);

    if (stepIndex > -1) {
      return steps[stepIndex];
    }
    return INITIAL_STEP;
  };
  const currentStepIndex = steps.indexOf(currentStep);

  const goToStep = (step: number) => {
    const newStep = steps[step];
    startTransition(() => {
      router.push(`/getting-started/${stepTransform(newStep)}`);
    });
  };

  const goToNextStep = (wasSkipped: boolean = false) => {
    posthog.capture("onboarding_step_completed", {
      step: currentStep,
      step_index: currentStepIndex,
      from: from,
      was_skipped: wasSkipped,
    });
    const nextIndex = currentStepIndex + 1;
    const newStep = steps[nextIndex];
    startTransition(() => {
      router.push(`/getting-started/${stepTransform(newStep)}`);
    });
  };

  return (
    <div className="bg-default text-emphasis min-h-screen" data-testid="onboarding" key={pathname}>
      <div className="mx-auto flex w-full max-w-5xl gap-14 px-4 py-8 md:py-20">
        {/* Agenda rail — the sequence is real, so the numbering carries information */}
        <aside className="sticky top-20 hidden w-56 shrink-0 self-start lg:block">
          <div className="mb-10 flex items-center gap-2.5">
            <ConvenioMark className="h-6 w-6" />
            <span className="font-cal text-base tracking-tight">Convenio</span>
          </div>
          <ol>
            {steps.map((step, index) => {
              const isDone = index < currentStepIndex;
              const isCurrent = index === currentStepIndex;
              return (
                <li key={step} className="border-subtle border-t last:border-b">
                  <button
                    type="button"
                    disabled={!isDone}
                    onClick={() => goToStep(index)}
                    className={classNames(
                      "flex w-full items-baseline gap-3 py-3 text-left",
                      isDone && "cursor-pointer"
                    )}>
                    <span
                      className={classNames(
                        "font-mono text-[11px] tracking-[0.1em]",
                        isCurrent ? "text-emphasis" : "text-muted"
                      )}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={classNames(
                        "text-sm",
                        isCurrent ? "text-emphasis font-medium" : isDone ? "text-subtle" : "text-muted"
                      )}>
                      {t(STEP_RAIL_LABELS[step])}
                    </span>
                    {isDone && <span className="bg-inverted ml-auto h-1.5 w-1.5 self-center rounded-full" />}
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <div className="relative mx-auto w-full max-w-xl">
          <div>
            <div>
              <header className="mb-8">
                <p className="font-mono text-subtle text-[11px] uppercase tracking-[0.22em]">
                  {t("current_step_of_total", {
                    currentStep: currentStepIndex + 1,
                    maxSteps: steps.length,
                  })}
                </p>
                <p className="font-cal mt-3 text-3xl leading-tight">
                  {headers[currentStepIndex]?.title ?? ""}
                </p>

                {headers[currentStepIndex]?.subtitle.map((subtitle, index) => (
                  <p className="text-subtle mt-2 font-sans text-sm font-normal" key={index}>
                    {subtitle}
                  </p>
                ))}
              </header>
            </div>
            <StepCard>
              <Suspense fallback={<StepConnectionLoader />}>
                {currentStep === "user-settings" && (
                  <UserSettings nextStep={goToNextStep} hideUsername={from === "signup"} user={user} />
                )}
                {currentStep === "connected-calendar" && (
                  <ConnectedCalendars nextStep={goToNextStep} isPageLoading={isNextStepLoading} />
                )}

                {currentStep === "connected-video" && (
                  <ConnectedVideoStep nextStep={goToNextStep} isPageLoading={isNextStepLoading} user={user} />
                )}

                {currentStep === "setup-availability" && (
                  <SetupAvailability nextStep={goToNextStep} defaultScheduleId={user.defaultScheduleId} />
                )}
                {currentStep === "user-profile" && <UserProfile user={user} />}
              </Suspense>
            </StepCard>

            {headers[currentStepIndex]?.skipText && (
              <div className="flex w-full flex-row justify-center">
                <Button
                  color="minimal"
                  data-testid="skip-step"
                  onClick={(event) => {
                    event.preventDefault();
                    goToNextStep(true);
                  }}
                  className="mt-8 cursor-pointer px-4 py-2 font-sans text-sm font-medium">
                  {headers[currentStepIndex]?.skipText}
                </Button>
              </div>
            )}
          </div>
          <div className="flex w-full flex-row justify-center">
            <Button
              color="minimal"
              data-testid="sign-out"
              onClick={() => {
                posthog.capture("onboarding_sign_out_clicked", {
                  step: currentStep,
                  step_index: currentStepIndex,
                });
                signOut({ redirectUrl: "/auth/logout" });
              }}
              className="mt-8 cursor-pointer px-4 py-2 font-sans text-sm font-medium">
              {t("sign_out")}
            </Button>
          </div>
        </div>
      </div>
      <Toaster position="bottom-right" />
    </div>
  );
};

export default OnboardingPage;
