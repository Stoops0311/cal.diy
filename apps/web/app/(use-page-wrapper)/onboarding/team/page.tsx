import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { BringTeamView } from "~/onboarding/team/bring-team-view";

export default async function BringTeamPage() {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });

  if (!session?.user?.id) redirect("/auth/login");

  return <BringTeamView userEmail={session.user.email ?? ""} />;
}
