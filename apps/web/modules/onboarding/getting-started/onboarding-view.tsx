"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import { Button } from "@calcom/ui/components/button";
import { RadioAreaGroup } from "@calcom/ui/components/radio";
import { useRouter } from "next/navigation";
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";
import { OnboardingCard } from "../components/OnboardingCard";
import { OnboardingLayout } from "../components/OnboardingLayout";
import type { AcceptedOrganizationContext } from "../lib/getAcceptedOrganizationContexts";
import { type OnboardingIntent, useOnboardingStore } from "../store/onboarding-store";

type OnboardingViewProps = {
  acceptedOrganization: AcceptedOrganizationContext | null;
  userEmail: string;
};

const intents: readonly {
  description: string;
  id: OnboardingIntent;
  title: string;
}[] = [
  {
    description: "onboarding_intent_solo_description",
    id: "solo",
    title: "onboarding_intent_solo",
  },
  {
    description: "onboarding_intent_join_description",
    id: "join-team",
    title: "onboarding_intent_join",
  },
  {
    description: "onboarding_intent_bring_description",
    id: "bring-team",
    title: "onboarding_intent_bring",
  },
];

export const OnboardingView = ({ acceptedOrganization, userEmail }: OnboardingViewProps): ReactElement => {
  const router = useRouter();
  const { t } = useLocale();
  const { setIntent } = useOnboardingStore();
  const [selection, setSelection] = useState<OnboardingIntent | null>(null);
  const [showInviteRecovery, setShowInviteRecovery] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const choicesRef = useRef<HTMLDivElement>(null);
  const recoveryButtonRef = useRef<HTMLButtonElement>(null);
  const hasShownRecovery = useRef(false);

  useEffect(() => {
    if (showInviteRecovery) {
      hasShownRecovery.current = true;
      recoveryButtonRef.current?.focus();
      return;
    }
    if (!hasShownRecovery.current) return;
    choicesRef.current?.querySelector<HTMLElement>('[role="radio"][data-state="checked"]')?.focus();
  }, [showInviteRecovery]);

  function handleContinue(): void {
    if (!selection) return;

    if (selection === "join-team" && !acceptedOrganization) {
      setAnnouncement(t("onboarding_invite_recovery_title"));
      setShowInviteRecovery(true);
      return;
    }

    setIntent(selection);
    if (selection === "bring-team") {
      router.push("/onboarding/team");
      return;
    }
    router.push("/onboarding/personal/settings");
  }

  function continueWithoutAcceptedTeam(): void {
    setIntent("join-team");
    router.push("/onboarding/personal/settings");
  }

  function chooseAnotherSetup(): void {
    setAnnouncement(t("onboarding_intent_title"));
    setShowInviteRecovery(false);
  }

  const inviteRecoveryFooter: ReactNode = (
    <div className="flex w-full flex-wrap justify-end gap-2 [@media(pointer:coarse)]:[&_button]:min-h-11">
      <Button color="minimal" onClick={chooseAnotherSetup}>
        {t("onboarding_choose_another_setup")}
      </Button>
      <Button ref={recoveryButtonRef} color="primary" onClick={continueWithoutAcceptedTeam}>
        {t("onboarding_continue_solo")}
      </Button>
    </div>
  );

  let primaryContent: ReactNode;
  if (showInviteRecovery) {
    primaryContent = (
      <OnboardingCard
        title={t("onboarding_invite_recovery_title")}
        subtitle={t("onboarding_invite_recovery_description")}
        footer={inviteRecoveryFooter}
      />
    );
  } else {
    primaryContent = (
      <OnboardingCard
        title={t("onboarding_intent_title")}
        subtitle={t("onboarding_intent_description")}
        footer={
          <div className="flex w-full justify-end [@media(pointer:coarse)]:[&_button]:min-h-11">
            <Button
              data-testid="onboarding-continue-btn"
              color="primary"
              onClick={handleContinue}
              disabled={!selection}>
              {t("continue")}
            </Button>
          </div>
        }>
        <div ref={choicesRef}>
          <RadioAreaGroup.Group
            aria-label={t("onboarding_intent_title")}
            value={selection ?? undefined}
            onValueChange={(value: string): void => setSelection(value as OnboardingIntent)}
            className="flex w-full flex-col gap-2 rounded-[10px]">
            {intents.map((intent) => (
              <RadioAreaGroup.Item
                key={intent.id}
                value={intent.id}
                aria-label={t(intent.title)}
                className={classNames(
                  "min-h-11 border-subtle bg-default focus-within:ring-2 focus-within:ring-emphasis motion-reduce:[&_button]:transition-none [@media(pointer:coarse)]:min-h-11",
                  { "border-emphasis shadow-sm": selection === intent.id }
                )}
                classNames={{
                  container: "flex min-h-11 w-full cursor-pointer flex-col justify-center pr-4",
                }}>
                <span className="font-semibold text-emphasis text-sm leading-5">{t(intent.title)}</span>
                <span className="text-sm text-subtle leading-5">{t(intent.description)}</span>
              </RadioAreaGroup.Item>
            ))}
          </RadioAreaGroup.Group>
        </div>

        {selection === "join-team" && acceptedOrganization && (
          <div className="rounded-[10px] border border-subtle bg-cal-muted p-4" aria-live="polite">
            <p className="font-semibold text-emphasis text-sm">
              {t("onboarding_join_context_title", { teamName: acceptedOrganization.name })}
            </p>
            <p className="mt-1 text-sm text-subtle leading-5">{t("onboarding_join_context_description")}</p>
          </div>
        )}
      </OnboardingCard>
    );
  }

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <OnboardingLayout userEmail={userEmail}>
        {primaryContent}

        <div className="hidden h-full rounded-l-2xl bg-inverted p-12 xl:flex xl:flex-col xl:justify-end">
          <p className="font-mono text-inverted text-xs uppercase tracking-[0.18em]">
            {t("onboarding_intent_title")}
          </p>
          <p className="mt-3 max-w-md font-cal text-4xl text-inverted leading-tight">
            {t("onboarding_intent_description")}
          </p>
        </div>
      </OnboardingLayout>
    </>
  );
};
