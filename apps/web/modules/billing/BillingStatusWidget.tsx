"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";

function BillingStatusWidget() {
  const { t } = useLocale();
  const query = trpc.viewer.billing.summary.useQuery(undefined, {
    retry: 1,
    staleTime: 60_000,
  });

  if (query.isPending) {
    return (
      <aside
        aria-label={t("billing_status_widget_loading")}
        className="border-subtle bg-subtle mt-6 min-h-24 animate-pulse rounded-xl border"
      />
    );
  }

  if (query.isError || !query.data) {
    return (
      <aside className="border-subtle bg-default mt-6 flex min-h-24 items-center justify-between gap-4 rounded-xl border p-4">
        <p className="text-subtle text-sm">{t("billing_status_widget_unavailable")}</p>
        <Button
          className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
          color="minimal"
          onClick={() => void query.refetch()}
          size="sm">
          {t("billing_status_widget_retry")}
        </Button>
      </aside>
    );
  }

  const { canManageBilling, plan, seats, subject } = query.data;
  const organizationQuery = subject.type === "ORGANIZATION" ? `?organizationId=${subject.id}` : "";
  const actionHref =
    plan === "FREE" ? `/pricing${organizationQuery}` : `/settings/billing${organizationQuery}`;

  return (
    <aside className="border-subtle bg-default mt-6 flex min-h-24 flex-col justify-between gap-4 rounded-xl border p-4 sm:flex-row sm:items-center">
      <div>
        <p className="text-subtle font-mono text-[11px] uppercase tracking-[0.18em]">
          {t("billing_status_widget_eyebrow")}
        </p>
        <p className="font-cal text-emphasis mt-1 text-xl font-semibold">
          {t(`billing_plan_${plan.toLowerCase()}`)}
        </p>
        {seats ? (
          <p className="text-subtle mt-1 text-sm">
            {t("billing_status_widget_seats", { used: seats.accepted, limit: seats.limit })}
          </p>
        ) : null}
      </div>
      {canManageBilling ? (
        <Button
          className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
          color="secondary"
          href={actionHref}
          size="sm">
          {t(plan === "FREE" ? "billing_compare_plans" : "billing_manage_plan")}
        </Button>
      ) : null}
    </aside>
  );
}

export { BillingStatusWidget };
