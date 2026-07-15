import { getTRPCContext } from "app/_trpc/context";
import { _generateMetadata } from "app/_utils";
import { redirect } from "next/navigation";
import { CreateOrganization, safeReturnTo } from "~/organizations/CreateOrganization";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("organization_bootstrap_title"),
    (t) => t("organization_bootstrap_description"),
    undefined,
    undefined,
    "/settings/organizations/new"
  );

export default async function CreateOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ interval?: string; returnTo?: string }>;
}) {
  const [context, params] = await Promise.all([getTRPCContext(), searchParams]);
  if (!context.user) redirect("/auth/login?callbackUrl=/settings/organizations/new");

  const checkoutInterval =
    params.interval === "MONTH" || params.interval === "YEAR" ? params.interval : undefined;
  return <CreateOrganization checkoutInterval={checkoutInterval} returnTo={safeReturnTo(params.returnTo)} />;
}
