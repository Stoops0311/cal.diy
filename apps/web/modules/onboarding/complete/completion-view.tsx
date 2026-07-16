"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { SkeletonText } from "@calcom/ui/components/skeleton";
import { type ReactElement, type ReactNode, useCallback, useEffect, useState } from "react";
import { type PaidSelection, PlanSelector } from "../../billing/PlanSelector";
import { UpgradePromptProvider } from "../../billing/UpgradePromptProvider";
import { saveUpgradeIntent } from "../../billing/upgradeIntent";
import { type CheckoutContext, usePaidPlanCheckout } from "../../billing/usePaidPlanCheckout";
import { OrganizationMembersPanel } from "../../organizations/OrganizationMembersPanel";
import { OnboardingCard } from "../components/OnboardingCard";
import { OnboardingLayout } from "../components/OnboardingLayout";
import { useSubmitPersonalOnboarding } from "../hooks/useSubmitPersonalOnboarding";
import type { AcceptedOrganizationContext } from "../lib/getAcceptedOrganizationContexts";
import { type CreatedOrganizationContext, useOnboardingStore } from "../store/onboarding-store";

export function OnboardingOrganizationMembersPanel({
  organizationId,
}: {
  organizationId: number;
}): ReactElement {
  return (
    <UpgradePromptProvider>
      <OrganizationMembersPanel organizationId={organizationId} />
    </UpgradePromptProvider>
  );
}

export function CompletionView({
  acceptedOrganizations,
  userEmail,
}: {
  acceptedOrganizations: AcceptedOrganizationContext[];
  userEmail: string;
}): ReactElement {
  const { t } = useLocale();
  const intent = useOnboardingStore((state) => state.intent);
  const createdOrganization = useOnboardingStore((state) => state.createdOrganization);
  const [hydrated, setHydrated] = useState(useOnboardingStore.persist.hasHydrated());
  const [preparingPlan, setPreparingPlan] = useState<PaidSelection["plan"]>();
  const { isSubmitting, submitPersonalOnboarding } = useSubmitPersonalOnboarding();
  const acceptedOrganization = acceptedOrganizations[0] ?? null;
  let checkoutOrganization: AcceptedOrganizationContext | CreatedOrganizationContext | null = null;
  if (intent === "bring-team") checkoutOrganization = createdOrganization;
  if (intent === "join-team") checkoutOrganization = acceptedOrganization;
  const isMember = intent === "join-team" && acceptedOrganization?.role === "MEMBER";
  let canManageTeam = false;
  if (intent === "bring-team") canManageTeam = Boolean(createdOrganization);
  if (intent === "join-team") {
    canManageTeam = acceptedOrganization?.role === "OWNER" || acceptedOrganization?.role === "ADMIN";
  }
  const saveInvitationIntent = useCallback(
    ({ organizationId, selection }: CheckoutContext): void => {
      if (selection.plan !== "TEAM" || !canManageTeam || !organizationId) return;
      saveUpgradeIntent(
        {
          capability: "organizationInvitations",
          requiredPlan: "TEAM",
          resume: { kind: "openOrganizationInvitations", organizationId },
          returnTo: "/onboarding/complete",
        },
        { subject: { kind: "organization", organizationId } }
      );
    },
    [canManageTeam]
  );
  const paidCheckout = usePaidPlanCheckout({ onBeforeNavigate: saveInvitationIntent });

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

  const missingCreatedTeam = intent === "bring-team" && !createdOrganization;
  let visiblePlan: PaidSelection["plan"] = "PRO";
  if (intent === "bring-team" || (intent === "join-team" && acceptedOrganization)) visiblePlan = "TEAM";
  const teamName = checkoutOrganization?.name ?? "";
  let titleKey = "onboarding_complete_solo_title";
  let descriptionKey = "onboarding_complete_solo_description";
  if (intent === "join-team" && acceptedOrganization) {
    titleKey = "onboarding_complete_join_title";
    descriptionKey = "onboarding_complete_join_description";
  } else if (intent === "join-team") {
    titleKey = "onboarding_complete_join_missing_title";
    descriptionKey = "onboarding_complete_join_missing_description";
  }
  if (intent === "bring-team" && createdOrganization) {
    titleKey = "onboarding_complete_bring_title";
    descriptionKey = "onboarding_complete_bring_description";
  }

  function selectPaidPlan(selection: PaidSelection): void {
    if (preparingPlan) return;
    setPreparingPlan(selection.plan);
    void submitPersonalOnboarding({
      afterComplete: () => {
        if (selection.plan === "TEAM" && checkoutOrganization) {
          paidCheckout.startCheckout(selection, checkoutOrganization.id);
          return;
        }
        paidCheckout.startCheckout(selection);
      },
    }).finally(() => setPreparingPlan(undefined));
  }

  let planDecision: ReactNode = null;
  if (isMember && acceptedOrganization) {
    planDecision = (
      <p className="rounded-xl border border-subtle bg-subtle p-4 text-emphasis text-sm">
        {t("onboarding_complete_member_plan", { teamName: acceptedOrganization.name })}
      </p>
    );
  } else if (missingCreatedTeam) {
    planDecision = (
      <Button className="w-full justify-center" color="secondary" href="/onboarding/team">
        {t("onboarding_complete_create_team")}
      </Button>
    );
  } else if (canManageTeam || visiblePlan === "PRO") {
    let ctaKey = "billing_choose_pro";
    if (visiblePlan === "TEAM") ctaKey = "billing_choose_team";
    planDecision = (
      <PlanSelector
        ctaKeys={{ [visiblePlan]: ctaKey }}
        freeHref="/event-types"
        onSelectPlan={selectPaidPlan}
        pendingPlan={preparingPlan ?? paidCheckout.pendingPlan}
        showAllPlans={false}
        visiblePlans={[visiblePlan]}
      />
    );
  }

  return (
    <OnboardingLayout currentStep={4} totalSteps={4} userEmail={userEmail}>
      <OnboardingCard footer={null} subtitle={t(descriptionKey)} title={t(titleKey, { teamName })}>
        <div className="motion-reduce:[&_button]:transition-none [@media(pointer:coarse)]:[&_button]:min-h-11">
          {planDecision}
          <Button
            className="mt-4 w-full justify-center"
            color="secondary"
            disabled={isSubmitting || preparingPlan !== undefined}
            onClick={() => void submitPersonalOnboarding()}>
            {t("billing_keep_working_free")}
          </Button>
          {canManageTeam && checkoutOrganization ? (
            <OnboardingOrganizationMembersPanel organizationId={checkoutOrganization.id} />
          ) : null}
        </div>
      </OnboardingCard>
    </OnboardingLayout>
  );
}
