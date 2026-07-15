import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { CompletionView } from "~/onboarding/complete/completion-view";
import { getAcceptedOrganizationContexts } from "~/onboarding/lib/getAcceptedOrganizationContexts";

export default async function OnboardingCompletePage() {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) redirect("/auth/login");

  const acceptedOrganizations = await getAcceptedOrganizationContexts({
    preferredOrganizationId: session.user.org?.id,
    userId: session.user.id,
  });

  return (
    <CompletionView acceptedOrganizations={acceptedOrganizations} userEmail={session.user.email ?? ""} />
  );
}
