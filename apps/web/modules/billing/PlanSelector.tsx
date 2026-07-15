"use client";

import {
  type BillingIntervalType,
  PAID_PLAN_CATALOG,
  type PaidPlanKey,
} from "@calcom/features/billing/lib/plans";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import { Button } from "@calcom/ui/components/button";
import { Icon } from "@calcom/ui/components/icon";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@calcom/ui/components/sheet";
import type React from "react";
import { useState } from "react";

export type PaidSelection =
  | { interval: BillingIntervalType; plan: "PRO" }
  | { interval: BillingIntervalType; plan: "TEAM" };

export type PlanSelectorProps = {
  ctaKeys?: Partial<Record<PaidPlanKey, string>>;
  freeHref: string;
  onSelectPlan(selection: PaidSelection): void;
  pendingPlan?: PaidPlanKey;
  showAllPlans?: boolean;
  visiblePlans?: readonly PaidPlanKey[];
};

const paidPlans = [
  {
    plan: "PRO",
    name: "billing_plan_pro",
    outcome: "billing_pro_outcome",
    description: "billing_pro_description",
    cta: "billing_choose_pro",
    features: ["billing_pro_unlimited", "billing_pro_calendar", "billing_pro_handoffs"],
  },
  {
    plan: "TEAM",
    name: "billing_plan_team",
    outcome: "billing_team_outcome",
    description: "billing_team_description",
    cta: "billing_choose_team",
    features: ["billing_team_scheduling", "billing_team_roles", "billing_team_record"],
  },
] as const;

function formatPrice(amountInCents: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: amountInCents % 100 === 0 ? 0 : 2,
    style: "currency",
  }).format(amountInCents / 100);
}

function getCadenceKey(price: {
  interval: BillingIntervalType;
  perAcceptedMember: boolean;
}):
  | "billing_price_cadence_member_yearly"
  | "billing_price_cadence_member_monthly"
  | "billing_price_cadence_yearly"
  | "billing_price_cadence_monthly" {
  if (price.perAcceptedMember) {
    if (price.interval === "YEAR") return "billing_price_cadence_member_yearly";
    return "billing_price_cadence_member_monthly";
  }
  if (price.interval === "YEAR") return "billing_price_cadence_yearly";
  return "billing_price_cadence_monthly";
}

export function PlanSelector({
  ctaKeys,
  freeHref,
  onSelectPlan,
  pendingPlan,
  showAllPlans = true,
  visiblePlans = ["PRO", "TEAM"],
}: PlanSelectorProps): React.ReactElement {
  const { t } = useLocale();
  const [interval, setInterval] = useState<BillingIntervalType>("YEAR");
  const displayedPlans = paidPlans.filter((plan) => visiblePlans.includes(plan.plan));

  return (
    <section className="text-emphasis">
      <div className="mb-8 flex justify-center">
        <div
          aria-label={t("billing_interval_label")}
          className="border-subtle bg-default inline-flex min-h-10 rounded-full border p-1"
          role="group">
          {(["MONTH", "YEAR"] as const).map((option) => (
            <button
              aria-pressed={interval === option}
              className={classNames(
                "min-h-10 rounded-full px-5 text-sm font-medium transition",
                interval === option ? "bg-emphasis text-inverted" : "text-subtle hover:text-emphasis"
              )}
              key={option}
              onClick={() => setInterval(option)}
              type="button">
              {t(option === "MONTH" ? "billing_interval_monthly" : "billing_interval_yearly")}
            </button>
          ))}
        </div>
      </div>

      <div className={classNames("grid gap-5", displayedPlans.length > 1 && "md:grid-cols-2")}>
        {displayedPlans.map((plan) => {
          const price = PAID_PLAN_CATALOG[plan.plan].prices[interval];
          const cadenceKey = getCadenceKey(price);
          const ctaKey = ctaKeys?.[plan.plan] ?? plan.cta;

          return (
            <article
              className="border-subtle bg-default flex flex-col rounded-2xl border p-6"
              key={plan.plan}>
              <h2 className="font-cal text-emphasis text-2xl font-semibold">{t(plan.name)}</h2>
              <p className="text-emphasis mt-3 text-base font-medium">{t(plan.outcome)}</p>
              <p className="text-subtle mt-2 text-sm leading-6">{t(plan.description)}</p>

              <div className="border-subtle mt-6 border-y py-5">
                <p className="font-mono text-4xl font-semibold tracking-tight">
                  {formatPrice(price.amountInCents)}
                </p>
                <p className="text-subtle mt-2 text-xs">{t(cadenceKey)}</p>
                {price.interval === "YEAR" ? (
                  <p className="text-subtle mt-2 text-xs">
                    {t(
                      price.perAcceptedMember
                        ? "billing_weekly_member_equivalent"
                        : "billing_weekly_equivalent",
                      {
                        price: formatPrice(Math.round(price.amountInCents / 52)),
                      }
                    )}
                  </p>
                ) : null}
              </div>

              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li className="text-emphasis flex gap-3 text-sm" key={feature}>
                    <Icon className="text-subtle mt-0.5 h-4 w-4 shrink-0" name="check" />
                    <span>{t(feature)}</span>
                  </li>
                ))}
              </ul>

              <Button
                aria-label={t(ctaKey)}
                className="mt-8 w-full justify-center"
                color="primary"
                disabled={pendingPlan !== undefined}
                loading={pendingPlan === plan.plan}
                onClick={() =>
                  plan.plan === "PRO"
                    ? onSelectPlan({ interval, plan: "PRO" })
                    : onSelectPlan({ interval, plan: "TEAM" })
                }>
                <span>{t(ctaKey)}</span>
                <span aria-hidden="true">›</span>
              </Button>
              <p className="text-subtle mt-2 text-center text-xs">{t("billing_cancel_anytime")}</p>
            </article>
          );
        })}
      </div>

      {showAllPlans ? (
        <>
          <p className="text-subtle mt-6 text-center text-sm">{t("billing_plan_proof")}</p>

          <Sheet>
            <div className="mt-5 flex justify-center">
              <SheetTrigger asChild>
                <Button color="minimal">{t("billing_view_all_plans")}</Button>
              </SheetTrigger>
            </div>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>{t("billing_all_plans_title")}</SheetTitle>
                <SheetDescription>{t("billing_all_plans_description")}</SheetDescription>
              </SheetHeader>
              <SheetBody>
                <article className="border-subtle bg-default rounded-2xl border p-6">
                  <h2 className="font-cal text-emphasis text-2xl font-semibold">{t("billing_plan_free")}</h2>
                  <p className="text-emphasis mt-3 text-base font-medium">{t("billing_free_outcome")}</p>
                  <p className="text-subtle mt-2 text-sm leading-6">{t("billing_free_description")}</p>
                  <p className="font-mono mt-6 text-4xl font-semibold tracking-tight">$0</p>
                  <Button className="mt-6 w-full justify-center" color="secondary" href={freeHref}>
                    {t("billing_keep_working_free")}
                  </Button>
                </article>
              </SheetBody>
            </SheetContent>
          </Sheet>
        </>
      ) : null}
    </section>
  );
}
