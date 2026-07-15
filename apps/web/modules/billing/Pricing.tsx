"use client";

import type { PaidPlanKey } from "@calcom/features/billing/lib/plans";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { showToast } from "@calcom/ui/components/toast";
import Shell from "@calcom/web/modules/shell/Shell";
import { useRouter } from "next/navigation";
import {
  getMarketingShellCopy,
  MarketingFooter,
  MarketingHeader,
} from "../../app/(marketing)/MarketingShell";
import type { PaidSelection } from "./PlanSelector";
import { PlanSelector } from "./PlanSelector";

type PricingProps = {
  isAuthenticated: boolean;
  onSelectPlan(selection: PaidSelection): void;
  pendingPlan?: PaidPlanKey;
};

function Pricing({ isAuthenticated, onSelectPlan, pendingPlan }: PricingProps) {
  const { t } = useLocale();

  if (isAuthenticated) {
    return (
      <Shell
        eyebrow={t("billing_pricing_eyebrow")}
        heading={t("billing")}
        subtitle={t("billing_pricing_description")}>
        <PlanSelector freeHref="/event-types" onSelectPlan={onSelectPlan} pendingPlan={pendingPlan} />
      </Shell>
    );
  }

  const copy = getMarketingShellCopy(t);

  return (
    <div className="cv-root">
      <MarketingHeader copy={copy} current="pricing" />
      <main className="cv-container">
        <PlanSelector freeHref="/signup" onSelectPlan={onSelectPlan} pendingPlan={pendingPlan} />
      </main>
      <MarketingFooter copy={copy} />
    </div>
  );
}

function PricingPage({
  isAuthenticated,
  organizationId,
}: {
  isAuthenticated: boolean;
  organizationId?: number;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const checkout = trpc.viewer.billing.createCheckout.useMutation({
    onError: () => showToast(t("billing_checkout_error"), "error"),
    onSuccess: ({ checkoutUrl }) => window.location.assign(checkoutUrl),
  });

  const selectPlan = (selection: PaidSelection) => {
    if (!isAuthenticated) {
      localStorage.setItem("onBoardingRedirect", "/pricing");
      router.push("/signup");
      return;
    }
    if (selection.plan === "PRO") {
      checkout.mutate(selection);
      return;
    }
    if (organizationId === undefined) {
      router.push(
        `/settings/organizations/new?returnTo=${encodeURIComponent("/pricing")}&interval=${selection.interval}`
      );
      return;
    }
    checkout.mutate({ ...selection, organizationId });
  };

  return (
    <Pricing
      isAuthenticated={isAuthenticated}
      onSelectPlan={selectPlan}
      pendingPlan={checkout.isPending ? checkout.variables?.plan : undefined}
    />
  );
}

export { Pricing, PricingPage };
