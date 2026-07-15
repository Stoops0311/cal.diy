import { getAuthProvider } from "@calcom/features/auth/lib/authProvider";
import { buildLegacyCtx } from "@lib/buildLegacyCtx";
import type { PageProps } from "app/_types";
import { _generateMetadata } from "app/_utils";
import { cookies, headers } from "next/headers";
import { ClerkLogout } from "~/auth/clerk-auth";
import Logout from "~/auth/logout-view";

export const generateMetadata = async () => {
  return await _generateMetadata(
    (t) => t("logged_out"),
    (t) => t("youve_been_logged_out"),
    undefined,
    undefined,
    "/auth/logout"
  );
};

const Page = async ({ params, searchParams }: PageProps) => {
  const query = await searchParams;
  if (getAuthProvider() === "clerk") return <ClerkLogout survey={query.survey === "true"} />;

  // cookie will be cleared in `/apps/web/proxy.ts`
  const h = await headers();
  const context = buildLegacyCtx(h, await cookies(), await params, query);

  return <Logout query={context.query} />;
};

export default Page;
