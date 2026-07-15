import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { APP_NAME } from "@calcom/lib/constants";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { _generateMetadata } from "app/_utils";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { OnboardingView } from "~/onboarding/getting-started/onboarding-view";
import { getAcceptedOrganizationContexts } from "~/onboarding/lib/getAcceptedOrganizationContexts";

export const generateMetadata = async () => {
  return await _generateMetadata(
    (t) => `${APP_NAME} - ${t("getting_started")}`,
    () => "",
    true,
    undefined,
    "/onboarding/getting-started"
  );
};

const ServerPage = async () => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });

  if (!session?.user?.id) {
    return redirect("/auth/login");
  }

  const acceptedOrganizations = await getAcceptedOrganizationContexts({
    preferredOrganizationId: session.user.org?.id,
    userId: session.user.id,
  });
  const onboardingProps = {
    acceptedOrganization: acceptedOrganizations[0] ?? null,
    userEmail: session.user.email ?? "",
  };

  return <OnboardingView {...onboardingProps} />;
};

export default ServerPage;
