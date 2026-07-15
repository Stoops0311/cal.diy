"use client";

import type { PaidPlanKey } from "@calcom/features/billing/lib/plans";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { showToast } from "@calcom/ui/components/toast";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { PaidSelection } from "./PlanSelector";
import { normalizeRelativePath } from "./upgradeIntent";

export type CheckoutContext = { selection: PaidSelection; organizationId?: number };

export function usePaidPlanCheckout(
  options: {
    organizationId?: number;
    returnTo?: string;
    onBeforeNavigate?(context: CheckoutContext): void;
  } = {}
): {
  pendingPlan?: PaidPlanKey;
  startCheckout(selection: PaidSelection, organizationIdOverride?: number): void;
} {
  const { t } = useLocale();
  const push = useRouter().push;
  const checkout = trpc.viewer.billing.createCheckout.useMutation({
    onError: () => showToast(t("billing_checkout_error"), "error"),
    onSuccess: ({ checkoutUrl }: { checkoutUrl: string }) => window.location.assign(checkoutUrl),
  });

  const mutate = checkout.mutate;
  const startCheckout = useCallback(
    (selection: PaidSelection, organizationIdOverride?: number): void => {
      if (selection.plan === "PRO") {
        options.onBeforeNavigate?.({ selection });
        mutate(selection);
        return;
      }
      const organizationId = organizationIdOverride ?? options.organizationId;
      const context: CheckoutContext = { selection };
      if (organizationId !== undefined) context.organizationId = organizationId;
      options.onBeforeNavigate?.(context);
      if (organizationId === undefined) {
        const returnTo = normalizeRelativePath(options.returnTo ?? "/pricing") ?? "/pricing";
        push(
          `/settings/organizations/new?returnTo=${encodeURIComponent(returnTo)}&interval=${selection.interval}`
        );
        return;
      }
      mutate({ ...selection, organizationId });
    },
    [mutate, options.onBeforeNavigate, options.organizationId, options.returnTo, push]
  );

  let pendingPlan: PaidPlanKey | undefined;
  if (checkout.isPending) pendingPlan = checkout.variables?.plan;
  return { pendingPlan, startCheckout };
}
