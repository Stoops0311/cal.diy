"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import type { ReactElement } from "react";

function BillingStatusWidget(): ReactElement {
  const { t } = useLocale();
  const query = trpc.viewer.billing.summary.useQuery(undefined, {
    retry: 1,
    staleTime: 60_000,
  });

  function handleRetry(): void {
    void query.refetch();
  }

  if (query.isPending) {
    return (
      <aside
        aria-label={t("billing_status_widget_loading")}
        aria-live="polite"
        className="mt-6 min-h-24 rounded-xl border border-subtle bg-subtle motion-safe:animate-pulse"
        role="status"
      />
    );
  }

  if (query.isError || !query.data) {
    return (
      <aside
        aria-live="polite"
        className="mt-6 flex min-h-24 items-center justify-between gap-4 rounded-xl border border-subtle bg-default p-4"
        role="status">
        <p className="text-sm text-subtle">{t("billing_status_widget_unavailable")}</p>
        <Button
          className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
          color="minimal"
          onClick={handleRetry}
          size="sm">
          {t("billing_status_widget_retry")}
        </Button>
      </aside>
    );
  }

  const { canManageBilling, plan, seats, subject } = query.data;
  let organizationQuery = "";
  if (subject.type === "ORGANIZATION") organizationQuery = `?organizationId=${subject.id}`;

  let actionHref = `/settings/billing${organizationQuery}`;
  let actionLabel = "billing_manage_plan";
  if (plan === "FREE") {
    actionHref = `/pricing${organizationQuery}`;
    actionLabel = "billing_compare_plans";
  }

  return (
    <aside
      aria-live="polite"
      className="mt-6 flex min-h-24 flex-col justify-between gap-4 rounded-xl border border-subtle bg-default p-4 sm:flex-row sm:items-center"
      role="status">
      <div>
        <p className="font-mono text-[11px] text-subtle uppercase tracking-[0.18em]">
          {t("billing_status_widget_eyebrow")}
        </p>
        <p className="mt-1 font-cal font-semibold text-emphasis text-xl">
          {t(`billing_plan_${plan.toLowerCase()}`)}
        </p>
        {seats && (
          <p className="mt-1 text-sm text-subtle">
            {t("billing_status_widget_seats", { used: seats.accepted, limit: seats.limit })}
          </p>
        )}
      </div>
      {canManageBilling && (
        <Button
          className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
          color="secondary"
          href={actionHref}
          size="sm">
          {t(actionLabel)}
        </Button>
      )}
    </aside>
  );
}

export { BillingStatusWidget };
