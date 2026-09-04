import { billingRouter } from "@calcom/trpc/server/routers/viewer/billing/_router";
import { BillingSettings } from "@calcom/web/modules/billing/BillingSettings";
import { createRouterCaller, getTRPCContext } from "app/_trpc/context";
import { _generateMetadata } from "app/_utils";
import { redirect } from "next/navigation";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("billing"),
    (t) => t("billing_settings_description"),
    undefined,
    undefined,
    "/settings/billing"
  );

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout_id?: string; organizationId?: string }>;
}) {
  const [context, params] = await Promise.all([getTRPCContext(), searchParams]);
  if (!context.session?.user?.id) redirect("/auth/login?callbackUrl=/settings/billing");

  const parsedOrganizationId = Number(params.organizationId);
  const organizationId =
    Number.isInteger(parsedOrganizationId) && parsedOrganizationId > 0 ? parsedOrganizationId : undefined;
  const caller = await createRouterCaller(billingRouter, context);
  const initialProjection = await caller.get(organizationId === undefined ? {} : { organizationId });

  return (
    <BillingSettings
      checkoutId={params.checkout_id}
      initialProjection={initialProjection}
      organizationId={organizationId}
    />
  );
}
