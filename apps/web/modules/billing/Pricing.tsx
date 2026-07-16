"use client";

import type { PaidPlanKey } from "@calcom/features/billing/lib/plans";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { storeOnboardingRedirect } from "@calcom/web/modules/onboarding/lib/onboardingRedirect";
import Shell from "@calcom/web/modules/shell/Shell";
import { useRouter } from "next/navigation";
import {
  getMarketingShellCopy,
  MarketingFooter,
  MarketingHeader,
} from "../../app/(marketing)/MarketingShell";
import type { PaidSelection } from "./PlanSelector";
import { PlanSelector } from "./PlanSelector";
import { usePaidPlanCheckout } from "./usePaidPlanCheckout";

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
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-default focus:px-4 focus:py-2 focus:text-emphasis focus:shadow-md focus:outline-none focus:ring-2 focus:ring-emphasis"
        href="#pricing-main-content">
        {t("skip_to_main_content")}
      </a>
      <MarketingHeader copy={copy} current="pricing" />
      <main className="cv-container" id="pricing-main-content" tabIndex={-1}>
        <section className="cv-page-hero">
          <span className="cv-eyebrow">{t("billing_pricing_eyebrow")}</span>
          <h1 className="cv-display">{t("billing_pricing_title")}</h1>
          <p className="cv-body">{t("billing_pricing_description")}</p>
        </section>
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
  const router = useRouter();
  const paidCheckout = usePaidPlanCheckout({ organizationId, returnTo: "/pricing" });

  const selectPlan = (selection: PaidSelection) => {
    if (!isAuthenticated) {
      storeOnboardingRedirect("/pricing");
      router.push("/signup");
      return;
    }
    paidCheckout.startCheckout(selection);
  };

  return (
    <Pricing
      isAuthenticated={isAuthenticated}
      onSelectPlan={selectPlan}
      pendingPlan={paidCheckout.pendingPlan}
    />
  );
}

export { Pricing, PricingPage };
