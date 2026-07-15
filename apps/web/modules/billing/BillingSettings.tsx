"use client";

import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { BillingInterval } from "@calcom/prisma/enums";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import { Alert } from "@calcom/ui/components/alert";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { Icon } from "@calcom/ui/components/icon";
import { showToast } from "@calcom/ui/components/toast";
import { useEffect, useMemo, useRef } from "react";

type BillingProjection = RouterOutputs["viewer"]["billing"]["get"];
type BillingSettingsViewProps = {
  checkoutPending: boolean;
  isMutating: boolean;
  onCancel(): void;
  onChangeInterval(interval: BillingInterval): void;
  onOpenPortal(): void;
  onReconcile(): void;
  projection: BillingProjection;
};

const activeStatuses = new Set(["ACTIVE", "TRIALING", "PAST_DUE"]);

function formatDate(value: Date | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" }).format(value);
}

function statusBadge(status: BillingProjection["status"]): "gray" | "orange" | "red" | "success" {
  if (status === "ACTIVE" || status === "TRIALING") return "success";
  if (status === "PAST_DUE") return "orange";
  if (status === "UNPAID") return "red";
  return "gray";
}

function BillingSettingsView({
  checkoutPending,
  isMutating,
  onCancel,
  onChangeInterval,
  onOpenPortal,
  onReconcile,
  projection,
}: BillingSettingsViewProps) {
  const { t } = useLocale();
  const isPaid = projection.plan !== "FREE" && activeStatuses.has(projection.status);
  const periodEnd = formatDate(projection.currentPeriodEnd);
  const otherInterval = projection.interval === "MONTH" ? "YEAR" : "MONTH";

  return (
    <SettingsHeader title={t("billing")} description={t("billing_settings_description")}>
      <div className="space-y-6">
        {checkoutPending && !isPaid ? (
          <Alert
            actions={
              <Button color="minimal" loading={isMutating} onClick={onReconcile} size="sm">
                {t("billing_check_status")}
              </Button>
            }
            message={t("billing_checkout_pending_description")}
            severity="info"
            title={t("billing_checkout_pending_title")}
          />
        ) : null}
        {checkoutPending && isPaid ? (
          <Alert
            message={t("billing_checkout_active_description")}
            severity="info"
            title={t("billing_checkout_active_title")}
          />
        ) : null}

        <section className="border-subtle overflow-hidden rounded-xl border bg-default">
          <div className="flex flex-col justify-between gap-5 p-6 sm:flex-row sm:items-start">
            <div>
              <p className="text-subtle text-xs font-medium uppercase tracking-[0.16em]">
                {projection.subject.type === "USER"
                  ? t("billing_personal_subscription")
                  : t("billing_organization_subscription")}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <h2 className="font-cal text-emphasis text-3xl font-semibold">
                  {t(`billing_plan_${projection.plan.toLowerCase()}`)}
                </h2>
                <Badge variant={statusBadge(projection.status)}>
                  {t(`billing_status_${projection.status.toLowerCase()}`)}
                </Badge>
              </div>
              {projection.plan === "TEAM" ? (
                <p className="text-subtle mt-2 text-sm">
                  {t("billing_seat_count", { count: projection.seatCount })}
                </p>
              ) : null}
            </div>
            {isPaid ? (
              <Button color="secondary" loading={isMutating} onClick={onOpenPortal} StartIcon="external-link">
                {t("billing_open_portal")}
              </Button>
            ) : (
              <Button color="primary" href="/pricing">
                {t("billing_compare_plans")}
              </Button>
            )}
          </div>

          <div className="border-subtle grid border-t sm:grid-cols-3">
            <div className="border-subtle p-5 sm:border-r">
              <p className="text-subtle text-xs">{t("billing_interval")}</p>
              <p className="text-emphasis mt-1 text-sm font-medium">
                {projection.interval ? t(`billing_interval_${projection.interval.toLowerCase()}`) : "—"}
              </p>
            </div>
            <div className="border-subtle p-5 sm:border-r">
              <p className="text-subtle text-xs">
                {projection.cancelAtPeriodEnd ? t("billing_access_until") : t("billing_next_billing_date")}
              </p>
              <p className="text-emphasis mt-1 text-sm font-medium">{periodEnd ?? "—"}</p>
            </div>
            <div className="p-5">
              <p className="text-subtle text-xs">{t("billing_subject")}</p>
              <p className="text-emphasis mt-1 text-sm font-medium">
                {projection.subject.type === "USER" ? t("billing_you") : t("billing_your_organization")}
              </p>
            </div>
          </div>
        </section>

        {projection.cancelAtPeriodEnd ? (
          <Alert
            message={periodEnd ? t("billing_cancellation_date", { date: periodEnd }) : undefined}
            severity="warning"
            title={t("billing_cancels_at_period_end")}
          />
        ) : null}

        {isPaid ? (
          <section className="border-subtle rounded-xl border bg-default">
            <div className="border-subtle flex items-start gap-3 border-b p-5">
              <Icon className="text-subtle mt-0.5 h-5 w-5" name="refresh-cw" />
              <div>
                <h3 className="text-emphasis text-sm font-semibold">{t("billing_plan_controls")}</h3>
                <p className="text-subtle mt-1 text-sm">{t("billing_plan_controls_description")}</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 p-5 sm:flex-row">
              <Button
                aria-label={t(
                  otherInterval === "YEAR" ? "billing_switch_to_annual" : "billing_switch_to_monthly"
                )}
                color="secondary"
                disabled={isMutating}
                onClick={() => onChangeInterval(otherInterval)}>
                {t(otherInterval === "YEAR" ? "billing_switch_to_annual" : "billing_switch_to_monthly")}
              </Button>
              {!projection.cancelAtPeriodEnd ? (
                <Button
                  aria-label={t("billing_cancel_plan")}
                  color="destructive"
                  disabled={isMutating}
                  onClick={onCancel}>
                  {t("billing_cancel_plan")}
                </Button>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </SettingsHeader>
  );
}

function BillingSettings({
  checkoutId,
  initialProjection,
  organizationId,
}: {
  checkoutId?: string;
  initialProjection: BillingProjection;
  organizationId?: number;
}) {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const subject = useMemo(() => (organizationId === undefined ? {} : { organizationId }), [organizationId]);
  const query = trpc.viewer.billing.get.useQuery(subject, {
    initialData: initialProjection,
    refetchInterval: ({ state }) => (checkoutId && state.data?.status === "NONE" ? 2_000 : false),
  });
  const reconciledCheckout = useRef<string | undefined>(undefined);
  const invalidate = () => utils.viewer.billing.get.invalidate(subject);
  const mutationOptions = {
    onError: () => showToast(t("billing_action_error"), "error"),
    onSuccess: async () => {
      await invalidate();
      showToast(t("billing_action_updated"), "success");
    },
  };
  const reconcile = trpc.viewer.billing.reconcile.useMutation(mutationOptions);
  const cancel = trpc.viewer.billing.cancelAtPeriodEnd.useMutation(mutationOptions);
  const changePlan = trpc.viewer.billing.changePlan.useMutation(mutationOptions);
  const portal = trpc.viewer.billing.createPortalSession.useMutation({
    onError: mutationOptions.onError,
    onSuccess: ({ portalUrl }) => window.location.assign(portalUrl),
  });

  useEffect(() => {
    if (!checkoutId || reconciledCheckout.current === checkoutId) return;
    reconciledCheckout.current = checkoutId;
    reconcile.mutate(subject);
  }, [checkoutId, reconcile, subject]);

  if (query.isPending) {
    return <div className="bg-subtle h-72 animate-pulse rounded-xl" aria-label={t("loading")} />;
  }
  if (!query.data || query.isError) {
    return <Alert message={t("billing_load_error")} severity="error" />;
  }

  const isMutating = cancel.isPending || changePlan.isPending || portal.isPending || reconcile.isPending;
  return (
    <BillingSettingsView
      checkoutPending={Boolean(checkoutId)}
      isMutating={isMutating}
      onCancel={() => {
        if (window.confirm(t("billing_cancel_confirmation"))) cancel.mutate(subject);
      }}
      onChangeInterval={(interval) => {
        if (query.data.plan === "FREE") return;
        if (query.data.plan === "PRO") changePlan.mutate({ interval, plan: "PRO" });
        if (query.data.plan === "TEAM" && organizationId !== undefined) {
          changePlan.mutate({ interval, organizationId, plan: "TEAM" });
        }
      }}
      onOpenPortal={() => portal.mutate(subject)}
      onReconcile={() => reconcile.mutate(subject)}
      projection={query.data}
    />
  );
}

export { BillingSettings, BillingSettingsView };
