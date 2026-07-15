import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { _generateMetadata } from "app/_utils";
import { cookies, headers } from "next/headers";
import { PricingPage } from "~/billing/Pricing";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("pricing"),
    (t) => t("billing_pricing_description"),
    undefined,
    undefined,
    "/pricing"
  );

export default async function PricingRoute({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const [session, params] = await Promise.all([
    getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) }),
    searchParams,
  ]);
  const organizationId = Number(params.organizationId);

  return (
    <PricingPage
      isAuthenticated={Boolean(session?.user?.id)}
      organizationId={Number.isInteger(organizationId) && organizationId > 0 ? organizationId : undefined}
    />
  );
}
