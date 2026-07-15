"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { SkeletonText } from "@calcom/ui/components/skeleton";
import { useEffect, useState } from "react";
import { type PaidSelection, PlanSelector } from "../../billing/PlanSelector";
import { usePaidPlanCheckout } from "../../billing/usePaidPlanCheckout";
import { OnboardingCard } from "../components/OnboardingCard";
import { OnboardingLayout } from "../components/OnboardingLayout";
import { useSubmitPersonalOnboarding } from "../hooks/useSubmitPersonalOnboarding";
import type { AcceptedOrganizationContext } from "../lib/getAcceptedOrganizationContexts";
import { useOnboardingStore } from "../store/onboarding-store";

export function CompletionView({
  acceptedOrganizations,
  userEmail,
}: {
  acceptedOrganizations: AcceptedOrganizationContext[];
  userEmail: string;
}) {
  const { t } = useLocale();
  const intent = useOnboardingStore((state) => state.intent);
  const createdOrganization = useOnboardingStore((state) => state.createdOrganization);
  const [hydrated, setHydrated] = useState(useOnboardingStore.persist.hasHydrated());
  const { isSubmitting, submitPersonalOnboarding } = useSubmitPersonalOnboarding();
  const paidCheckout = usePaidPlanCheckout();

  useEffect(() => useOnboardingStore.persist.onFinishHydration(() => setHydrated(true)), []);

  if (!hydrated) {
    return (
      <div
        aria-label={t("onboarding_complete_loading")}
        className="mx-auto w-full max-w-xl p-8"
        role="status">
        <SkeletonText className="h-10 w-3/4" />
        <SkeletonText className="mt-4 h-64 w-full" />
      </div>
    );
  }

  const acceptedOrganization = acceptedOrganizations[0] ?? null;
  const checkoutOrganization =
    intent === "bring-team" ? createdOrganization : intent === "join-team" ? acceptedOrganization : null;
  const isMember = intent === "join-team" && acceptedOrganization?.role === "MEMBER";
  const canManageTeam =
    intent === "bring-team"
      ? Boolean(createdOrganization)
      : intent === "join-team" &&
        (acceptedOrganization?.role === "OWNER" || acceptedOrganization?.role === "ADMIN");
  const missingCreatedTeam = intent === "bring-team" && !createdOrganization;
  const visiblePlan =
    intent === "bring-team" || (intent === "join-team" && acceptedOrganization) ? "TEAM" : "PRO";
  const teamName = checkoutOrganization?.name ?? "";
  const titleKey =
    intent === "bring-team" && createdOrganization
      ? "onboarding_complete_bring_title"
      : intent === "join-team" && acceptedOrganization
        ? "onboarding_complete_join_title"
        : intent === "join-team"
          ? "onboarding_complete_join_missing_title"
          : "onboarding_complete_solo_title";
  const descriptionKey =
    intent === "bring-team" && createdOrganization
      ? "onboarding_complete_bring_description"
      : intent === "join-team" && acceptedOrganization
        ? "onboarding_complete_join_description"
        : intent === "join-team"
          ? "onboarding_complete_join_missing_description"
          : "onboarding_complete_solo_description";

  function selectPaidPlan(selection: PaidSelection): void {
    void submitPersonalOnboarding({
      afterComplete: () => {
        if (selection.plan === "TEAM" && checkoutOrganization) {
          paidCheckout.startCheckout(selection, checkoutOrganization.id);
          return;
        }
        paidCheckout.startCheckout(selection);
      },
    });
  }

  return (
    <OnboardingLayout currentStep={4} totalSteps={4} userEmail={userEmail}>
      <OnboardingCard footer={null} subtitle={t(descriptionKey)} title={t(titleKey, { teamName })}>
        <div className="motion-reduce:[&_button]:transition-none [@media(pointer:coarse)]:[&_button]:min-h-11">
          {isMember && acceptedOrganization ? (
            <p className="border-subtle bg-subtle rounded-xl border p-4 text-sm text-emphasis">
              {t("onboarding_complete_member_plan", { teamName: acceptedOrganization.name })}
            </p>
          ) : missingCreatedTeam ? (
            <Button className="w-full justify-center" color="secondary" href="/onboarding/team">
              {t("onboarding_complete_create_team")}
            </Button>
          ) : canManageTeam || visiblePlan === "PRO" ? (
            <PlanSelector
              ctaKeys={{
                [visiblePlan]: visiblePlan === "TEAM" ? "billing_choose_team" : "billing_choose_pro",
              }}
              freeHref="/event-types"
              onSelectPlan={selectPaidPlan}
              pendingPlan={paidCheckout.pendingPlan}
              showAllPlans={false}
              visiblePlans={[visiblePlan]}
            />
          ) : null}
          <Button
            className="mt-4 w-full justify-center"
            color="secondary"
            disabled={isSubmitting}
            onClick={() => void submitPersonalOnboarding()}>
            {t("billing_keep_working_free")}
          </Button>
        </div>
      </OnboardingCard>
    </OnboardingLayout>
  );
}
