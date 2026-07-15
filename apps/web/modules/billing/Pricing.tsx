"use client";

import type { BillingIntervalType, PaidPlanKey } from "@calcom/features/billing/lib/plans";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import classNames from "@calcom/ui/classNames";
import { Button } from "@calcom/ui/components/button";
import { Icon } from "@calcom/ui/components/icon";
import { showToast } from "@calcom/ui/components/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type PaidSelection =
  | { interval: BillingIntervalType; plan: "PRO" }
  | { interval: BillingIntervalType; plan: "TEAM" };
type PricingProps = {
  isAuthenticated: boolean;
  onSelectPlan(selection: PaidSelection): void;
  pendingPlan?: PaidPlanKey;
};

const plans = [
  {
    cta: "billing_get_started",
    description: "billing_free_description",
    features: ["billing_free_events", "billing_free_calendar", "billing_free_branding"],
    name: "billing_plan_free",
    plan: "FREE",
  },
  {
    cta: "billing_choose_pro",
    description: "billing_pro_description",
    features: [
      "billing_pro_unlimited",
      "billing_pro_advanced",
      "billing_pro_payments",
      "billing_pro_developer",
      "billing_pro_branding",
    ],
    name: "billing_plan_pro",
    plan: "PRO",
  },
  {
    cta: "billing_choose_team",
    description: "billing_team_description",
    features: [
      "billing_team_pro_features",
      "billing_team_organizations",
      "billing_team_scheduling",
      "billing_team_audit",
      "billing_team_seats",
    ],
    name: "billing_plan_team",
    plan: "TEAM",
  },
] as const;

const prices = {
  PRO: { MONTH: "$10", YEAR: "$96" },
  TEAM: { MONTH: "$15", YEAR: "$144" },
} as const;

function Pricing({ isAuthenticated, onSelectPlan, pendingPlan }: PricingProps) {
  const { t } = useLocale();
  const [interval, setInterval] = useState<BillingIntervalType>("MONTH");

  return (
    <main className="min-h-screen bg-[#f7f9fc] text-[#111827] dark:bg-[#0b1020] dark:text-white">
      <section className="relative overflow-hidden border-b border-[#d9e2ef] dark:border-white/10">
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 grid h-24 grid-cols-7 opacity-50">
          {[28, 52, 36, 68, 44, 24, 16].map((height, index) => (
            <div className="relative border-l border-[#2563eb]/15" key={height}>
              <span
                className={classNames(
                  "absolute inset-x-2 bottom-0 rounded-t-xl",
                  index === 3 ? "bg-[#2563eb]" : "bg-[#06b6d4]/40"
                )}
                style={{ height }}
              />
            </div>
          ))}
        </div>
        <div className="relative mx-auto max-w-6xl px-6 pb-28 pt-16 text-center sm:pt-24">
          <Link className="font-cal text-xl font-semibold tracking-tight" href="/">
            Convenio
          </Link>
          <p className="mt-12 text-xs font-semibold uppercase tracking-[0.24em] text-[#2563eb]">
            {t("billing_pricing_eyebrow")}
          </p>
          <h1 className="font-cal mx-auto mt-4 max-w-3xl text-4xl leading-[1.05] font-semibold tracking-tight sm:text-6xl">
            {t("billing_pricing_title")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[#526078] dark:text-white/65">
            {t("billing_pricing_description")}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="mb-10 flex justify-center">
          <div
            aria-label={t("billing_interval_label")}
            className="inline-flex rounded-xl border border-[#cbd5e1] bg-white p-1 shadow-sm dark:border-white/15 dark:bg-white/5"
            role="group">
            <button
              aria-pressed={interval === "MONTH"}
              className={classNames(
                "rounded-lg px-5 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]",
                interval === "MONTH"
                  ? "bg-[#111827] text-white dark:bg-white dark:text-[#111827]"
                  : "text-[#526078]"
              )}
              onClick={() => setInterval("MONTH")}
              type="button">
              {t("billing_interval_monthly")}
            </button>
            <button
              aria-pressed={interval === "YEAR"}
              className={classNames(
                "rounded-lg px-5 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]",
                interval === "YEAR"
                  ? "bg-[#111827] text-white dark:bg-white dark:text-[#111827]"
                  : "text-[#526078]"
              )}
              onClick={() => setInterval("YEAR")}
              type="button">
              {t("billing_interval_yearly")}
            </button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => {
            const isPro = plan.plan === "PRO";
            const paidPlan = plan.plan === "FREE" ? undefined : plan.plan;
            return (
              <article
                className={classNames(
                  "relative flex min-h-[520px] flex-col rounded-3xl border bg-white p-7 shadow-[0_18px_50px_-36px_rgba(15,23,42,.45)] dark:bg-white/5",
                  isPro
                    ? "border-[#2563eb] ring-4 ring-[#2563eb]/10"
                    : "border-[#d9e2ef] dark:border-white/10"
                )}
                key={plan.plan}>
                {isPro ? (
                  <span className="absolute -top-3 left-7 rounded-full bg-[#2563eb] px-3 py-1 text-xs font-semibold text-white">
                    {t("billing_most_popular")}
                  </span>
                ) : null}
                <div>
                  <h2 className="font-cal text-2xl font-semibold tracking-tight">{t(plan.name)}</h2>
                  <p className="mt-3 min-h-12 text-sm leading-6 text-[#526078] dark:text-white/65">
                    {t(plan.description)}
                  </p>
                </div>
                <div className="mt-8 border-y border-[#e5eaf1] py-6 dark:border-white/10">
                  {paidPlan ? (
                    <div className="flex items-end gap-2">
                      <span className="font-cal text-5xl font-semibold tracking-tight">
                        {prices[paidPlan][interval]}
                      </span>
                      <span className="pb-1 text-sm text-[#526078] dark:text-white/65">
                        {t(paidPlan === "TEAM" ? "billing_per_seat_period" : "billing_per_period")}
                      </span>
                    </div>
                  ) : (
                    <span className="font-cal text-5xl font-semibold tracking-tight">$0</span>
                  )}
                  <p className="mt-2 text-xs text-[#64748b] dark:text-white/55">
                    {paidPlan ? t("billing_trial_note") : t("billing_free_forever")}
                  </p>
                </div>
                <ul className="mt-7 flex-1 space-y-4 text-sm">
                  {plan.features.map((feature) => (
                    <li className="flex gap-3" key={feature}>
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#0f766e]" name="check" />
                      <span>{t(feature)}</span>
                    </li>
                  ))}
                </ul>
                {paidPlan ? (
                  <Button
                    aria-label={t(plan.cta)}
                    className="mt-8 w-full justify-center"
                    color={isPro ? "primary" : "secondary"}
                    disabled={pendingPlan !== undefined}
                    loading={pendingPlan === paidPlan}
                    onClick={() => onSelectPlan({ interval, plan: paidPlan })}>
                    {t(plan.cta)}
                  </Button>
                ) : (
                  <Button
                    className="mt-8 w-full justify-center"
                    color="secondary"
                    href={isAuthenticated ? "/event-types" : "/signup"}>
                    {t(plan.cta)}
                  </Button>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
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
      router.push("/auth/login?callbackUrl=/pricing");
      return;
    }
    if (selection.plan === "PRO") {
      checkout.mutate(selection);
      return;
    }
    if (organizationId === undefined) {
      router.push("/settings/organizations/new?returnTo=/pricing");
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
